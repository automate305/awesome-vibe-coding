#!/usr/bin/env node
/**
 * Pushes a prospect CSV straight to HubSpot from the terminal.
 *
 * This is the fallback path: it needs no browser and no HTML patching, so it
 * works even if patch-feed.mjs can't match the feed's markup. Same client,
 * same dedupe, same field mapping as the bridge.
 *
 *   node hubspot/push-csv.mjs leads.csv --dry-run    # show what would happen
 *   node hubspot/push-csv.mjs leads.csv              # actually push
 *   node hubspot/push-csv.mjs leads.csv --limit 5    # push the first 5 only
 *
 * Column headers are matched loosely, so the DBPR export and a hand-made CSV
 * both work. Recognized: company, owner/contact, phone, email, city/area,
 * vertical, priority, rating, status, notes.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { TOKEN, ENV_SOURCES, ensureProperties, pushProspects, splitName, leadStatus } from './client.mjs';

// ------------------------------------------------------------------- args

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;
const file = args.find((a) => !a.startsWith('--') && a !== String(limit));

if (!file) {
  console.error('Usage: node hubspot/push-csv.mjs <file.csv> [--dry-run] [--limit N]');
  process.exit(1);
}

// -------------------------------------------------------------- csv parse

/** RFC4180-ish parser: handles quoted fields, embedded commas, and "" escapes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim()));
}

const text = await readFile(resolve(process.cwd(), file), 'utf8');
const rows = parseCsv(text);
if (rows.length < 2) {
  console.error('CSV has no data rows.');
  process.exit(1);
}

const headers = rows[0].map((h) => h.trim().toLowerCase());
const findCol = (...names) => {
  for (const n of names) {
    const i = headers.findIndex((h) => h.includes(n));
    if (i !== -1) return i;
  }
  return -1;
};

const COLS = {
  company_name: findCol('company', 'business', 'dba', 'organization'),
  owner_name: findCol('owner', 'licensee', 'contact name', 'contact', 'full name'),
  phone: findCol('phone', 'tel'),
  email: findCol('email'),
  area: findCol('area', 'city', 'location'),
  vertical: findCol('vertical', 'trade', 'type'),
  priority: findCol('priority', 'temp'),
  rating: findCol('rating', 'stars'),
  status: findCol('status', 'outcome'),
  notes: findCol('note', 'comment'),
};

const unmapped = Object.entries(COLS).filter(([, i]) => i === -1).map(([k]) => k);

const prospects = rows.slice(1).map((cells) => {
  const out = {};
  for (const [key, idx] of Object.entries(COLS)) out[key] = idx === -1 ? '' : (cells[idx] || '').trim();
  return out;
}).filter((p) => p.company_name || p.owner_name).slice(0, limit);

// ---------------------------------------------------------------- preview

console.log(`\nFile:    ${file}`);
console.log(`Headers: ${headers.join(', ')}`);
if (unmapped.length) console.log(`Unmapped (will be blank): ${unmapped.join(', ')}`);
console.log(`Rows to push: ${prospects.length}\n`);

console.log('First 3 rows as HubSpot will see them:');
for (const p of prospects.slice(0, 3)) {
  const { first, last } = splitName(p.owner_name);
  console.log(`  ${p.company_name || '(no company)'}`);
  console.log(`    contact      ${first} ${last}`.trimEnd());
  console.log(`    phone/email  ${p.phone || '—'} / ${p.email || '—'}`);
  console.log(`    city         ${p.area || '—'}`);
  console.log(`    vertical     ${p.vertical || '—'}   priority ${p.priority || '—'}   rating ${p.rating || '—'}`);
  console.log(`    lead status  ${p.status || '(blank)'} -> ${leadStatus(p.status)}`);
  console.log(`    note         ${p.notes ? p.notes.slice(0, 60) : '(none)'}`);
}

if (dryRun) {
  console.log('\n--dry-run: nothing was sent to HubSpot.');
  console.log('Re-run without --dry-run to push. Start with --limit 3 to sanity-check in the UI.\n');
  process.exit(0);
}

if (!TOKEN) {
  console.error(`\nNo HubSpot token. Checked: ${ENV_SOURCES.join(', ') || '(no .env found)'}`);
  console.error('Add HUBSPOT_TOKEN to automate305/.env and retry.\n');
  process.exit(2);
}

// ------------------------------------------------------------------- push

console.log('\nEnsuring custom properties exist…');
const props = await ensureProperties('contacts');
if (props.created.length) console.log(`  created: ${props.created.join(', ')}`);
else console.log('  all present');

console.log(`\nPushing ${prospects.length} prospects…`);
const s = await pushProspects(prospects);

console.log('\n--- Result ---');
console.log(`  contacts   ${s.contactsCreated} created, ${s.contactsUpdated} updated`);
console.log(`  companies  ${s.companiesCreated} created, ${s.companiesUpdated} updated`);
console.log(`  notes      ${s.notesCreated} created`);
if (s.failed) {
  console.log(`  FAILED     ${s.failed}`);
  for (const e of s.errors.slice(0, 10)) console.log(`    ${e.company}: ${e.error}`);
}
console.log('\nhttps://app.hubspot.com/contacts/245205090/objects/0-1/views/all/list\n');
process.exit(s.failed ? 1 : 0);
