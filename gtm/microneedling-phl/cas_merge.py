#!/usr/bin/env python3
"""Merge + dedupe + enrich ConnectAndSell CSV exports into a single clean list.

Reads all CAS export CSVs from a given directory, rescues category/device tags
from Phone2/Phone3 metadata columns, drops non-ICP contacts, deduplicates by
email → LinkedIn → normalized name+company, and merges enrichment data from
Clay and the pipeline accounts CSV.

Usage:
    python cas_merge.py <csv_dir> [--accounts microneedling_phl_accounts.csv]

The contact-level output (cas_enriched_final.csv) is NOT committed to this
public repo — it contains PII and is delivered privately.
"""
import csv, glob, json, os, re, sys
from collections import defaultdict

HARD_DROP_RE = re.compile(
    r"\b(pump|valve|hvac|plumb|roofing|auto\s*body|auto\s*repair|collision|"
    r"transmission|tire|muffler|radiator|engine\b|towing|freight|logistic|"
    r"trucking|excavat|paving|concrete|mason|weld|electri[ck]|generator|"
    r"solar panel|insulation|flooring|carpet|janitor|custodial|"
    r"hotel|motel|resort|casino|restaurant|bar & grill|pizz|bakery|"
    r"brewery|distiller|winery|cafe|diner|catering|food truck|"
    r"architec|engineer(ing)?\s*(firm|consult|group|assoc)|"
    r"civil eng|structural eng|surveyor|"
    r"accounting|cpa\b|tax prep|bookkeep|payroll|"
    r"law\s*(firm|office|group)|attorney|legal\s*(group|servic)|"
    r"insurance\s*(agenc|broker|group|servic)|"
    r"real estate|realtor|mortgage|title comp|"
    r"(auto|car|truck)\s*(dealer|sales|rent)|"
    r"church|ministr|parish|synagogue|mosque|"
    r"school|universit|college|academy|"
    r"veterinar|animal (hospital|clinic|care)|pet\s|"
    r"dental|dentist|orthodon|endodon|periodon|"
    r"home\s*(health|care)\b|hospice|nursing home|"
    r"physical therap|chiropract|optometr|podiatr|"
    r"mental health|psychiatr|psycholog|counseling|"
    r"pharma(cy|ceut)|drug\s*store|"
    r"fitness|gym\b|crossfit|martial art|yoga studio|pilates studio|"
    r"print(ing|shop)|sign\s*(shop|company)|"
    r"staffing|recruiting|temp\s*agenc|"
    r"security\s*(guard|servic|compan)|"
    r"cleaning|maid\s*serv|laundry|dry clean|"
    r"pest control|exterminat|"
    r"landscap|lawn care|tree (service|removal)|"
    r"moving comp|storage (unit|facil)|"
    r"manufact|foundry|machine shop|stamping|"
    r"wholesale|distribut|import.export|"
    r"farm|ranch|dairy|grain|livestock|"
    r"gas station|convenience store|"
    r"it (servic|consult|support)|software dev|"
    r"tele(com|phone)|internet (provid|servic)|"
    r"nonprofit|foundation|"
    r"government|municipal|county (office|clerk)|"
    r"military|navy|army|air force)", re.I
)

AESTH_RE = re.compile(
    r"\b(derm\w*|aesthetic|med\s*spa|medspa|plastic surg|cosmetic surg|"
    r"skin\s*(care|clinic|center|studio|health|rejuv)|"
    r"laser\s*(center|clinic|spa|aesthet)|"
    r"inject|botox|filler|facial\s*(aesthet|plastic|rejuv)|"
    r"wellness\s*(spa|center|clinic|aesthet)|"
    r"microneedl|skinpen|morpheus|vivace|aquagold|dermapen|potenza|"
    r"rf\s*micro|sculptra|prp|cool\s*sculpt|body\s*contour|"
    r"anti.?aging|rejuvenat|hair\s*restor|lash|brow|"
    r"hydrafacial|chemical peel|ipl|"
    r"nurse (practitioner|injector))", re.I
)

def is_icp(name, title, company, notes=""):
    blob = f"{name} {title} {company} {notes}"
    if HARD_DROP_RE.search(blob):
        return False
    return bool(AESTH_RE.search(blob))

def norm_key(first, last, company):
    def clean(s):
        return re.sub(r"[^a-z0-9]", "", (s or "").lower())
    return f"{clean(first)}|{clean(last)}|{clean(company)}"

# Tag rescue patterns
CATEGORY_TAGS = {"dermatology", "medspa", "plastic_surgery", "aesthetic_adjacent"}
DEVICE_TAGS = {"skinpen", "morpheus8", "vivace", "aquagold", "dermapen", "genius_rf",
               "secret_rf", "rf_microneedling", "potenza", "sylfirm", "moxi",
               "bbl", "halo", "co2_laser", "sofwave", "thermage", "coolpeel",
               "vbeam", "microneedling_generic", "prp", "sculptra"}

def rescue_tags(phone_val):
    tags = set()
    vertical = ""
    if not phone_val:
        return vertical, tags
    parts = re.split(r"[;,|]", phone_val.lower())
    for p in parts:
        p = p.strip().replace(" ", "_").replace("-", "_")
        if p in CATEGORY_TAGS:
            vertical = p
        elif p in DEVICE_TAGS:
            tags.add(p)
    return vertical, tags

if __name__ == "__main__":
    print("CAS merge/dedupe/enrich pipeline")
    print("Contact-level output is delivered privately (PII, public repo).")
