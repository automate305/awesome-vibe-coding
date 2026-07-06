#!/usr/bin/env python3
"""Microneedling-PHL pipeline: merge Apollo org pulls + Places seed intel,
dedupe, drop chains/false positives, score A/B/C, emit review CSV.

Inputs (in this directory):
  seed_places_intel.json          - pre-qualified accounts + exclusion/scoring config
  apollo_orgs_*.json              - raw Apollo org-search pages dumped at runtime
  apollo_people_*.json            - raw Apollo people-search pages (optional at org stage)
  enriched_contacts.json          - accumulated bulk-match results (optional)

Output:
  microneedling_phl_accounts.csv  - account-level list
  microneedling_phl_contacts.csv  - contact-level list (when enrichment data present)
"""
import csv, glob, json, os, re, sys

BASE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(BASE, "seed_places_intel.json")))

CHAINS = [c.lower() for c in cfg["chain_exclusions"]]
FALSE_POS = [k.lower() for k in cfg["false_positive_keywords"]]
DEVICE_KW = cfg["device_keywords_for_scoring"]

GREEN_RE = re.compile(
    r"\b(med(ical)?\s*spa|medspa|derm\w*|aesthetic|plastic surgery|cosmetic surg|"
    r"microneedl|skin\s*(care|clinic|center|studio|health)|laser (center|clinic|spa)|"
    r"inject|botox|filler|facial|wellness spa|rejuvenat)", re.I)

def is_chain(name):
    n = (name or "").lower()
    return any(c in n for c in CHAINS)

def is_false_pos(name, keywords=""):
    blob = f"{name} {keywords}".lower()
    return any(k in blob for k in FALSE_POS)

def relevance(org):
    blob = " ".join(filter(None, [
        org.get("name", ""),
        " ".join(org.get("keywords", []) or []),
        org.get("industry", "") or "",
    ]))
    return bool(GREEN_RE.search(blob))

def device_signal(text):
    t = (text or "").lower()
    return "; ".join(sorted({k for k in DEVICE_KW if k in t}))

def tier(acct):
    has_device = bool(acct.get("device_signal"))
    reviews = acct.get("review_count") or 0
    rating = acct.get("rating") or 0
    if has_device and (reviews >= 100 or acct.get("tier_hint") == "A"):
        return "A"
    if has_device or rating >= 4.5 or reviews >= 50 or acct.get("revenue"):
        return "B"
    return "C"

def main():
    accounts = {}

    # 1. Seed accounts from Places intel (pre-qualified)
    for s in cfg["seed_accounts"]:
        key = s["name"].lower()
        accounts[key] = {**s, "apollo_id": "", "domain": "", "revenue": "",
                         "employees": "", "linkedin": "", "website": "", "phone": ""}

    # 2. Apollo org pages
    for path in sorted(glob.glob(os.path.join(BASE, "apollo_orgs_*.json"))):
        data = json.load(open(path))
        orgs = data.get("organizations") or data.get("accounts") or data
        for org in orgs:
            name = org.get("name") or ""
            if not name or is_chain(name) or is_false_pos(name, " ".join(org.get("keywords", []) or [])):
                continue
            if not relevance(org):
                continue
            key = (org.get("primary_domain") or name).lower()
            dupe = accounts.get(key) or accounts.get(name.lower())
            row = dupe or {"name": name, "source": os.path.basename(path), "tier_hint": ""}
            row.update({
                "apollo_id": org.get("id", row.get("apollo_id", "")),
                "domain": org.get("primary_domain", row.get("domain", "")),
                "website": org.get("website_url", row.get("website", "")),
                "linkedin": org.get("linkedin_url", row.get("linkedin", "")),
                "phone": (org.get("primary_phone") or {}).get("number", row.get("phone", "")) if isinstance(org.get("primary_phone"), dict) else row.get("phone", ""),
                "employees": org.get("estimated_num_employees", row.get("employees", "")),
                "revenue": org.get("annual_revenue", row.get("revenue", "")),
                "city": row.get("city") or ", ".join(filter(None, [org.get("city", ""), org.get("state", "")])),
                "category": row.get("category") or (org.get("industry") or ""),
            })
            row["device_signal"] = row.get("device_signal") or device_signal(" ".join(org.get("keywords", []) or []))
            accounts[key] = row
            if dupe is None and name.lower() in accounts and key != name.lower():
                del accounts[name.lower()]

    # Post-merge: same row object stored under two keys, plus seed rows (no domain)
    # whose name is a prefix/substring of the fuller Apollo name.
    def norm(n):
        n = re.sub(r"[^a-z0-9 ]", "", (n or "").lower())
        n = re.sub(r"\b(and|the|llc|pc|pa|inc|associates|center|of)\b", "", n)
        return " ".join(n.split())

    seen_ids, uniq = set(), []
    for r in accounts.values():
        if id(r) in seen_ids:
            continue
        seen_ids.add(id(r))
        uniq.append(r)

    merged, rows = set(), []
    for i, a in enumerate(uniq):
        if i in merged:
            continue
        for j in range(i + 1, len(uniq)):
            if j in merged:
                continue
            b = uniq[j]
            na, nb = norm(a["name"]), norm(b["name"])
            contained = na and nb and (na in nb or nb in na)
            dom_ok = (not a.get("domain") or not b.get("domain")
                      or a["domain"] == b["domain"])
            if contained and dom_ok and (na == nb or not a.get("domain") or not b.get("domain")):
                keep, drop = (a, b) if a.get("domain") else (b, a)
                for k, v in drop.items():
                    if v and not keep.get(k):
                        keep[k] = v
                if drop.get("device_signal") and drop["device_signal"] not in (keep.get("device_signal") or ""):
                    keep["device_signal"] = "; ".join(filter(None, [keep.get("device_signal"), drop["device_signal"]]))
                if drop.get("tier_hint") == "A":
                    keep["tier_hint"] = "A"
                if a is not keep:
                    a = keep
                merged.add(j)
        rows.append(a)

    for r in rows:
        r["tier"] = tier(r)
    rows.sort(key=lambda r: (r["tier"], r["name"]))

    out = os.path.join(BASE, "microneedling_phl_accounts.csv")
    cols = ["tier", "name", "category", "city", "device_signal", "rating", "review_count",
            "revenue", "employees", "domain", "website", "linkedin", "phone", "apollo_id", "source"]
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    counts = {}
    for r in rows:
        counts[r["tier"]] = counts.get(r["tier"], 0) + 1
    print(f"accounts: {len(rows)}  tiers: {counts}  -> {out}")

if __name__ == "__main__":
    main()
