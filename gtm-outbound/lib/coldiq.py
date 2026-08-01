"""
ColdIQ API client — unified access to B2B enrichment services.
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

    def blitzapi_search(self, company_linkedin_url, titles, locations=None, max_results=10):
        """BlitzAPI: ICP keyword search — find people by title at a company."""
        cascade_entry = {
            "include_title": titles,
            "exclude_title": ["Intern"],
            "include_headline_search": True,
        }
        if locations:
            cascade_entry["location"] = locations
        return self._post("blitzapi/search/waterfall-icp-keyword", {
            "company_linkedin_url": company_linkedin_url,
            "cascade": [cascade_entry],
            "max_results": max_results,
        })

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

    def icypeas_find(self, first_name, last_name, domain_or_company):
        """Icypeas: find email address."""
        return self._post("icypeas/email-search", {
            "firstname": first_name,
            "lastname": last_name,
            "domainOrCompany": domain_or_company,
        })

    # ── PHONE & FULL ENRICHMENT ──────────────────────────────────

    def fullenrich(self, first_name, last_name, domain, enrich_fields=None):
        """FullEnrich: email + phone enrichment (bulk endpoint, single contact)."""
        if enrich_fields is None:
            enrich_fields = ["contact.emails", "contact.phones"]
        return self._post("fullenrich/contact/enrich/bulk", {
            "name": "gtm-enrichment",
            "data": [{
                "first_name": first_name,
                "last_name": last_name,
                "domain": domain,
                "enrich_fields": enrich_fields,
            }],
        })

    def fullenrich_by_linkedin(self, linkedin_url, enrich_fields=None):
        """FullEnrich: enrich via LinkedIn URL."""
        if enrich_fields is None:
            enrich_fields = ["contact.emails", "contact.phones"]
        return self._post("fullenrich/contact/enrich/bulk", {
            "name": "gtm-enrichment",
            "data": [{
                "linkedin_url": linkedin_url,
                "enrich_fields": enrich_fields,
            }],
        })

    def linkup_enrich(self, first_name, last_name, company_name):
        """LinkUp API: person enrichment by name + company."""
        return self._post("linkupapi/data/profil/enrich", {
            "first_name": first_name,
            "last_name": last_name,
            "company_name": company_name,
        })

    # ── COMPANY ENRICHMENT ───────────────────────────────────────

    def company_enrich(self, domain):
        """CompanyEnrich: full company profile from domain (GET request)."""
        return self._get("companyenrich/companies/enrich", params={"domain": domain})

    def sumble_find(self, filters, limit=10):
        """Sumble: find organizations by filters (technologies, etc)."""
        return self._post("sumble/organizations/find", {
            "filters": filters,
            "limit": limit,
        })

    def ocean_company(self, domain):
        """Ocean: company data enrichment."""
        return self._post("ocean/company", {
            "domain": domain,
        })

    # ── WEB & SOCIAL INTELLIGENCE ────────────────────────────────

    def reddit_scrape(self, subreddit_url, search_type="posts", sort="hot", max_items=10):
        """Reddit: scrape posts/comments from a subreddit."""
        return self._post("reddit/scrape", {
            "startUrls": [{"url": subreddit_url}],
            "searchType": search_type,
            "sort": sort,
            "maxItems": max_items,
        })

    def serper_search(self, query, num=10, page=1, gl="us", hl="en", location=None):
        """Serper: Google search results."""
        payload = {
            "q": query,
            "num": num,
            "page": page,
            "gl": gl,
            "hl": hl,
            "autocorrect": False,
        }
        if location:
            payload["location"] = location
        return self._post("serper/search", payload)

    def exa_search(self, query, num_results=10, include_text=True):
        """Exa: AI-powered web search with content extraction."""
        return self._post("exa/search", {
            "query": query,
            "numResults": num_results,
            "contents": {"text": include_text},
        })

    def google_ads_search(self, domains, max_ads=50):
        """Google Ads: find active ads for domains — reveals messaging, offers, landing pages."""
        return self._post("google-ads/search", {
            "domains": domains,
            "maxAds": max_ads,
        })

    def adyntel_facebook(self, company_domain, country_code="US"):
        """Adyntel: Facebook ad intelligence for a domain."""
        return self._post("adyntel/facebook", {
            "company_domain": company_domain,
            "country_code": country_code,
        })

    def dataforseo_youtube_locations(self, country_iso_code="US"):
        """DataForSEO: get YouTube SERP locations for a country."""
        return self._post("dataforseo/serp/youtube/locations", {
            "country_iso_code": country_iso_code,
        })

    def discolike_search(self, domain):
        """DiscoLike: discover similar companies/sites."""
        return self._post("discolike/search", {
            "domain": domain,
        })

    def openmart_search(self, query, city=None, state=None, country="US", limit=10, has_website=True):
        """OpenMart: local business search by query and location."""
        payload = {
            "query": query,
            "limit": limit,
            "has_website": has_website,
        }
        if city or state:
            payload["location"] = {
                "country": country,
            }
            if city:
                payload["location"]["city"] = city
            if state:
                payload["location"]["state"] = state
        return self._post("openmart/search", payload)

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

    def enrich_contact_full(self, first_name, last_name, domain, linkedin_url=None, company_name=None):
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

        # Phone (via FullEnrich or LinkUp)
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
                if company_name:
                    lu = self.linkup_enrich(first_name, last_name, company_name)
                    phone = lu.get("phone")
                    if phone:
                        result["phone"] = phone
                        result["sources_used"].append("phone:linkup")
            except Exception:
                pass

        # Company enrichment (GET endpoint)
        try:
            result["company_data"] = self.company_enrich(domain)
            result["sources_used"].append("company:companyenrich")
        except Exception:
            pass

        return result
