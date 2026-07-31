# Email Sequence - Automate305 HVAC Campaign
# ColdIQ methodology: short, personalized, value-first, clear CTA

---

## Email 1 - The Opener (Day 0)

**Subject:** `{{company}} - quick question`

**Body:**
```
Hey {{first_name}},

{{personalized_line}}

I work with HVAC companies in the Miami area to automate the back-office stuff that eats up your day. Scheduling, dispatch, follow-ups, invoicing. So you can focus on jobs, not paperwork.

Would a 15-minute call this week make sense to see if there's a fit?

{{signature}}
```

---

## Email 2 - The Proof (Day 3)

**Subject:** `Re: {{company}} - quick question`

**Body:**
```
{{first_name}},

Most HVAC companies I talk to are losing 20-30% of inbound leads because they can't respond fast enough. Calls go to voicemail, web forms sit for hours.

One shop I worked with went from missing half their calls to booking 90% within 2 minutes, just by automating the intake.

Worth a quick conversation?

{{signature}}
```

---

## Email 3 - The Free Website (Day 7)

**Subject:** `free website for {{company}}`

**Body:**
```
{{first_name}},

I took a look at {{company}}'s online presence. {{website_observation}}

I'm offering a handful of HVAC companies in the area a completely free website rebuild. No strings, no catch. I use it as a portfolio piece, you get a site that actually converts visitors into booked jobs.

If that sounds interesting, happy to show you what it'd look like.

{{signature}}
```

**Variable notes:**
- `{{website_observation}}` options:
  - If no website: "Looks like you don't have a website yet. That's a big opportunity sitting on the table."
  - If weak website: "There are a few quick wins that could help it convert more visitors into booked calls."
  - If decent website: "It looks solid. I think a few tweaks could take it to the next level."

---

## Email 4 - The Breakup (Day 14)

**Subject:** `closing the loop`

**Body:**
```
{{first_name}},

I've reached out a few times and haven't heard back. Totally get it, you're busy running jobs.

I'll leave the door open: if you ever want to explore automating your scheduling, dispatch, or customer follow-ups, I'm a message away. The free website offer stands too.

Either way, hope {{company}} has a strong season.

{{signature}}
```

---

## Variable Reference

| Variable | Source | Example |
|---|---|---|
| `{{first_name}}` | Apollo/Lusha enrichment | "Mike" |
| `{{company}}` | Apollo company name | "Cool Air Solutions" |
| `{{personalized_line}}` | Generated per prospect | "Saw your 4.5-star Google rating. Your customers clearly love the work." |
| `{{website_observation}}` | Generated from web presence check | See options above |
| `{{signature}}` | config.yaml sender.signature | Camilo / Automate305 |
