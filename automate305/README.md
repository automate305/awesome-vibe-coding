# Automate305 prospect feed wiring

Connects `automate305_hvac_prospect_feed_v2.html` to HubSpot, the DBPR weekly
refresh, and Clay enrichment.

**Architecture:** the HTML never holds an API key. A small localhost server
(`hubspot/bridge.mjs`) holds the token, and the page talks to it on
`127.0.0.1:4305`. Nothing is exposed beyond your Mac.

```
prospect feed HTML  ──►  bridge.mjs (localhost:4305)  ──►  HubSpot API
       ▲                        │
       └── status indicators ◄──┴──►  dbpr-last-run.json, enriched-emails.json
```

---

## Setup (~5 minutes)

```bash
# 1. Put this folder somewhere stable
cp -R automate305 ~/automate305
cd ~/automate305

# 2. Add your HubSpot token
cp .env.example .env
open -e .env          # paste HUBSPOT_TOKEN, save

# 3. Start the bridge (leave this terminal open)
node hubspot/bridge.mjs
```

Expected:

```
[automate305] HubSpot bridge on http://127.0.0.1:4305
[automate305] .env files found: /Users/camilog/automate305/.env
[automate305] HubSpot token: loaded
```

Then in a second terminal:

```bash
# 4. Verify the token and create the custom properties
curl -s localhost:4305/health | python3 -m json.tool
curl -s -X POST localhost:4305/ensure-properties | python3 -m json.tool

# 5. Patch the feed HTML (backs up the original first)
node ~/automate305/hubspot/patch-feed.mjs \
  "/Users/camilog/Downloads/automate305_hvac_prospect_feed_v2.html"

# 6. Open it
open "/Users/camilog/Downloads/automate305_hvac_prospect_feed_v2.html"
```

All three indicators turn green on load. `Export HubSpot CSV` becomes
`Push to HubSpot`, and an `Enrich Selected` button appears next to it.

---

## Field mapping

| Feed column    | HubSpot destination                              |
|----------------|--------------------------------------------------|
| `company_name` | Company `name` + Contact `company`                |
| `owner_name`   | Contact `firstname` / `lastname`                  |
| `phone`        | Contact + Company `phone`                         |
| `area`         | `city` (state hardcoded to FL)                    |
| `vertical`     | custom `vertical` — HVAC \| Restoration           |
| `priority`     | custom `lead_priority` — HOT \| WARM \| COLD      |
| `rating`       | custom `google_rating` (number)                   |
| `notes`        | Note associated to the contact and company        |
| `status`       | `hs_lead_status` (mapped to HubSpot's enum)       |

Status mapping: `New→NEW`, `No Answer`/`Voicemail`→`ATTEMPTED_TO_CONTACT`,
`Connected`→`CONNECTED`, `Nurture`→`BAD_TIMING`, `Meeting Booked`→`OPEN_DEAL`,
`Not Interested`→`UNQUALIFIED`. Anything unrecognized falls back to `NEW`.

**Deduping** — two things about your portal (245205090) shaped this logic:

1. Your phones are stored as `+1 305-681-8800`. Searching the raw `phone`
   property for a digit string returns nothing, so matching uses
   `hs_searchable_calculated_phone_number`, HubSpot's normalized copy.
2. **Phone alone is not unique in your data** — 11 of your existing contacts
   share `+1 305-681-8800` (a shared main line). Matching on phone alone would
   have overwritten a real person with whoever you pushed.

So: contacts match on **email** when present, otherwise on **phone AND last
name** together. Companies match on exact name. Re-pushing the same list updates
rather than duplicates, and an identical note is not added twice — safe to hit
Push repeatedly during a call session.

You already have **530 contacts** loaded (Jul 25), **94 of them without an
email** — that's your Clay enrichment target.

---

## Terminal fallback (no browser)

If `patch-feed.mjs` can't match your markup, this path still gets contacts into
HubSpot. Same client, same dedupe, same mapping — it just skips the HTML.

```bash
# See exactly how the CSV maps, without sending anything
node hubspot/push-csv.mjs "/Users/camilog/Desktop/DBPR HVAC Import Script - Cursor/data/leads/dbpr-hvac-filtered.csv" --dry-run

# Push 3 first and eyeball them in HubSpot
node hubspot/push-csv.mjs leads.csv --limit 3

# Then the rest
node hubspot/push-csv.mjs leads.csv
```

Headers are matched loosely (`company`/`business`/`dba`, `owner`/`licensee`/
`contact`, `city`/`area`, …), and it reports any field it couldn't map.

---

## DBPR weekly refresh

```bash
# Install the script into the DBPR project
cp dbpr/dbpr-refresh.sh "/Users/camilog/Desktop/DBPR HVAC Import Script - Cursor/scripts/"
chmod +x "/Users/camilog/Desktop/DBPR HVAC Import Script - Cursor/scripts/dbpr-refresh.sh"

# Test it once by hand before scheduling
"/Users/camilog/Desktop/DBPR HVAC Import Script - Cursor/scripts/dbpr-refresh.sh"

# Schedule it: Mondays 06:00 local (follows EST/EDT automatically)
cp dbpr/com.automate305.dbpr-refresh.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.automate305.dbpr-refresh.plist

# Confirm it registered, and force a run to prove it works
launchctl list | grep automate305
launchctl start com.automate305.dbpr-refresh
tail -f ~/Library/Logs/automate305-dbpr.log
```

The script writes `data/leads/dbpr-last-run.json`, which the bridge serves at
`/dbpr-status` and the feed reads to show the "last updated" date.

To remove: `launchctl unload ~/Library/LaunchAgents/com.automate305.dbpr-refresh.plist`

**Note:** the import script is invoked as
`tsx scripts/dbpr-import.ts --input <raw> --output <filtered>`. If your script
uses different flags, edit the two `tsx` lines in `dbpr-refresh.sh`.

---

## Clay enrichment

Clay is connected over MCP in the Claude session, not by API key, so the browser
cannot call it directly. The flow is:

```bash
# Enrich Selected writes the pending rows to data/leads/enrich-queue.json.
# Print them:
node clay/enrich.mjs --print-batch

# Paste that into Claude with Clay connected: "enrich these through Clay,
# return JSON of [{company_name, owner_name, email}]". Save the reply, then:
node clay/enrich.mjs --merge clay-results.json
```

Click `Enrich Selected` again and the rows flip to **Enriched**.

If you get a Clay API key, put it in `.env` as `CLAY_API_KEY` and
`node clay/enrich.mjs` runs the whole loop unattended.

Results cache in `data/leads/enriched-emails.json`, keyed
`company_name|owner_name` lowercased. Cached contacts are never re-enriched.

---

## Make.com blueprints

Import via Make → Create new scenario → ⋯ → Import Blueprint.

- `make-blueprints/scenario-1-meeting-booked.json`
- `make-blueprints/scenario-2-nurture.json`

After importing, assign your HubSpot and Gmail connections (they import
unassigned by design — no credentials are in these files), and copy Scenario 1's
webhook URL into Cal.com as a `BOOKING_CREATED` webhook.

**Scenario 2 caveat:** Make's Sleep module maxes out at 300 seconds, so the
"wait 2 days" step cannot work as a literal sleep on the free tier. The note on
module 4 in the blueprint spells out the daily-run pattern that replaces it.
Read that before switching the scenario on.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Indicators stay orange | Bridge isn't running. `node hubspot/bridge.mjs` |
| "Bridge unreachable" on push | Same — check the bridge terminal |
| `/health` says `no-token` | `HUBSPOT_TOKEN` missing or empty in `.env` |
| Push returns 403 | Private app is missing a scope; see `.env.example` |
| "No prospects found on the page" | Table headers differ from expected; see `readProspects` in `feed-wiring.js` |
| Indicator text didn't change | `patch-feed.mjs` printed `[MISSING]` for it — the markup differs |

Undo the HTML patch at any time — `patch-feed.mjs` prints the backup path, and
re-running it replaces the previous injection rather than stacking a second copy.
