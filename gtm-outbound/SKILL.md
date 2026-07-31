# GTM Outbound Skill — Automate305 HVAC Campaign

ColdIQ methodology: Research-driven, hyper-personalized, multi-channel outbound.
Zero spray-and-pray. Every touch is earned with research.

## Campaign Summary

| Field | Value |
|-------|-------|
| Sender | Camilo, Automate305 (cam@automate305.com) |
| Target | HVAC companies in South Florida |
| Geo | Miami 33128 (40mi radius), Broward County, Palm Beach County |
| ICP | Owners/Presidents/CEOs of residential + commercial HVAC shops, 1-200 employees |
| Offer | Free business automation audit + free website rebuild |
| Channels | Email → LinkedIn → Email → Phone → Email → LinkedIn → Email |
| Daily cap | 90 emails, 50 enrichments |
| CRM | HubSpot (free) → Gmail |

## Pre-Approved Actions

Camilo has approved credit usage for this campaign. When running as a routine,
proceed without per-call confirmation for:
- Apollo company searches (HVAC + South Florida filters)
- Apollo people enrichment (owner-level titles only)
- Lusha contact lookups (email/phone verification)
- HubSpot contact creation (CONFIRMATION_WAIVED_FOR_SESSION)
- Gmail draft creation (sequence emails)

Do NOT send Gmail emails directly — always create drafts so Camilo can review
and batch-send. Only switch to direct send after Camilo explicitly approves.

## Cycle Execution

Each cycle follows five phases. Skip any phase where the daily cap is reached.

---

### Phase 0 — Load State

1. Read `gtm-outbound/data/state.json`
2. If `daily.date` ≠ today → reset all daily counters to 0, keep queue and processed_ids
3. Check caps: if all caps maxed → output "All daily caps reached" and stop

---

### Phase 1 — Search Companies (if daily.searched < 100)

Call `mcp__Apollo_io__apollo_mixed_companies_search`:

```
organization_naics_codes: ["238220"]
organization_locations: ["Miami, FL", "Fort Lauderdale, FL", "West Palm Beach, FL"]
organization_num_employees_ranges: ["1,10", "11,50", "51,200"]
per_page: 25
page: <next unprocessed page>
```

NAICS 238220 = Plumbing, Heating, and Air-Conditioning Contractors.

For each result:
- Skip if `organization.id` is already in `processed_ids`
- Add `organization.id` to `processed_ids`
- Increment `daily.searched`

Store raw results temporarily for Phase 2.

**Page tracking:** Store the last searched page number in state.json as `last_search_page`.
Increment each cycle so you don't re-search the same page.

---

### Phase 2 — Enrich Contacts (if daily.enriched < 50)

For each new company from Phase 1 (up to remaining daily enrich cap):

**Step A — Find the decision maker via Apollo:**

Call `mcp__Apollo_io__apollo_people_match`:
```
domain: <company.domain>
organization_name: <company.name>
```

Look for titles matching: Owner, President, CEO, Founder, General Manager.
If Apollo returns a match with email → use it.

**Step B — Verify/supplement with Lusha (if Apollo email missing):**

Call `mcp__Lusha__contacts_search`:
```
first_name: <from Apollo>
last_name: <from Apollo>
company_name: <company.name>
enrich: true
```

**Step C — Generate personalized first line:**

Write ONE sentence referencing something specific about this company.
Use any of these angles (pick the most relevant):

- Google review score: "Saw {{company}} has a 4.5-star rating — your customers clearly love the work."
- Years in business: "{{company}} has been serving Miami for over 15 years — that kind of track record is rare."
- Service area: "Noticed {{company}} covers all of Broward County — that's a big territory to manage."
- Website quality: "Took a look at {{company}}'s website — a few tweaks could help it convert more visitors into booked calls."
- No website: "Noticed {{company}} doesn't have a website yet — that's a big opportunity on the table."
- Hiring signal: "Saw {{company}} is hiring — growth mode usually means the back-office is getting stretched thin."

Keep it to ONE sentence for Sequence A prospects.
For Sequence B prospects, write TWO sentences + identify a `pain_point` (see email-sequence-b.md).

**Step C.5 — Assign A/B sequence:**

- No website OR weak website → Sequence A (free website carrot is relevant)
- Has decent website + Google reviews ≥ 4.0 → Sequence B (ROI angle, no website offer)
- All others → alternate A/B (even queue index = A, odd = B) to build test data

**Step D — Build queue entry:**

```json
{
  "apollo_id": "<org id>",
  "company": "<company name>",
  "domain": "<domain>",
  "first_name": "<contact first>",
  "last_name": "<contact last>",
  "email": "<verified email>",
  "phone": "<phone if available>",
  "title": "<job title>",
  "city": "<city>",
  "google_reviews": "<score if found>",
  "personalized_line": "<generated line>",
  "linkedin_url": "<if available>",
  "step": 0,
  "next_touch": "<today>",
  "status": "active",
  "hubspot_id": null,
  "added_date": "<today>",
  "sequence": "A or B",
  "linkedin_requested": false,
  "linkedin_requested_date": null,
  "linkedin_accepted": false,
  "linkedin_no_accept": false
}
```

Increment `daily.enriched`.

---

### Phase 3 — Push to HubSpot

For each queue entry where `hubspot_id` is null:

Call `mcp__HubSpot__manage_crm_objects`:
```json
{
  "confirmationStatus": "CONFIRMATION_WAIVED_FOR_SESSION",
  "createRequest": {
    "objects": [{
      "objectType": "contacts",
      "properties": {
        "firstname": "<first_name>",
        "lastname": "<last_name>",
        "email": "<email>",
        "phone": "<phone>",
        "company": "<company>",
        "jobtitle": "<title>",
        "city": "<city>",
        "state": "FL",
        "hs_lead_status": "NEW"
      }
    }]
  }
}
```

Store returned `id` as `hubspot_id` in queue entry.

Batch up to 10 contacts per HubSpot call to minimize API calls.

---

### Phase 4 — Draft Emails (if daily.emails_sent < 90)

For each queue entry where `next_touch` ≤ today AND `status` = "active":

1. Determine which email template to use based on `step` AND `sequence` (A or B):

   **Sequence A** (`gtm-outbound/copy/email-sequence.md`):
   - step 0 → "opener"
   - step 2 → "proof"
   - step 4 → "free_website"
   - step 6 → "breakup"

   **Sequence B** (`gtm-outbound/copy/email-sequence-b.md`):
   - step 0 → "research_drop" (deeper personalization, 2 sentences + pain point)
   - step 2 → "numbers" (ROI stats)
   - step 4 → "peer_move" (competitor FOMO)
   - step 6 → "direct_ask" (calendar link CTA)

2. Fill template variables:
   - `{{first_name}}` → queue entry first_name
   - `{{company}}` → queue entry company
   - `{{personalized_line}}` → queue entry personalized_line
   - `{{website_observation}}` → generate based on domain presence
   - `{{signature}}` → from config.yaml sender.signature

3. Call `mcp__Gmail__create_draft`:
   ```json
   {
     "to": ["<prospect email>"],
     "subject": "<filled subject>",
     "body": "<filled body>"
   }
   ```

4. Update queue entry:
   - `step` → step + 1
   - `next_touch` → today + delay from sequence config
   - Increment `daily.emails_sent` and `daily.emails_drafted`

**Non-email steps are manual** (LinkedIn and phone):
- LinkedIn (steps 1, 5): Output as manual task list in Phase 5.
  Do NOT auto-advance the step — Camilo marks these done manually.
  Track `linkedin_requested` and `linkedin_accepted` flags on queue entries.
  If a connection request has been pending 14+ days with no acceptance,
  set `linkedin_no_accept: true` and advance to the next step automatically.
- Phone (step 3): Output as call list in Phase 5. Advance step after outputting
  (calls are time-boxed, prospect moves to next email regardless).

---

### Phase 5 — Output Task Lists & Report

**LinkedIn tasks for today:**
```
- [ ] Connect: {{first_name}} {{last_name}} @ {{company}} — {{linkedin_url}}
      Note: "{{connection_request_text}}"
```

**Phone calls for today:**
```
- [ ] Call: {{first_name}} {{last_name}} @ {{company}} — {{phone}}
      Script: See gtm-outbound/copy/call-script.md
```

**Cycle summary:**
```
=== GTM Cycle Complete ===
Date: YYYY-MM-DD
Companies searched: X (total: Y)
Contacts enriched: X (total: Y)
Emails drafted: X (total: Y)
LinkedIn tasks: X
Phone calls: X
Queue size: X active, Y total
Daily caps: searched X/100, enriched X/50, emails X/90
```

---

### Phase 6 — Save State

Write updated `gtm-outbound/data/state.json` with:
- Updated daily counters
- New processed_ids
- Updated queue entries (new entries + step/next_touch changes)
- Updated stats totals

---

## Token Efficiency Rules

1. **Never re-search** companies in `processed_ids` — they're done
2. **Never regenerate** personalized lines for existing queue entries
3. **Never re-read** copy templates if you already have them in context
4. **Batch** HubSpot creates (up to 10 per call)
5. **Skip phases** where daily cap is already reached
6. **One sentence** max for personalized lines — that's the only LLM content per prospect
7. **Draft, don't send** — Gmail drafts cost zero tokens to review later

## Importing External Lists

If Camilo provides a CSV/XLSX (like the DDPR 26k Florida database):

1. Read the file from `gtm-outbound/data/`
2. Filter for HVAC-related companies (SIC/NAICS codes or keyword match)
3. Filter for South Florida geo (Miami-Dade, Broward, Palm Beach counties)
4. Filter for Google review score ≥ 3.5 (if column exists)
5. Add matching company IDs to `processed_ids` to prevent duplicate Apollo searches
6. For companies with contact info already → add directly to queue at step 0
7. For companies without contact info → enrich via Apollo/Lusha in Phase 2

## Sequence Timing Reference

| Step | Day | Channel  | Template           | Action          |
|------|-----|----------|--------------------|-----------------|
| 0    | 0   | Email    | opener             | Draft via Gmail |
| 1    | 1   | LinkedIn | connection_request  | Manual task     |
| 2    | 3   | Email    | proof              | Draft via Gmail |
| 3    | 5   | Phone    | cold_call          | Manual task     |
| 4    | 7   | Email    | free_website       | Draft via Gmail |
| 5    | 9   | LinkedIn | followup_message   | Manual task     |
| 6    | 14  | Email    | breakup            | Draft via Gmail |

After step 6, mark prospect status as "completed" — no more touches.

## Error Handling

- Apollo returns no results → try broader location filter (just "Florida")
- Apollo credit limit → switch to Lusha-only enrichment
- Lusha rate limited (429) → pause enrichment, continue with email drafts
- HubSpot duplicate → update existing contact instead of creating new
- Gmail draft fails → log error, continue with next prospect
- Any unrecoverable error → save state immediately, output error, stop cycle
