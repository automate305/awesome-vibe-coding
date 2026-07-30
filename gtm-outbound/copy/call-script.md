# Cold Call Script — Automate305 HVAC Campaign

---

## Opener (first 10 seconds matter)

```
Hey {{first_name}}, this is Camilo with Automate305.
I work with HVAC companies here in the Miami area —
do you have 30 seconds? I'll be quick.
```

**If yes:**
```
I help HVAC owners automate the stuff that eats up their day —
scheduling, dispatch, customer follow-ups, invoicing.
Most owners I talk to are spending 2-3 hours a day on admin
when it could be running on autopilot.

I'd love to do a quick audit of your current setup and show you
where the biggest time savings are. Would a 15-minute call
later this week work?
```

**If "what do you mean by automate?":**
```
Good question. Things like — when a lead comes in through your
website or Google, they automatically get a text and email.
Your schedule updates in real time. Invoices go out the same day
the job's done. That kind of thing. No more chasing paperwork.
```

---

## Objection Handling

**"I'm too busy right now"**
```
Totally get it — that's actually why I'm calling.
The whole point is to free up your time. What if we just did
15 minutes next week when things slow down?
```

**"How much does this cost?"**
```
It depends on what you need, but I start with a free audit —
no obligation. Most of my clients see ROI in the first month
because they stop losing leads to slow response times.
Can I show you what that looks like for {{company}}?
```

**"We already have software for that"**
```
Nice — what are you using? [Listen]
A lot of shops I talk to have pieces in place but they're not
connected. The magic is when everything talks to each other
automatically. Would it be worth a quick look to see if
there are any gaps?
```

**"Send me an email"**
```
Absolutely — what's the best email? [Get email, confirm]
I'll send something over today. Fair warning, I'll follow up
in a couple days to make sure it didn't land in spam.
```

**"Not interested"**
```
No worries at all, {{first_name}}. If anything changes down
the road, I'm easy to find. Have a great one.
```

---

## Meeting Set Close

```
Great — how does [suggest 2 specific times] look?
I can do virtual or I can swing by your office if you're
in the Miami area. What works better?
```

---

## Post-Call Actions
- Log call outcome in HubSpot (connected/voicemail/not interested/meeting set)
- If meeting set → create HubSpot deal + calendar invite
- If voicemail → leave 20-second message version of opener, move to next email touch
- If "send me an email" → trigger Email 1 immediately
