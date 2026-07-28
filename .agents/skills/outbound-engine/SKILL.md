---
name: outbound-engine
description: >
  Runs a real outbound campaign end to end against the connected GTM stack — sourcing,
  enrichment, CRM dedupe, message generation, sequence build, and enrollment — stopping at a
  human approval gate before anything sends. This is the execution layer that turns the ColdIQ
  playbook skills (triggers, frameworks, templates, personalization) into actual tool calls
  against Apollo, Clay, and HubSpot.
  Trigger this skill when the user says: "run a campaign", "build a campaign", "launch outbound",
  "build me a list", "source prospects", "find me leads", "prospect into", "enrich this list",
  "build a sequence", "set up a sequence", "enroll these contacts", "sync to HubSpot",
  "push to CRM", "who should we target", "build the ICP list", "start an outbound motion",
  "operationalize this play", "run this play", "campaign performance", "how did the campaign do",
  or any request to actually execute outbound rather than just discuss or draft it.
  Also trigger when the user names a trigger/play from the ColdIQ skills and asks to run it
  against real accounts.
---

# Outbound Engine

The ColdIQ skills in this repo are **knowledge**: triggers, frameworks, templates, personalization
buckets. None of them call a tool. This skill is the **execution layer**. It reads those playbooks,
then drives the connected stack to put real messages in front of real people.

**Governing rule: nothing sends without a human saying yes.** Every path in this skill terminates at
a gate (§Gate). You may build, stage, and enroll. You may not activate.

---

## The stack

Verified live in this workspace. Do not invent tools outside this map.

| Job | Tool | Notes |
|---|---|---|
| Company sourcing | `mcp__Apollo_io__apollo_mixed_companies_search` | Returns org IDs needed downstream |
| People sourcing | `mcp__Apollo_io__apollo_mixed_people_api_search` | **Returns no emails.** Last names may be masked — that is expected, not a failure |
| Contact enrichment | `mcp__Apollo_io__apollo_people_bulk_match` | **Max 10 people per call** |
| Email waterfall | same, `run_waterfall_email: true` | Async — poll `apollo_webhook_result_show`. Variable, plan-dependent credits |
| Company/contact enrichment (alt) | `mcp__Clay__find-and-enrich-contacts-at-company` | Needs a **domain or LinkedIn URL**, never a bare company name |
| Job-posting signals | `mcp__Apollo_io__apollo_organizations_job_postings` | **1 credit per call**, exact-wording confirmation required |
| Intent / in-market signals | `mcp__Lusha__signals_companies_search`, `mcp__Lusha__website_visits_search` | Feeds the in-market and symptom triggers |
| CRM (system of record) | `mcp__HubSpot__search_crm_objects`, `mcp__HubSpot__manage_crm_objects` | Writes require `confirmationStatus` |
| Contact creation | `mcp__Apollo_io__apollo_contacts_create` / `..._bulk_create` | Only *contacts* can be sequenced |
| Sequence build | `mcp__Apollo_io__apollo_sequences_create` | Always `active: false` |
| Sender mailbox | `mcp__Apollo_io__apollo_email_accounts_index` | Pick the one with `default: true` |
| Enrollment | `mcp__Apollo_io__apollo_emailer_campaigns_add_contact_ids` | Requires a real sender account ID |
| **Activation** | `mcp__Apollo_io__apollo_emailer_campaigns_approve` | **The gate. Human only.** |
| Performance | `mcp__Apollo_io__apollo_analytics_sync_report`, `apollo_emailer_messages_email_send_status` | |

### Not connected — say so, don't fake it

- **Prospeo** — no MCP server in this session. It is a pluggable slot in the email waterfall
  (§Phase 2), not a live provider. Use Apollo's native waterfall as the working default. If the
  user wants Prospeo specifically, they need either a Clay subroutine that calls it or a
  `PROSPEO_API_KEY` for a direct HTTP call.
- **Clay subroutines** — this workspace has **zero** configured (`list_subroutines` returns empty).
  Any plan depending on a custom Clay function is blocked until one is built in Clay's UI.
- **Gmail** — `create_draft` / `update_draft` exist; **there is no send tool.** Gmail is for
  drafting and reply-monitoring only. All sending goes through Apollo.
- **LinkedIn** — no API. The LinkedIn skills produce copy and cadence for a human or a
  third-party tool to execute. Apollo LinkedIn *step types* exist in sequences but only create
  tasks for a rep; they do not touch LinkedIn.

---

## Phase 0 — Brief

Never start sourcing from a one-line request. Establish, and echo back:

1. **Offer** — what is being sold, to whom, and the one outcome it produces.
2. **ICP** — firmographics (size, geo, industry, tech) and the persona (titles, seniority).
3. **Trigger** — why *now*. Load the matching ColdIQ skill; see `references/playbook-routing.md`.
4. **Volume** — how many accounts, how many contacts per account.
5. **Channel mix** — email-only, or email + call/LinkedIn tasks.
6. **Sender** — which mailbox, and its current daily volume.

If the user has not named a trigger, say so plainly. Untriggered cold outbound is the weakest of
the four outreach categories (`outreach-4-categories`) and the campaign should be scoped as such,
not dressed up as signal-based.

**Volume sanity check.** A new or low-volume mailbox cannot absorb a large list. If contacts
enrolled per day per mailbox exceeds ~50, flag it and propose either more mailboxes or a longer
ramp before building anything.

---

## Phase 1 — Source

1. `apollo_mixed_companies_search` with the firmographic filters → capture **exact org IDs**.
2. Layer the trigger. Firmographic and growth triggers map to Apollo filters directly
   (`organization_headcount_growth_range`, `organization_num_jobs_range`,
   `q_organization_job_titles`, `currently_using_any_of_technology_uids`). In-market and
   symptom triggers come from Lusha signals.
3. `apollo_mixed_people_api_search` filtered to those `organization_ids` plus `person_titles` /
   `person_seniorities` → capture **person IDs**.

Never carry an ID across from memory or a prior session. Every ID must come from a tool result in
the current conversation.

**Scale rule.** Past ~20–30 people, do **not** loop `apollo_people_bulk_match` in 10-person batches
and track results in the conversation — there is no persistence, no resumability, and no export
path. Use an Apollo record collection instead, or stage the list in Clay.

---

## Phase 2 — Enrich

1. `apollo_people_bulk_match` with the person IDs, **10 at a time**.
2. For anyone still missing a work email, run the waterfall: same tool, `run_waterfall_email: true`.
   This is async — it returns one `request_id` for the batch and no inline data. Poll
   `apollo_webhook_result_show` with backoff (~15s, then ~30s, up to ~3 min).
   - Before offering the waterfall, confirm the team has it enabled via
     `apollo_users_api_profile` with `include_waterfall_capability=true`.
   - Credits are **variable and plan-dependent**. Never quote a fixed number. Get explicit
     acceptance of variable cost first.
3. **Provider slot (Prospeo and friends).** If a third-party finder is configured, it belongs here,
   after Apollo's own data and before giving up on a contact. Today nothing occupies this slot —
   say that rather than silently skipping it.
4. Company-level data points (recent news, funding, tech stack, open jobs) via Clay's
   `find-and-enrich-contacts-at-company` `dataPoints`. These become personalization inputs, not
   filters.

**Deliverability floor.** Drop anyone whose email status is not `verified` or `likely to engage`.
Enrolling unverified addresses is the fastest way to burn a sending domain. If the user insists,
state the bounce risk once, then comply and route them to a separate warmup mailbox.

---

## Phase 3 — Qualify against HubSpot

HubSpot is the system of record. Before anyone enters a sequence:

1. `mcp__HubSpot__get_user_details` — confirm object read/write availability and get the owner ID.
2. `search_crm_objects` on `contacts` and `companies` for every candidate domain and email.
3. **Suppress**: existing open deals, current customers, active sequences owned by another rep,
   anyone marked do-not-contact, and any account already worked in the last 90 days.
4. **Reclassify, don't drop**: closed-lost and past-customer matches are not suppressions — they
   are *better* leads on a different play. Route them to `bridgebound-history-16` and build them
   as a separate re-engagement campaign with its own messaging.

Report the funnel explicitly: sourced → enriched → deliverable → net new after suppression. If
suppression removes most of the list, stop and say so. That is a finding about the ICP, not a
number to quietly move past.

---

## Phase 4 — Message

Do not write copy from scratch. Load the playbooks and compose from them — see
`references/playbook-routing.md` for which skill maps to which situation.

Sequence shape (from `cold-email-4-sequence` and `email-1-variations-7`):
- 4–6 steps, 3-day intervals, first step `wait_time: 0`.
- Body 25–85 words, ideally ≤50. Subject ≤9 words.
- One clear ask per email. No stacked CTAs.
- Follow-ups use `type: "reply_to_thread"` and omit the subject.

**Personalization tiers** — pick one and be honest about which:
- **Token merge** — `{{first_name}}`, `{{company}}`, `{{title}}`. Scales infinitely, personalizes
  nothing. Fine for high-volume untriggered outbound; do not call it personalization.
- **Segment-level** — one hand-written variant per trigger cohort. The right default for most
  campaigns. Best effort-to-return ratio.
- **Per-contact** — a genuinely individual email per person. Supported: write each body into a
  long-text **contact custom field**, then reference that field *by name* as a merge variable in
  the sequence template.
  1. `apollo_fields_index` → find or create a field with `modality: 'contact'`.
  2. `apollo_contacts_create` with `typed_custom_fields` keyed by **field ID**.
  3. In `apollo_sequences_create`, put `{{custom_email_body_seq_1}}` in `body_html` — referenced by
     field **name**, not ID.
  Reserve this for tier-1 accounts. It does not scale and pretending otherwise wastes research.

Run the copy through `josh-braun-copywriting` and `sdr-outbound-rules` before building. If the
user wants it stress-tested, hand it to `devils-advocate` in STRATEGY mode.

---

## Phase 5 — Build

1. `apollo_emailer_campaigns_search` on the proposed name first — do not create a duplicate.
2. `apollo_sequences_create` with `active: false`. **Always.** Never pass `active: true`, and never
   set it to true because the user seems eager. Activation is the gate, and the gate is a separate,
   explicit step.
3. `apollo_email_accounts_index` → take the account with `default: true` unless the user named a
   different mailbox. Never fabricate a mailbox ID.
4. Present the full sequence back: every step, every subject, every body, the intervals, and the
   sender address.

---

## Phase 6 — Enroll, then stop

1. `apollo_contacts_create` / `apollo_contacts_bulk_create` for anyone not already an Apollo
   contact. Note this **overwrites** existing field values on a match, irreversibly.
2. `apollo_emailer_campaigns_add_contact_ids` with real contact IDs and the real sender ID.
   Before calling, show the confirmation summary the tool requires: sender address, sequence name,
   contact count, enrollment status. Wait for an explicit yes.
3. Write back to HubSpot — `manage_crm_objects` with `confirmationStatus`, setting campaign
   membership and last-touched on each contact, associated to the right company.

### Gate

**Stop here.** Do not call `apollo_emailer_campaigns_approve`.

Report: sequence name and ID, step-by-step copy, sender mailbox, contact count, the suppression
funnel, and the credits actually spent. Then state plainly that the sequence is built but inactive,
and that activating it sends real email from a real mailbox and cannot be undone once dispatched.

Activate only on an explicit, unambiguous instruction to activate, given after that summary. "Just
do it," "go ahead," or eagerness expressed earlier in the conversation do **not** carry forward
through the gate. If the user pre-authorized activation before seeing the built sequence, show the
sequence anyway and ask again — the whole point of the gate is that consent follows review.

---

## Phase 7 — Measure

Once live, `apollo_analytics_sync_report` and `apollo_emailer_messages_email_send_status`.
Benchmark against `email-metrics-benchmarks`. Reply rate is the metric; open rate is noise and
increasingly unmeasurable — do not optimize toward it or report it as success.

Diagnose in order — a later fix cannot rescue an earlier failure:
1. **Bounces >3%** → list quality. Stop the campaign. Everything downstream is invalid.
2. **Deliverability** → volume, domain warmth, spam signals in copy.
3. **Reply rate low, deliverability fine** → the trigger is wrong or the ICP is wrong. Not the copy.
4. **Replies negative or confused** → the offer or the persona. Not the subject line.

Never report a metric that was not returned by a tool call. If a number is unavailable, say it is
unavailable.

---

## Hard rules

- **The gate is absolute.** Build, stage, enroll — never activate without explicit review-then-consent.
- **Credits are real money.** `apollo_organizations_job_postings` costs 1 credit and requires the
  exact confirmation sentence. Waterfall costs are variable. Confirm totals before batches.
- **IDs come from tool results in this session.** Never from memory, never a placeholder.
- **Unverified emails do not get enrolled.**
- **Suppression is checked before enrichment spend where possible** — do not pay to enrich someone
  who is already a customer.
- **Report the funnel honestly.** If 200 sourced became 12 deliverable net-new, lead with 12.
- **Name what is not connected.** An unavailable provider is a finding, not something to route
  around silently.
