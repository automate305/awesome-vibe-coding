# Email Sequence B - Automate305 HVAC Campaign (A/B Test)
# ColdIQ methodology: deeper personalization, no free website offer
# Instead: pain-point focused, operator-to-operator tone, ROI angle

---

## Email 1 - The Research Drop (Day 0)

**Subject:** `{{first_name}}, quick question about {{company}}`

**Body:**
```
Hey {{first_name}},

{{personalized_paragraph}}

I'm curious, how are you handling {{pain_point}} right now? Most HVAC owners I talk to in the {{area}} area are still doing it manually, and it's costing them 10-15 hours a week.

Happy to share what's working for other shops if you're open to a quick call.

{{signature}}
```

**Variable notes:**
- `{{personalized_paragraph}}` - TWO sentences, deeply researched. Examples:
  - "Saw {{company}} just crossed 300 Google reviews. That's top 5 in Miami-Dade for HVAC. That kind of volume means your phone is probably ringing nonstop."
  - "Noticed {{company}} is hiring two new techs on Indeed. Growth mode is exciting but it usually means dispatch and scheduling start breaking."
  - "Looked at {{company}}'s service area. Covering all of Broward is no joke. Coordinating that many routes manually has to be a headache."
- `{{pain_point}}` - pick based on research:
  - "scheduling and dispatch" (default)
  - "lead follow-up" (if low review count / weak online presence)
  - "invoicing and collections" (if commercial-focused)
  - "after-hours calls" (if 24/7 emergency service advertised)

---

## Email 2 - The Numbers (Day 3)

**Subject:** `Re: {{first_name}}, quick question about {{company}}`

**Body:**
```
{{first_name}},

Ran some rough numbers on what manual ops typically cost an HVAC shop your size:

- Missed calls → 3-5 lost jobs/week at $300-500 avg ticket = $4,500-10,000/month left on the table
- Slow follow-up → 40% of leads go cold after 5 minutes without a response
- Manual scheduling → 2-3 hours/day of admin instead of revenue-generating work

Not saying that's you, but if any of those hit close, it's worth a 15-minute conversation.

{{signature}}
```

---

## Email 3 - The Peer Move (Day 7)

**Subject:** `what other {{area}} HVAC shops are doing`

**Body:**
```
{{first_name}},

Without naming names, a few HVAC companies in {{area}} have started automating their intake, dispatch, and follow-ups. The ones that moved first are pulling ahead because:

- Leads get a text back in under 60 seconds (before the homeowner calls the next company on Google)
- Techs get dispatch updates on their phone instead of calling the office
- Invoices go out same-day, every time

I help shops set this up. No long contracts, no bloated software. Just the pieces that actually move the needle.

Worth a conversation?

{{signature}}
```

---

## Email 4 - The Direct Ask (Day 14)

**Subject:** `15 min, {{first_name}}?`

**Body:**
```
{{first_name}},

I'll keep this one short. I've got a few openings this week for a quick audit call.

I'll look at your current setup (scheduling, lead response, follow-ups) and tell you exactly where you're leaving money on the table. No cost, no pitch. Just a diagnostic.

If it's not useful, you'll know in the first 5 minutes and we'll part ways.

{{first_name}}, here's my calendar: [link]. Or just reply with a time that works.

{{signature}}
```

---

## What Makes Sequence B Different from A

| | Sequence A | Sequence B |
|---|---|---|
| Hook | Google reviews / one-liner | Deep research paragraph + pain point |
| Email 3 | Free website offer | Peer competition / FOMO |
| Email 4 | Soft breakup | Direct calendar ask |
| Tone | Friendly, offer-led | Operator-to-operator, ROI-led |
| Personalization | 1 sentence per prospect | 2 sentences + tailored pain point |
| Best for | Prospects with weak/no website | Prospects with established presence |

---

## A/B Split Rules

Assign prospects to Sequence A or B using this logic:

1. **No website or weak website** → Sequence A (free website carrot is relevant)
2. **Has decent website + high Google reviews** → Sequence B (they don't need a website - hit ROI)
3. **Random 50/50 split** for everyone else (track which converts better)

Store `sequence: "A"` or `sequence: "B"` on each queue entry in state.json.

---

## Variable Reference

| Variable | Source | Example |
|---|---|---|
| `{{first_name}}` | Apollo/Lusha | "Mike" |
| `{{company}}` | Apollo | "Cool Air Solutions" |
| `{{personalized_paragraph}}` | Generated - 2 sentences from research | See examples above |
| `{{pain_point}}` | Inferred from company profile | "scheduling and dispatch" |
| `{{area}}` | Company city/county | "Miami-Dade" / "Broward" |
| `{{signature}}` | config.yaml | Camilo / Automate305 |
