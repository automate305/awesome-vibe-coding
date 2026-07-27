#!/usr/bin/env node
/**
 * Automate305 HubSpot bridge.
 *
 * A localhost-only HTTP server that the prospect feed HTML talks to. It holds the
 * HubSpot private-app token (loaded from .env, never from the browser) and does the
 * company/contact/note upserts against the HubSpot v3 CRM API.
 *
 * Endpoints:
 *   GET  /health            -> { ok, portalId, propertiesReady }
 *   POST /ensure-properties -> creates the custom properties the feed maps to
 *   POST /push              -> { prospects: [...] } upsert companies + contacts + notes
 *   GET  /enriched          -> contents of data/leads/enriched-emails.json
 *   POST /enrich-queue      -> { prospects: [...] } queue leads for Clay enrichment
 *
 * Run: node automate305/hubspot/bridge.mjs
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PORT = Number(process.env.PORT || 4305);
const LEADS_DIR = process.env.LEADS_DIR || resolve(ROOT, 'data/leads');
const ENRICHED_FILE = resolve(LEADS_DIR, 'enriched-emails.json');
const QUEUE_FILE = resolve(LEADS_DIR, 'enrich-queue.json');
// Written by dbpr-refresh.sh; the DBPR project keeps its own data dir.
const DBPR_STAMP =
  process.env.DBPR_STAMP ||
  `${process.env.HOME}/Desktop/DBPR HVAC Import Script - Cursor/data/leads/dbpr-last-run.json`;

// ---------------------------------------------------------------- env loading

/** Minimal .env reader. Checked in priority order; first hit for a key wins. */
function loadEnv() {
  const candidates = [
    process.env.A305_ENV_FILE,
    resolve(ROOT, '.env'),
    `${process.env.HOME}/.gtm-os/.env`,
    `${process.env.HOME}/Desktop/DBPR HVAC Import Script - Cursor/.env`,
    `${process.env.HOME}/Desktop/DBPR HVAC Import Script - Cursor/.env.local`,
  ].filter(Boolean);

  const found = {};
  const sources = [];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    sources.push(file);
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
      if (!m) continue;
      const key = m[1];
      const value = m[2].trim().replace(/^['"]|['"]$/g, '');
      if (!(key in found) && value) found[key] = value;
    }
  }
  return { vars: { ...found, ...process.env }, sources };
}

const { vars: ENV, sources: ENV_SOURCES } = loadEnv();
const TOKEN =
  ENV.HUBSPOT_TOKEN ||
  ENV.HUBSPOT_ACCESS_TOKEN ||
  ENV.HUBSPOT_PRIVATE_APP_TOKEN ||
  ENV.HUBSPOT_API_KEY ||
  '';

// ------------------------------------------------------------- hubspot client

const HS = 'https://api.hubapi.com';

async function hs(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${HS}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(json.message || `HubSpot ${res.status} on ${path}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// ------------------------------------------------------------ field mapping

const LEAD_STATUS = {
  NEW: 'NEW',
  OPEN: 'OPEN',
  'IN PROGRESS': 'IN_PROGRESS',
  IN_PROGRESS: 'IN_PROGRESS',
  'OPEN DEAL': 'OPEN_DEAL',
  UNQUALIFIED: 'UNQUALIFIED',
  'NOT INTERESTED': 'UNQUALIFIED',
  ATTEMPTED: 'ATTEMPTED_TO_CONTACT',
  'ATTEMPTED TO CONTACT': 'ATTEMPTED_TO_CONTACT',
  'NO ANSWER': 'ATTEMPTED_TO_CONTACT',
  VOICEMAIL: 'ATTEMPTED_TO_CONTACT',
  CONNECTED: 'CONNECTED',
  CONTACTED: 'CONNECTED',
  'BAD TIMING': 'BAD_TIMING',
  NURTURE: 'BAD_TIMING',
  'MEETING BOOKED': 'OPEN_DEAL',
};

function leadStatus(raw) {
  if (!raw) return 'NEW';
  return LEAD_STATUS[String(raw).trim().toUpperCase()] || 'NEW';
}

/** Splits "Jose Martinez" / "Martinez, Jose" into first + last. */
function splitName(owner) {
  const name = String(owner || '').trim();
  if (!name) return { first: '', last: '' };
  if (name.includes(',')) {
    const [last, first] = name.split(',').map((s) => s.trim());
    return { first: first || '', last: last || '' };
  }
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/** Digits-only phone, so search matches regardless of formatting. */
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

// -------------------------------------------------------- custom properties

const CUSTOM_PROPERTIES = [
  {
    name: 'vertical',
    label: 'Vertical',
    type: 'enumeration',
    fieldType: 'select',
    options: ['HVAC', 'Restoration'],
  },
  {
    name: 'lead_priority',
    label: 'Lead Priority',
    type: 'enumeration',
    fieldType: 'select',
    options: ['HOT', 'WARM', 'COLD'],
  },
  { name: 'google_rating', label: 'Google Rating', type: 'number', fieldType: 'number' },
  {
    name: 'call_outcome',
    label: 'Call Outcome',
    type: 'enumeration',
    fieldType: 'select',
    options: ['Meeting Booked', 'Nurture', 'Not Interested', 'No Answer', 'Callback'],
  },
];

async function ensureProperties(objectType = 'contacts') {
  const created = [];
  const existing = [];
  for (const prop of CUSTOM_PROPERTIES) {
    // google_rating and call_outcome only make sense on contacts.
    if (objectType === 'companies' && !['vertical', 'lead_priority'].includes(prop.name)) continue;
    try {
      await hs(`/crm/v3/properties/${objectType}/${prop.name}`);
      existing.push(prop.name);
    } catch (err) {
      if (err.status !== 404) throw err;
      await hs(`/crm/v3/properties/${objectType}`, {
        method: 'POST',
        body: {
          name: prop.name,
          label: prop.label,
          type: prop.type,
          fieldType: prop.fieldType,
          groupName: objectType === 'contacts' ? 'contactinformation' : 'companyinformation',
          description: 'Created by the Automate305 prospect feed bridge.',
          options: (prop.options || []).map((o, i) => ({
            label: o,
            value: o,
            displayOrder: i,
          })),
        },
      });
      created.push(prop.name);
    }
  }
  return { created, existing };
}

// ------------------------------------------------------------------ upserts

async function findOne(objectType, filters, properties) {
  const res = await hs(`/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    body: { filterGroups: [{ filters }], properties, limit: 1 },
  });
  return res.results?.[0] || null;
}

async function upsertCompany(p) {
  const name = String(p.company_name || '').trim();
  if (!name) return null;

  const props = {
    name,
    city: p.area || '',
    state: 'FL',
    phone: p.phone || '',
    vertical: p.vertical || '',
    lead_priority: p.priority || '',
  };
  for (const k of Object.keys(props)) if (!props[k]) delete props[k];

  const found = await findOne('companies', [{ propertyName: 'name', operator: 'EQ', value: name }], ['name']);
  if (found) {
    await hs(`/crm/v3/objects/companies/${found.id}`, { method: 'PATCH', body: { properties: props } });
    return { id: found.id, created: false };
  }
  const made = await hs('/crm/v3/objects/companies', { method: 'POST', body: { properties: props } });
  return { id: made.id, created: true };
}

async function upsertContact(p, companyId) {
  const { first, last } = splitName(p.owner_name);
  const phone = normalizePhone(p.phone);

  const props = {
    firstname: first,
    lastname: last || String(p.company_name || '').trim(),
    phone: p.phone || '',
    city: p.area || '',
    state: 'FL',
    company: p.company_name || '',
    vertical: p.vertical || '',
    lead_priority: p.priority || '',
    hs_lead_status: leadStatus(p.status),
  };
  if (p.email) props.email = p.email;
  if (p.rating !== undefined && p.rating !== null && p.rating !== '') {
    props.google_rating = String(p.rating);
  }
  for (const k of Object.keys(props)) if (props[k] === '' || props[k] === undefined) delete props[k];

  // Dedupe on email when we have one, otherwise on phone.
  let found = null;
  if (p.email) {
    found = await findOne('contacts', [{ propertyName: 'email', operator: 'EQ', value: p.email }], ['email']);
  }
  if (!found && phone) {
    found = await findOne('contacts', [{ propertyName: 'phone', operator: 'CONTAINS_TOKEN', value: phone }], ['phone']);
  }

  if (found) {
    await hs(`/crm/v3/objects/contacts/${found.id}`, { method: 'PATCH', body: { properties: props } });
    if (companyId) await associate('contacts', found.id, 'companies', companyId, 1);
    return { id: found.id, created: false };
  }

  const body = { properties: props };
  if (companyId) {
    body.associations = [
      {
        to: { id: companyId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }],
      },
    ];
  }
  const made = await hs('/crm/v3/objects/contacts', { method: 'POST', body });
  return { id: made.id, created: true };
}

async function associate(fromType, fromId, toType, toId, typeId) {
  await hs(`/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`, {
    method: 'PUT',
    body: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: typeId }],
  });
}

/** Creates the first note on a contact, skipping if an identical one exists. */
async function addNote(contactId, companyId, text) {
  const body = String(text || '').trim();
  if (!body) return false;

  const existing = await hs(`/crm/v3/objects/contacts/${contactId}/associations/notes`).catch(() => ({ results: [] }));
  if (existing.results?.length) {
    const ids = existing.results.slice(0, 10).map((r) => r.toObjectId ?? r.id);
    for (const id of ids) {
      const note = await hs(`/crm/v3/objects/notes/${id}?properties=hs_note_body`).catch(() => null);
      const have = String(note?.properties?.hs_note_body || '').replace(/<[^>]+>/g, '').trim();
      if (have === body) return false;
    }
  }

  const associations = [
    { to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] },
  ];
  if (companyId) {
    associations.push({
      to: { id: companyId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 190 }],
    });
  }
  await hs('/crm/v3/objects/notes', {
    method: 'POST',
    body: {
      properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() },
      associations,
    },
  });
  return true;
}

async function pushProspects(prospects) {
  const summary = {
    total: prospects.length,
    contactsCreated: 0,
    contactsUpdated: 0,
    companiesCreated: 0,
    companiesUpdated: 0,
    notesCreated: 0,
    failed: 0,
    errors: [],
  };

  for (const p of prospects) {
    try {
      const company = await upsertCompany(p);
      if (company?.created) summary.companiesCreated++;
      else if (company) summary.companiesUpdated++;

      const contact = await upsertContact(p, company?.id);
      if (contact.created) summary.contactsCreated++;
      else summary.contactsUpdated++;

      if (await addNote(contact.id, company?.id, p.notes)) summary.notesCreated++;
    } catch (err) {
      summary.failed++;
      summary.errors.push({ company: p.company_name || p.owner_name || '(unnamed)', error: err.message });
    }
  }
  return summary;
}

// -------------------------------------------------------------- http server

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  try {
    if (url.pathname === '/health') {
      if (!TOKEN) {
        return send(res, 200, {
          ok: false,
          reason: 'no-token',
          message: 'No HubSpot token found. Add HUBSPOT_TOKEN to automate305/.env',
          envFilesChecked: ENV_SOURCES,
        });
      }
      const me = await hs('/account-info/v3/details').catch(() => null);
      const probe = await hs('/crm/v3/objects/contacts?limit=1');
      return send(res, 200, {
        ok: true,
        portalId: me?.portalId ?? null,
        contactsVisible: Array.isArray(probe.results),
        envFilesChecked: ENV_SOURCES,
      });
    }

    if (url.pathname === '/ensure-properties' && req.method === 'POST') {
      const contacts = await ensureProperties('contacts');
      const companies = await ensureProperties('companies');
      return send(res, 200, { ok: true, contacts, companies });
    }

    if (url.pathname === '/push' && req.method === 'POST') {
      if (!TOKEN) return send(res, 400, { ok: false, error: 'No HubSpot token configured.' });
      const { prospects } = await readJson(req);
      if (!Array.isArray(prospects) || !prospects.length) {
        return send(res, 400, { ok: false, error: 'Body must be { prospects: [...] } with at least one row.' });
      }
      await ensureProperties('contacts').catch(() => {});
      const summary = await pushProspects(prospects);
      return send(res, 200, { ok: summary.failed === 0, summary });
    }

    if (url.pathname === '/dbpr-status') {
      const stamp = await readJsonFile(DBPR_STAMP, null);
      return send(res, 200, {
        ok: stamp?.status === 'ok',
        lastRun: stamp?.displayDate || null,
        rows: stamp?.filteredRows ?? null,
        error: stamp?.error || null,
        stampFile: DBPR_STAMP,
      });
    }

    if (url.pathname === '/enriched') {
      return send(res, 200, { ok: true, emails: await readJsonFile(ENRICHED_FILE, {}) });
    }

    if (url.pathname === '/enrich-queue' && req.method === 'POST') {
      const { prospects } = await readJson(req);
      await mkdir(LEADS_DIR, { recursive: true });
      await writeFile(
        QUEUE_FILE,
        JSON.stringify({ queuedAt: new Date().toISOString(), prospects: prospects || [] }, null, 2),
      );
      return send(res, 200, { ok: true, queued: (prospects || []).length, file: QUEUE_FILE });
    }

    return send(res, 404, { ok: false, error: `No route for ${req.method} ${url.pathname}` });
  } catch (err) {
    return send(res, err.status || 500, { ok: false, error: err.message, detail: err.body ?? null });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[automate305] HubSpot bridge on http://127.0.0.1:${PORT}`);
  console.log(`[automate305] .env files found: ${ENV_SOURCES.join(', ') || '(none)'}`);
  console.log(`[automate305] HubSpot token: ${TOKEN ? 'loaded' : 'MISSING — add HUBSPOT_TOKEN to automate305/.env'}`);
});
