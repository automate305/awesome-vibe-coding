"""
ColdIQ API client — unified access to 14 B2B enrichment services.
Base URL: https://api.coldiq.com/v1/{service}/{endpoint}
Auth: Bearer token (COLDIQ_API_KEY env var)
"""

import os
import json
import time
import requests

BASE_URL = "https://api.coldiq.com/v1"


class ColdIQ:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get("COLDIQ_API_KEY")
        if not self.api_key:
            raise ValueError("COLDIQ_API_KEY not set")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _post(self, path, payload, retries=3):
        url = f"{BASE_URL}/{path}"
        for attempt in range(retries):
            try:
                r = requests.post(url, json=payload, headers=self.headers, timeout=30)
                r.raise_for_status()
                return r.json()
            except requests.exceptions.RequestException as e:
                if attempt == retries - 1:
                    raise
                time.sleep(2 ** attempt)

    def _get(self, path, params=None, retries=3):
        url = f"{BASE_URL}/{path}"
        for attempt in range(retries):
            try:
                r = requests.get(url, headers=self.headers, params=params, timeout=30)
                r.raise_for_status()
                return r.json()
            except requests.exceptions.RequestException as e:
                if attempt == retries - 1:
                    raise
                time.sleep(2 ** attempt)

    # ── PROSPECTING ──────────────────────────────────────────────

    def find_companies(self, industries, locations, employee_min=1, employee_max=200, page=0, size=10):
        """AI Ark: search companies by industry, location, headcount."""
        return self._post("ai-ark/companies", {
            "account": {
                "employeeSize": {
                    "type": "RANGE",
                    "range": [{"start": employee_min, "end": employee_max}],
                },
                "industries": {
                    "any": {"include": {"mode": "WORD", "content": industries}}
                },
                "location": {"any": {"include": locations}},
            },
            "page": page,
            "size": size,
        })

    def find_people_aiark(self, company_name=None, titles=None, location=None):
        """AI Ark: find people at a company."""
        payload = {}
        if company_name:
            payload["company"] = company_name
        if titles:
            payload["titles"] = titles
        if location:
            payload["location"] = location
        return self._post("ai-ark/people", payload)

    def wiza_reveal(self, linkedin_url, enrichment_level="partial", accept_personal=False):
        """Wiza: reveal contact from LinkedIn URL."""
        return self._post("wiza/individual-reveals", {
            "individual_reveal": {"profile_url": linkedin_url},
            "enrichment_level": enrichment_level,
            "email_options": {
                "accept_work": True,
                "accept_personal": accept_personal,
            },
        })

    # ── EMAIL FINDING & VERIFICATION ─────────────────────────────

    def findymail_find(self, first_name, last_name, domain):
        """Findymail: find verified work email."""
        return self._post("findymail/find", {
            "first_name": first_name,
            "last_name": last_name,
            "domain": domain,
        })

    def findymail_verify(self, email):
        """Findymail: verify email deliverability."""
        return self._post("findymail/verify", {
            "email": email,
        })

    def icypeas_find(self, first_name, last_name, domain):
        """Icypeas: find email address."""
        return self._post("icypeas/email-search", {
            "first_name": first_name,
            "last_name": last_name,
            "domain": domain,
        })

    # ── PHONE & FULL ENRICHMENT ──────────────────────────────────

    def fullenrich(self, first_name, last_name, domain, enrich_fields=None):
        """FullEnrich: email + phone enrichment (bulk endpoint, single contact)."""
        if enrich_fields is None:
            enrich_fields = ["contact.emails", "contact.phones"]
        result = self._post("fullenrich/contact/enrich/bulk", {
            "name": "gtm-enrichment",
            "data": [{
                "first_name": first_name,
                "last_name": last_name,
                "domain": domain,
                "enrich_fields": enrich_fields,
            }],
        })
        return result

    def fullenrich_by_linkedin(self, linkedin_url, enrich_fields=None):
        """FullEnrich: enrich via LinkedIn URL."""
        if enrich_fields is None:
            enrich_fields = ["contact.emails", "contact.phones"]
        result = self._post("fullenrich/contact/enrich/bulk", {
            "name": "gtm-enrichment",
            "data": [{
                "linkedin_url": linkedin_url,
                "enrich_fields": enrich_fields,
            }],
        })
        return result

    def blitzapi_enrich(self, linkedin_url):
        """BlitzAPI: LinkedIn profile enrichment."""
        return self._post("blitzapi/enrich", {
            "linkedin_url": linkedin_url,
        })

    # ── COMPANY ENRICHMENT ───────────────────────────────────────

    def company_enrich(self, domain):
        """CompanyEnrich: full company profile from domain."""
        return self._post("companyenrich/enrich", {
            "domain": domain,
        })

    def linkup_company(self, domain):
        """LinkUp API: company intelligence."""
        return self._post("linkup/company", {
            "domain": domain,
        })

    def ocean_company(self, domain):
        """Ocean: company data enrichment."""
        return self._post("ocean/company", {
            "domain": domain,
        })

    def sumble_company(self, domain):
        """Sumble: company matching and enrichment."""
        return self._post("sumble/company", {
            "domain": domain,
        })

    # ── WEB & SOCIAL INTELLIGENCE ────────────────────────────────

    def reddit_search(self, query, subreddit=None):
        """Reddit: search posts and comments."""
        payload = {"query": query}
        if subreddit:
            payload["subreddit"] = subreddit
        return self._post("reddit/search", payload)

    def exa_search(self, query):
        """Exa: AI-powered web search."""
        return self._post("exa/search", {
            "query": query,
        })

    def adyntel_search(self, domain):
        """Adyntel: ad intelligence for a domain."""
        return self._post("adyntel/search", {
            "domain": domain,
        })

    def discolike_search(self, domain):
        """DiscoLike: discover similar companies/sites."""
        return self._post("discolike/search", {
            "domain": domain,
        })

    # ── WATERFALL ENRICHMENT ─────────────────────────────────────

    def find_email_waterfall(self, first_name, last_name, domain, linkedin_url=None):
        """Try multiple sources to find a verified email.
        Order: Findymail → Icypeas → FullEnrich → Wiza
        Returns: {"email": str, "source": str, "verified": bool} or None
        """
        # 1. Findymail
        try:
            result = self.findymail_find(first_name, last_name, domain)
            email = result.get("email")
            if email:
                return {"email": email, "source": "findymail", "verified": True}
        except Exception:
            pass

        # 2. Icypeas
        try:
            result = self.icypeas_find(first_name, last_name, domain)
            email = result.get("email")
            if email:
                return {"email": email, "source": "icypeas", "verified": False}
        except Exception:
            pass

        # 3. FullEnrich
        try:
            result = self.fullenrich(first_name, last_name, domain,
                                     enrich_fields=["contact.emails"])
            data = result.get("data", [{}])
            if data and isinstance(data, list):
                email = data[0].get("email")
                if email:
                    return {"email": email, "source": "fullenrich", "verified": False}
        except Exception:
            pass

        # 4. Wiza (needs LinkedIn URL)
        if linkedin_url:
            try:
                result = self.wiza_reveal(linkedin_url)
                email = result.get("email")
                if email:
                    return {"email": email, "source": "wiza", "verified": False}
            except Exception:
                pass

        return None

    def enrich_contact_full(self, first_name, last_name, domain, linkedin_url=None):
        """Full enrichment pipeline for a single contact.
        Returns dict with email, phone, company_data, and enrichment sources used.
        """
        result = {
            "email": None,
            "phone": None,
            "company_data": None,
            "sources_used": [],
        }

        # Email waterfall
        email_result = self.find_email_waterfall(first_name, last_name, domain, linkedin_url)
        if email_result:
            result["email"] = email_result["email"]
            result["sources_used"].append(f"email:{email_result['source']}")

        # Phone (via FullEnrich or BlitzAPI)
        try:
            if linkedin_url:
                fe = self.fullenrich_by_linkedin(linkedin_url,
                                                  enrich_fields=["contact.phones"])
            else:
                fe = self.fullenrich(first_name, last_name, domain,
                                     enrich_fields=["contact.phones"])
            data = fe.get("data", [{}])
            if data and isinstance(data, list):
                phone = data[0].get("phone")
                if phone:
                    result["phone"] = phone
                    result["sources_used"].append("phone:fullenrich")
        except Exception:
            try:
                if linkedin_url:
                    ba = self.blitzapi_enrich(linkedin_url)
                    phone = ba.get("phone")
                    if phone:
                        result["phone"] = phone
                        result["sources_used"].append("phone:blitzapi")
            except Exception:
                pass

        # Company enrichment
        try:
            result["company_data"] = self.company_enrich(domain)
            result["sources_used"].append("company:companyenrich")
        except Exception:
            pass

        return result
