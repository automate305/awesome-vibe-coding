# Microneedling-PHL-Q3-Batch1 — Smartlead Sequence

Cold outbound for microneedling device + consumables sales into Philadelphia-area
(50–60 mi) med spas, dermatology, and plastic surgery practices. Wedge: clinical
results, per-treatment ROI, and a significant trade-in credit on the practice's
current device.

Also mirrored in Apollo as sequence `Microneedling-PHL-Q3-Batch1`
(id `6a4b38e1f719360014ea92c2`, saved **inactive**) if you ever want to send from
Apollo instead. Pick one platform — never both at once.

## Campaign settings

| Setting | Value |
|---|---|
| Sender mailbox | cam@automate305.com |
| Daily send limit | 20–30/day (single mailbox, cold domain-adjacent volume) |
| Schedule | Mon–Fri, 8:30am–4:30pm America/New_York |
| Stop on reply | ON |
| Stop on click | OFF |
| Open tracking | ON (plain-text feel preserved — no images/links in copy) |
| Unsubscribe | Smartlead default footer or manual "one line back" opt-out |

## Merge variables

Smartlead syntax used below: `{{first_name}}`, `{{company_name}}`,
`{{device_signal}}` (custom field — present for A/B-tier rows in the import CSV).

## Step 1 — Trade-in hook (Day 0)

**Subject:** trade-in credit for {{company_name}}

```
Hi {{first_name}} — we help practices running microneedling (or ready to add it)
upgrade to a new device, and we take your current system as trade-in for
significant credit.

The pitch is simple: clinical results and per-treatment ROI. Worth a 15-minute look?
```

**A-tier variant (device signal known):** open with the device instead —
`Saw {{company_name}} runs {{device_signal}} — when it's time to upgrade, we take
it as trade-in for significant credit toward a new system.`

## Step 2 — Clinical results / ROI (Day 3, same thread)

**Subject:** *(reply in thread)*

```
Quick follow-up, {{first_name}} — the two questions practice owners always ask us:
how good are the clinical results, and how fast does the device pay for itself?

Both answers fit on one page. Want me to send the ROI breakdown and before/afters
for {{company_name}}?
```

## Step 3 — Social proof / demo hold (Day 7, same thread)

**Subject:** *(reply in thread)*

```
{{first_name}} — we work with derm, plastic surgery, and med spa teams across the
Philly area on exactly this: keep the treatment menu, upgrade the tech, protect
the margin.

If a device refresh is anywhere on {{company_name}}'s radar, I'll hold a demo slot
this month. Interested?
```

## Step 4 — Breakup (Day 12, same thread)

**Subject:** *(reply in thread)*

```
Closing the loop, {{first_name}} — if new microneedling tech isn't a priority for
{{company_name}} right now, no worries at all.

If it is, the trade-in credit is the best door in. One line back and I'll send
details. Either way, thanks for reading.
```

## Import checklist

1. Smartlead → Leads → Import CSV → `smartlead_import.csv` (delivered privately,
   not in this repo). Columns map 1:1: `email`, `first_name`, `last_name`,
   `company_name`, plus custom fields `device_signal`, `tier`, `title`, `city`.
2. Verify emails through Smartlead's built-in verifier on import —
   40 rows are Apollo-verified, 11 are extrapolated (expect a few drops there).
3. Launch order: **Tier-A first (11 contacts)** — these have confirmed device
   stacks and are the trade-in pitch. Then B, then C as the mailbox warms.
4. Connect cam@automate305.com as the sender and confirm SPF/DKIM/DMARC pass
   before the first send.
