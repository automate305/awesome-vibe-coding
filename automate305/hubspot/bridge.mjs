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
import { resolve } from 'node:path';

import { ROOT, TOKEN, ENV_SOURCES, hs, ensureProperties, pushProspects } from './client.mjs';

const PORT = Number(process.env.PORT || 4305);
const LEADS_DIR = process.env.LEADS_DIR || resolve(ROOT, 'data/leads');
const ENRICHED_FILE = resolve(LEADS_DIR, 'enriched-emails.json');
const QUEUE_FILE = resolve(LEADS_DIR, 'enrich-queue.json');
// Written by dbpr-refresh.sh; the DBPR project keeps its own data dir.
const DBPR_STAMP =
  process.env.DBPR_STAMP ||
  `${process.env.HOME}/Desktop/DBPR HVAC Import Script - Cursor/data/leads/dbpr-last-run.json`;


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
