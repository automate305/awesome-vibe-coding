# Verified call chain

The exact order of tool calls for a standard triggered email campaign, with the parameters that
matter and the failure modes that actually bite. Every signature here was read from the live tool
schemas in this workspace.

---

## 1. Companies

```
apollo_mixed_companies_search
  → capture org `id` values (24-char hex)
```

Generate a `_conversation_ref` token on the first Apollo call and reuse the identical value on
every subsequent Apollo call in the conversation.

## 2. Trigger layer (optional, varies by play)

```
apollo_organizations_job_postings { id }
```
**1 credit per call.** Say exactly: `"This will consume 1 credit. Do you want to proceed?"`
Do not paraphrase, do not say "consumes credits". For a batch, confirm the total count and cost up
front in one message rather than asking per company.

```
mcp__Lusha__signals_companies_search      # in-market / intent
mcp__Lusha__website_visits_search         # site visitors
```

## 3. People

```
apollo_mixed_people_api_search {
  organization_ids: [...],        # from step 1, exact values only
  person_titles: [...],
  person_seniorities: [...],
  contact_email_status: ["verified", "likely to engage"],
  per_page: 100                   # max
}
  → capture person `id` values
```

Expect **no emails** and possibly **masked last names**. Both are normal. Do not retry, do not
report it as a failure, do not wait for unmasked names before enriching.

Display ceiling is 50,000 records (100/page × 500 pages). If you are near it, the filters are too
loose.

## 4. Enrich

```
apollo_people_bulk_match {
  details: [{ id }, ...]          # MAX 10 per call
}
```

For missing emails only:

```
apollo_users_api_profile { include_waterfall_capability: true }
  → check waterfall_email_enabled; fetch ONCE per conversation and reuse

apollo_people_bulk_match {
  details: [...],
  run_waterfall_email: true
}
  → returns waterfall.status "accepted" + ONE top-level request_id, NO inline data

apollo_webhook_result_show { request_id }
  → poll with backoff: ~15s, then ~30s, up to ~3 min
```

Waterfall credits are **variable and plan-dependent** — 0 when Apollo's own data answers, partner
credits otherwise. Never quote a number. Get acceptance of variable cost.

`waterfall.status: "failed"` means the team has no waterfall configured. That is a configuration
answer, not a retry.

**Over ~20–30 people:** stop. Do not loop this call and accumulate results in conversation. Create
an Apollo record collection (`apollo_custom_objects_create` + `apollo_fields_create` +
`apollo_dynamic_field_enrichment_enrich`) so the work persists and can be exported.

Clay alternative, per company:

```
mcp__Clay__find-and-enrich-contacts-at-company {
  companyIdentifier: "acme.com",           # domain or LinkedIn URL — a bare name FAILS
  contactFilters: { job_title_keywords: ["VP Finance"] },   # compound titles stay ONE string
  dataPoints: {
    contactDataPoints: [{ type: "Email" }],
    companyDataPoints: [{ type: "Recent News" }, { type: "Latest Funding" }]
  }
}
```

Filters AND together; values inside an array OR together. Use specific titles — `"Engineer"`
matches Sales Engineer, `"Manager"` matches Account Manager. To refine, re-call the tool; never
filter the returned rows in conversation.

## 5. Suppress against HubSpot

```
mcp__HubSpot__get_user_details            # owner ID + read/write availability
mcp__HubSpot__search_crm_objects {
  objectType: "contacts",
  filterGroups: [{ filters: [{ propertyName: "email", operator: "IN", values: [...] }] }],
  properties: ["email", "hs_lead_status", "lifecyclestage", "hubspot_owner_id"],
  chatInsights: { userIntent: "...", satisfaction: "NEUTRAL" }
}
```

`chatInsights` is required on every HubSpot search call. Check `total` — do not let pagination
silently truncate the suppression check, or suppressed contacts will get enrolled.

Max 5 filter groups, 6 filters each, 18 total. Batch large email lists across calls.

## 6. Per-contact bodies (tier-1 only)

```
apollo_fields_index
  → find/create a long-text field with modality: 'contact'; capture its ID

apollo_contacts_create {
  first_name, last_name, email, title, organization_name,
  label_names: ["Q3 — <campaign>"],
  typed_custom_fields: { "<field_id>": "<this contact's full email body>" }
}
```

Key by field **ID**. Reference by field **NAME** in the template (step 7). Getting these backwards
silently produces an unresolved merge variable in a live email.

`apollo_contacts_create` **overwrites** existing values on a match and cannot be undone.

## 7. Sequence

```
apollo_emailer_campaigns_search { q_name: "<proposed name>" }    # duplicate check FIRST

apollo_sequences_create {
  name: "Q3 Outbound — <segment> — <trigger>",
  active: false,                              # ALWAYS
  permissions: "team_can_use",
  emailer_steps: [
    { type: "auto_email", wait_time: 0, wait_mode: "day",
      emailer_touches: [{ type: "new_thread", status: "approved",
        emailer_template: { subject: "<=9 words", body_html: "25-85 words", creation_type: "manual" } }] },
    { type: "auto_email", wait_time: 3, wait_mode: "day",
      emailer_touches: [{ type: "reply_to_thread",           # no subject on replies
        emailer_template: { body_html: "..." } }] },
    { type: "linkedin_step_view_profile", wait_time: 2, wait_mode: "day" },
    { type: "call", wait_time: 3, wait_mode: "day", priority: "high",
      note: "<script from cold-call-scripts>" }
  ]
}
```

Max 25 steps, max 3 touches (A/B variants) per step. Omit `emailer_touches` entirely for
`action_item`, `linkedin_step_view_profile`, and `linkedin_step_interact_post`.

Omit `emailer_schedule_id` to inherit the user's default sending window, or call
`apollo_emailer_schedules_index` and let them choose.

## 8. Enroll

```
apollo_email_accounts_index
  → take the account with default: true

apollo_emailer_campaigns_add_contact_ids {
  id: <sequence_id>,
  emailer_campaign_id: <same sequence_id>,   # yes, both
  contact_ids: [...],                        # real 24-char hex from step 6
  send_email_from_email_account_id: "<id>",  # string, or array for rotation
  status: "paused"                           # stage without starting
}
```

Show the confirmation summary before calling: sender address, sequence name, contact count,
enrollment status. Wait for an explicit yes.

Leave the `sequence_*` override flags at their defaults. Each one disables a guardrail —
`sequence_unverified_email`, `sequence_no_email`, and `sequence_same_company_in_same_campaign`
exist to stop exactly the mistakes that burn a domain.

## 9. CRM write-back

```
mcp__HubSpot__manage_crm_objects {
  confirmationStatus: "CONFIRMED",           # only after showing the change table
  updateRequest: { objects: [{ objectType: "contacts", objectId: <id>,
    properties: { hs_lead_status: "IN_PROGRESS" },
    associations: [{ targetObjectId: <company_id>, targetObjectType: "companies" }] }] }
}
```

Show the proposed-changes table and get approval before the call. Offer the
skip-confirmations-for-this-chat option once, then stop offering it.

## 10. GATE

```
apollo_emailer_campaigns_approve { id }
```

**Human only.** Requires explicit consent given *after* the built sequence has been reviewed.
Sends real email from a real mailbox. Irreversible once dispatched.

## 11. Measure

```
apollo_analytics_sync_report
apollo_emailer_messages_email_send_status
```

---

## Failure modes worth memorizing

| Symptom | Cause | Fix |
|---|---|---|
| Masked last names in search | Plan-level obfuscation | Expected. Enrich by `id` anyway |
| No emails from people search | By design — search never returns emails | `apollo_people_bulk_match` |
| `waterfall.status: "failed"` | Team has no waterfall configured | Config change, not a retry |
| Waterfall returns no data inline | It is async | Poll `apollo_webhook_result_show` |
| Clay returns nothing | Company name passed instead of domain | Convert to domain or LinkedIn URL |
| Clay title filter over-matches | Generic keyword | `"Software Engineer"`, not `"Engineer"` |
| Enrollment rejected | Person is not an Apollo *contact* | `apollo_contacts_create` first |
| Merge variable unresolved in a sent email | Referenced by field ID instead of name | Reference by name in the template |
| HubSpot write rejected | Missing `confirmationStatus` | Show the table, get approval, set CONFIRMED |
| Advanced Apollo filter errors | Free plan | Named in the schema as upgrade-required |
