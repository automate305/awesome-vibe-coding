# Microneedling-PHL — Prospect List (Sanity Round)

Target universe for a microneedling device + consumables company selling B2B into
med spas, dermatology, and plastic surgery practices within ~50–60 miles of
Center City Philadelphia (PA / South Jersey / Delaware).

## What's in here

| File | Contents |
|---|---|
| `microneedling_phl_accounts.csv` | 122 qualified accounts, deduped, chain-excluded, tiered A/B/C |
| `seed_places_intel.json` | Device-stack intel from Google Places review mining + config (exclusions, titles, scoring keywords) |
| `build_list.py` | Merge / dedupe / score pipeline (Apollo org pulls + Places seed intel) |

Contact-level data (90 decision-makers, 51 with emails, 40 Apollo-verified) is
**deliberately not committed** — this repository is public, so the contact CSV
was delivered privately instead.

## Pipeline

1. **Discovery** — Apollo org search: 13 keyword tags × 13 geo anchors, 1–50
   employees → 255 raw orgs (3 pages). Merged with 23 pre-qualified accounts
   from Google Places review mining (device signals in review text).
2. **Dedupe + exclude** — chain/franchise exclusion list (Schweiger, Ideal Image,
   LaserAway, SkinSpirit, OrangeTwist, …), false-positive filter (dental, vet,
   architects, training cos), fuzzy name merge → 122 unique accounts.
3. **Enrich** — Apollo people search (17 decision-maker titles) at 104 org IDs →
   91 people → bulk email enrichment. Clay layered on the 9 A-tier domains for
   firmographics + async device-stack research; Clay also surfaced C-suite
   contacts Apollo's title search missed (COO, Director of Injectables,
   Founder/CEO, GM, Practice Manager).
4. **Score** — A: confirmed device signal + strong social proof (trade-in pitch);
   B: partial signal (upgrade / first-device pitch); C: keyword-relevant, nurture.

## Tier snapshot

- **A (18)** — confirmed device stacks: Ringpfeil (Vivace), Bryn Mawr Derm
  (Morpheus8, $10.2M), Cross Medical Group (Sciton HALO/MOXI/BBL), Bucky Plastic
  Surgery (Moxi/BBL/RF microneedling), RW Dermatology (Moxi+BBL), South Jersey
  Skin Care & Laser ($5.4M, 1,576 reviews), Novique ($10–25M), Anu Medical Spa…
- **B (5)** — adjacent device signal (CoolPeel, Sofwave, CO2, Emsculpt).
- **C (99)** — keyword-qualified practices for the nurture lane.

Apollo credit spend for the full round: ~108 of the 300-credit cap.
