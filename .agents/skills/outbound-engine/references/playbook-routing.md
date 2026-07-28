# Playbook routing

Which ColdIQ knowledge skill to load at each decision point, and what it feeds.

## Step 1 — Classify the outreach

Load **`outreach-4-categories`** first. Everything downstream depends on which of the four
categories this campaign is:

| Category | Meaning | Trigger skill | Personalization posture |
|---|---|---|---|
| **Inbound** | They raised a hand | `inbound-triggers-30` | Light — speed matters more |
| **Postbound** | Prior relationship with you | `bridgebound-history-16` | Reference the history, always |
| **Bridgebound** | A bridge exists to them | the five `bridgebound-*` skills | Heavy — the bridge *is* the message |
| **Outbound** | Nothing but fit | `outbound-triggers-6` | Segment-level; per-contact rarely pays |

Then load **`personalization-playbooks`** — it maps category → how much personalization is
economically justified. Use it to push back when someone wants per-contact research on a
10,000-person cold list.

## Step 2 — Pick the trigger

| Situation | Skill | Feeds which tool |
|---|---|---|
| Funding, M&A, growth, product launches | `bridgebound-firmographic-15` | Apollo `organization_headcount_growth_range`, `revenue_range`, Clay `Latest Funding` / `Recent News` |
| Hiring signals, role gaps | `gtm-plays-11`, `buying-signals-6` | Apollo `apollo_organizations_job_postings` (1 credit), `q_organization_job_titles` |
| Competitor / adjacent vendor use | `bridgebound-in-market-20` | Apollo `currently_using_any_of_technology_uids` |
| Website intent, in-market behavior | `buying-signals-6` | Lusha `signals_companies_search`, `website_visits_search` |
| Closed-lost, churned exec, past customer | `bridgebound-history-16` | HubSpot `search_crm_objects` |
| Shared investors, board, alumni, network | `bridgebound-relationship-39` | Clay `Investors`, manual research |
| Bad reviews, visible pain, missing capability | `bridgebound-symptoms-11` | Clay custom data points |
| New leadership | `buying-signals-6` | Apollo `person_days_in_current_title_range` (max ~90) |

`buying-signals-6` ranks signals by purchase correlation — use it to sequence which trigger to
build first when several are available.

## Step 3 — Choose the message frame

1. **`atl-btl-messaging`** — decide first. VP/C-suite (ATL) and manager/IC (BTL) need different
   length, altitude, and proof. Getting this wrong makes every other choice moot.
2. **`email-writing-frameworks`** — the five structural frames. Pick one per cohort, not per email.
3. **`personalization-hooks`** — converts a research finding into an opening line. Distinguishes a
   strong hook from a lite one; be honest about which you actually have.
4. **`personalization-6-buckets`** — where to look when you need a hook and have none.
5. **`sdr-outbound-rules`** — the eight allowed frameworks and tone by offer type. Treat as a
   constraint, not a suggestion.
6. **`josh-braun-copywriting`** — final pass. Catches the common failure modes.

Template libraries when you need raw material: `cold-email-templates-34` (34 templates),
`email-1-variations-7` (openers), `coldiq-messaging-templates` (6 structures),
`ai-personalization-prompts` (research prompts that run inside Clay).

## Step 4 — Structure the cadence

- **`cold-email-4-sequence`** — the baseline 4-email shape. Maps directly onto
  `apollo_sequences_create` `emailer_steps`.
- **`gtm-philosophy`** — multi-channel coordination when the sequence includes call and LinkedIn steps.
- **`cold-call-scripts`** — populates the `note` field on Apollo `call` steps so the rep has a script.
- **`linkedin-campaign-complete`** — copy for `linkedin_step_message` / `linkedin_step_connect`
  steps. Remember these only create rep tasks; nothing touches LinkedIn automatically.
- **`linkedin-limits-warmup`** — daily-limit constraints. Applies to the human executing, not to
  Apollo.

## Step 5 — List building and sources

- **`list-building-tips`** — source mixing and enrichment order.
- **`lead-sources-guide`** — which source suits which use case. Note it assumes Clay-delivered
  templates; this workspace has no Clay subroutines configured, so its Clay-table workflows are
  reference material rather than something runnable here.

## Step 6 — Review

- **`email-metrics-benchmarks`** — before launch as a structure checklist, after launch as
  benchmarks.
- **`linkedin-success-factors`** — pre-launch checklist for LinkedIn campaigns.
- **`devils-advocate`** — STRATEGY mode on the campaign plan, PROMPT mode on any AI personalization
  prompt before it runs at volume. Cheapest possible place to catch a broken assumption.
- **`sdr-master-prompts`** — baseline context when configuring an AI SDR assistant.

## Not routed

**`drawing-analyzer`** is a construction-drawing PDF tool that ships in the same repo. It has no
GTM function and is not installed here.
