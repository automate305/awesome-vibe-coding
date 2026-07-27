#!/usr/bin/env node
/**
 * Injects feed-wiring.js into the prospect feed HTML and reports what changed.
 *
 * Backs the original up to <file>.bak-<timestamp> before writing, and prints a
 * before/after for every status indicator it touched. Re-running is safe: the
 * previous injection is replaced, not stacked.
 *
 * Usage:
 *   node automate305/hubspot/patch-feed.mjs "/Users/camilog/Downloads/automate305_hvac_prospect_feed_v2.html"
 */

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] || `${process.env.HOME}/Downloads/automate305_hvac_prospect_feed_v2.html`;

const START = '<!-- automate305:wiring:start -->';
const END = '<!-- automate305:wiring:end -->';

const html = await readFile(target, 'utf8');
const wiring = await readFile(resolve(HERE, 'feed-wiring.js'), 'utf8');

const backup = `${target}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
await copyFile(target, backup);

// Report the indicator lines we expect the wiring to flip at runtime.
const indicators = [
  { label: 'DBPR weekly feed', pattern: /^.*DBPR weekly feed.*$/im },
  { label: 'Clay enrichment', pattern: /^.*Clay enrichment.*$/im },
  { label: 'HubSpot', pattern: /^.*HubSpot.*(placeholder|not connected|pending).*$/im },
];

console.log(`\nTarget:  ${target}`);
console.log(`Backup:  ${backup}\n`);
console.log('Status indicators found in the file:');
let missing = 0;
for (const { label, pattern } of indicators) {
  const match = html.match(pattern);
  if (match) console.log(`  [found]   ${label}: ${match[0].trim().slice(0, 110)}`);
  else {
    missing++;
    console.log(`  [MISSING] ${label} — the wiring cannot recolor what it cannot find.`);
  }
}
if (missing) {
  console.log('\n  Missing indicators mean the markup differs from what was described.');
  console.log('  The push button will still work; only the coloring needs a selector tweak.');
}

// Strip any prior injection, then append a fresh one before </body>.
const cleaned = html.replace(new RegExp(`${START}[\\s\\S]*?${END}\\n?`, 'g'), '');
const block = `${START}\n<script>\n${wiring}\n</script>\n${END}\n`;

const patched = cleaned.includes('</body>')
  ? cleaned.replace(/<\/body>/i, `${block}</body>`)
  : cleaned + block;

await writeFile(target, patched, 'utf8');

console.log('\nInjected the bridge wiring before </body>.');
console.log('  - "Export HubSpot CSV" is now "Push to HubSpot" and posts to the local bridge');
console.log('  - An "Enrich Selected" button was added next to it');
console.log('  - Indicators flip to green at page load once the bridge answers /health');
console.log(`\nTo undo:  cp "${backup}" "${target}"\n`);
