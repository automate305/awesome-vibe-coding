#!/usr/bin/env python3
"""
Daily GTM outbound pipeline.
Finds new HVAC contacts in South Florida via ColdIQ, enriches them,
and outputs a JSON file for the routine to ingest into Apollo.

Usage: COLDIQ_API_KEY=... python3 pipeline.py [--max-contacts 15]

Output: writes enriched_contacts.json to gtm-outbound/data/
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from coldiq import ColdIQ


LOCATIONS = [
    "Miami, Florida",
    "Fort Lauderdale, Florida",
    "West Palm Beach, Florida",
    "Hialeah, Florida",
    "Pompano Beach, Florida",
    "Hollywood, Florida",
    "Coral Springs, Florida",
    "Boca Raton, Florida",
    "Doral, Florida",
    "Homestead, Florida",
]

INDUSTRIES = [
    "HVAC",
    "air conditioning",
    "heating and cooling",
    "mechanical contractor",
    "plumbing and HVAC",
]

DECISION_MAKER_TITLES = [
    "President",
    "Owner",
    "CEO",
    "VP Operations",
    "General Manager",
    "Operations Manager",
    "Vice President",
]

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
STATE_FILE = os.path.join(DATA_DIR, "state.json")
OUTPUT_FILE = os.path.join(DATA_DIR, "enriched_contacts.json")


def load_state():
    with open(STATE_FILE) as f:
        return json.load(f)


def save_output(contacts):
    with open(OUTPUT_FILE, "w") as f:
        json.dump(contacts, f, indent=2)
    print(f"Wrote {len(contacts)} enriched contacts to {OUTPUT_FILE}")


def run_pipeline(max_contacts=15):
    ciq = ColdIQ()
    state = load_state()
    processed = set(state.get("processed_ids", []))
    last_page = state.get("last_search_page", 0)

    enriched = []
    page = last_page
    attempts = 0

    print(f"Starting from page {page}, {len(processed)} domains already processed")

    while len(enriched) < max_contacts and attempts < 10:
        attempts += 1
        print(f"\nSearching page {page}...")

        try:
            companies = ciq.find_companies(
                industries=INDUSTRIES,
                locations=LOCATIONS,
                employee_min=1,
                employee_max=200,
                page=page,
                size=20,
            )
        except Exception as e:
            print(f"  Company search failed: {e}")
            page += 1
            continue

        results = companies.get("results", companies.get("data", []))
        if not results:
            print("  No more results")
            break

        for company in results:
            if len(enriched) >= max_contacts:
                break

            domain = company.get("domain", company.get("website", ""))
            if not domain:
                continue
            domain = domain.replace("https://", "").replace("http://", "").rstrip("/")

            if domain in processed:
                continue

            name = company.get("name", company.get("company_name", ""))
            city = company.get("city", company.get("location", ""))
            print(f"  Found: {name} ({domain}) — {city}")

            # Enrich company
            company_data = None
            try:
                company_data = ciq.company_enrich(domain)
                print(f"    Company enriched")
            except Exception as e:
                print(f"    Company enrich failed: {e}")

            # Find decision maker via AI Ark people search
            contact = None
            try:
                people = ciq.find_people_aiark(
                    company_name=name,
                    titles=DECISION_MAKER_TITLES,
                )
                candidates = people.get("results", people.get("data", []))
                if candidates:
                    contact = candidates[0]
                    print(f"    Contact: {contact.get('first_name', '')} {contact.get('last_name', '')} — {contact.get('title', '')}")
            except Exception as e:
                print(f"    People search failed: {e}")

            if not contact:
                print(f"    No decision maker found, skipping")
                continue

            first_name = contact.get("first_name", "")
            last_name = contact.get("last_name", "")
            linkedin_url = contact.get("linkedin_url", contact.get("linkedin", ""))

            # Email waterfall
            email = contact.get("email")
            email_source = "aiark"
            if not email:
                email_result = ciq.find_email_waterfall(
                    first_name, last_name, domain, linkedin_url
                )
                if email_result:
                    email = email_result["email"]
                    email_source = email_result["source"]
                    print(f"    Email found via {email_source}: {email}")
                else:
                    print(f"    No email found, skipping")
                    continue
            else:
                # Verify existing email
                try:
                    verify = ciq.findymail_verify(email)
                    if verify.get("status") == "invalid":
                        print(f"    Email invalid, trying waterfall...")
                        email_result = ciq.find_email_waterfall(
                            first_name, last_name, domain, linkedin_url
                        )
                        if email_result:
                            email = email_result["email"]
                            email_source = email_result["source"]
                except Exception:
                    pass

            # Phone enrichment
            phone = None
            if linkedin_url:
                try:
                    fe = ciq.fullenrich(linkedin_url)
                    phone = fe.get("phone")
                    if phone:
                        print(f"    Phone found: {phone}")
                except Exception:
                    pass

            enriched.append({
                "domain": domain,
                "company": name,
                "city": city or "",
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "email_source": email_source,
                "phone": phone,
                "title": contact.get("title", ""),
                "linkedin_url": linkedin_url or "",
                "company_data": company_data,
                "page_found": page,
            })

            processed.add(domain)

        page += 1

    save_output(enriched)
    print(f"\nPipeline complete: {len(enriched)} contacts enriched")
    print(f"Last page consumed: {page}")
    return enriched


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-contacts", type=int, default=15)
    args = parser.parse_args()
    run_pipeline(args.max_contacts)
