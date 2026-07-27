#!/usr/bin/env node
/**
 * Clay enrichment worker for the prospect feed.
 *
 * Reads the queue the "Enrich Selected" button writes, resolves emails, and
 * merges them into data/leads/enriched-emails.json. Contacts already present in
 * that file are skipped, so nothing is ever re-enriched (and never re-billed).
 *
 * Two modes:
 *
 *   1. API mode  — set CLAY_API_KEY in automate305/.env and run:
 *                    node automate305/clay/enrich.mjs
 *
 *   2. MCP mode  — Clay is connected over MCP in a Claude session rather than by
 *                  API key. Run with --print-batch to get the pending rows, hand
 *                  them to Claude ("enrich these through Clay"), save what comes
 *                  back to a file, then merge it:
 *                    node automate305/clay/enrich.mjs --print-batch
 *                    node automate305/clay/enrich.mjs --merge clay-results.json
 *
 * The cache key is `company_name|owner_name`, lowercased.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const LEADS_DIR = process.env.LEADS_DIR || resolve(ROOT, 'data/leads');
const QUEUE_FILE = resolve(LEADS_DIR, 'enrich-queue.json');
const ENRICHED_FILE = resolve(LEADS_DIR, 'enriched-emails.json');
const FILTERED_CSV = resolve(LEADS_DIR, 'dbpr-hvac-filtered.csv');

function envValue(key) {
  if (process.env[key]) return process.env[key];
  const file = resolve(ROOT, '.env');
  if (!existsSync(file)) return '';
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m && m[1] === key) return m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return '';
}

const cacheKey = (p) => `${p.company_name || ''}|${p.owner_name || ''}`.toLowerCase().trim();

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Falls back to the DBPR CSV when the browser queue is empty. */
async function loadPending(cache) {
  const queued = (await readJson(QUEUE_FILE, {})).prospects;
  let rows = Array.isArray(queued) ? queued : [];

  if (!rows.length && existsSync(FILTERED_CSV)) {
    const [head, ...lines] = (await readFile(FILTERED_CSV, 'utf8')).trim().split('\n');
    const cols = head.split(',').map((c) => c.trim().replace(/^"|"$/g, '').toLowerCase());
    const pick = (cells, ...names) => {
      for (const n of names) {
        const i = cols.findIndex((c) => c.includes(n));
        if (i !== -1) return (cells[i] || '').replace(/^"|"$/g, '').trim();
      }
      return '';
    };
    rows = lines.map((line) => {
      const cells = line.split(',');
      return {
        company_name: pick(cells, 'company', 'business', 'dba', 'name'),
        owner_name: pick(cells, 'owner', 'licensee', 'contact'),
        area: pick(cells, 'city', 'area'),
        email: pick(cells, 'email'),
        priority: pick(cells, 'priority') || 'HOT',
      };
    });
  }

  return rows.filter((p) => !p.email && !cache[cacheKey(p)] && (p.company_name || p.owner_name));
}

async function enrichViaApi(rows, apiKey) {
  const found = {};
  for (const p of rows) {
    try {
      const res = await fetch('https://api.clay.com/v3/enrichment/person', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: p.owner_name,
          company_name: p.company_name,
          location: p.area ? `${p.area}, FL` : 'Florida',
        }),
      });
      if (!res.ok) {
        console.log(`  [${res.status}] ${p.company_name} — ${await res.text()}`);
        continue;
      }
      const data = await res.json();
      const email = data.email || data.work_email || data.person?.email || '';
      if (email) {
        found[cacheKey(p)] = email;
        console.log(`  [Enriched]  ${p.owner_name} @ ${p.company_name} -> ${email}`);
      } else {
        console.log(`  [Not Found] ${p.owner_name} @ ${p.company_name}`);
      }
    } catch (err) {
      console.log(`  [error] ${p.company_name}: ${err.message}`);
    }
  }
  return found;
}

// --------------------------------------------------------------------- main

const args = process.argv.slice(2);
const cache = await readJson(ENRICHED_FILE, {});
await mkdir(LEADS_DIR, { recursive: true });

if (args.includes('--merge')) {
  const file = args[args.indexOf('--merge') + 1];
  if (!file) {
    console.error('Usage: node enrich.mjs --merge <clay-results.json>');
    process.exit(1);
  }
  // Accepts { "company|owner": "email" } or [{ company_name, owner_name, email }]
  const incoming = await readJson(resolve(process.cwd(), file), null);
  if (!incoming) {
    console.error(`Could not read ${file}`);
    process.exit(1);
  }
  const merged = { ...cache };
  let added = 0;
  if (Array.isArray(incoming)) {
    for (const row of incoming) {
      if (!row.email) continue;
      merged[cacheKey(row)] = row.email;
      added++;
    }
  } else {
    for (const [k, v] of Object.entries(incoming)) {
      if (!v) continue;
      merged[k.toLowerCase()] = v;
      added++;
    }
  }
  await writeFile(ENRICHED_FILE, JSON.stringify(merged, null, 2));
  console.log(`Merged ${added} emails. ${ENRICHED_FILE} now holds ${Object.keys(merged).length}.`);
  process.exit(0);
}

const pending = await loadPending(cache);
console.log(`Cache: ${Object.keys(cache).length} known emails. Pending: ${pending.length}.`);

if (!pending.length) {
  console.log('Nothing to enrich.');
  process.exit(0);
}

if (args.includes('--print-batch')) {
  console.log('\nHand this to Claude with Clay connected, ask for emails back as JSON:\n');
  console.log(JSON.stringify(pending.map(({ company_name, owner_name, area }) => ({ company_name, owner_name, area })), null, 2));
  process.exit(0);
}

const apiKey = envValue('CLAY_API_KEY');
if (!apiKey) {
  console.error('\nNo CLAY_API_KEY in automate305/.env.');
  console.error('Clay is MCP-only in your Claude session, so use the MCP path instead:');
  console.error('  node automate305/clay/enrich.mjs --print-batch');
  process.exit(2);
}

console.log(`Enriching ${pending.length} contacts through Clay…`);
const found = await enrichViaApi(pending, apiKey);
const merged = { ...cache, ...found };
await writeFile(ENRICHED_FILE, JSON.stringify(merged, null, 2));
console.log(`\nFound ${Object.keys(found).length}. Cache now holds ${Object.keys(merged).length}.`);
