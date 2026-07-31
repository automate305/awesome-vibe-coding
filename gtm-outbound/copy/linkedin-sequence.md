# LinkedIn Sequence — Automate305 HVAC Campaign
# Free LinkedIn account — all touches are manual, no InMail

---

## How This Works (Free LinkedIn)

1. The routine generates a daily task list of prospects at LinkedIn steps
2. You send connection requests manually (with the note below)
3. The routine checks back on subsequent cycles — prospects who accepted
   get queued for the follow-up message
4. Prospects who haven't accepted after 14 days get skipped (status: "linkedin_no_accept")
   and the sequence continues to the next email touch

---

## Touch 1 — Connection Request (Day 1, manual)

**Daily task list format:**
```
LINKEDIN CONNECTION REQUESTS — {{date}}
- [ ] {{first_name}} {{last_name}} @ {{company}} — {{linkedin_url}}
- [ ] {{first_name}} {{last_name}} @ {{company}} — {{linkedin_url}}
```

**Note to paste (300 char max):**
```
Hey {{first_name}}, fellow South Florida business owner here. I work with HVAC companies on automating ops. Would love to connect and swap notes on the market down here.
```

**After sending:** Mark as done in the task list. The routine tracks that
the request was sent and starts the 14-day acceptance window.

---

## Touch 2 — Follow-Up Message (Day 9, only if accepted)

**Daily task list format:**
```
LINKEDIN FOLLOW-UPS (accepted connections) — {{date}}
- [ ] {{first_name}} {{last_name}} @ {{company}} — {{linkedin_url}}
```

**Message to paste:**
```
Thanks for connecting, {{first_name}}.

I help HVAC shops automate scheduling, dispatch, and customer follow-ups so owners aren't glued to the phone all day. If you're ever curious what that looks like, happy to walk you through it. No pitch, just a quick demo.

Either way, great to be connected.
```

---

## Tracking Rules

| Scenario | Action |
|----------|--------|
| Connection request sent | Set `linkedin_requested: true`, `linkedin_requested_date: today` |
| Connection accepted (you confirm manually) | Set `linkedin_accepted: true`, queue follow-up message |
| Connection not accepted after 14 days | Set `status: "linkedin_no_accept"`, skip to next email touch |
| Follow-up message sent (you confirm manually) | Advance sequence step normally |

---

## Daily Workflow (5-10 min)

1. Open the LinkedIn task list from the routine output
2. Send connection requests (batch of 10-20 max to avoid LinkedIn limits)
3. Check pending requests from previous days — mark accepted ones
4. Send follow-up messages to accepted connections
5. Report back which ones you completed (the routine updates state)

## LinkedIn Free Account Limits
- ~100 connection requests per week (stay under to avoid restrictions)
- No InMail — skip any prospect without a findable LinkedIn profile
- Keep connection notes under 300 characters
