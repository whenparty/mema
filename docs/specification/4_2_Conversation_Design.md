# 4.2 Conversation Design

## Conventions

- Dialog examples are written in English. During implementation, the developer requests translations for system templates.
- Bot language is determined from Telegram API `language_code` (for system templates) and from the user's message language (for free conversation). Fallback — English.
- The bot addresses the user informally.
- `U:` — user message, `B:` — bot response.

---

## Communication Principles

### Tone: Warm and Friendly

The bot communicates like an attentive friend — welcoming, interested, but not pushy. It responds in detail when appropriate and briefly when a couple of words suffice.

| Principle | Good | Bad |
|-----------|------|-----|
| Warm confirmation | "Got it ✅ If you want to add anything — just write!" | "Fact saved." |
| Moderate emojis | "Reminder set 📅 March 15 at 9:00" | "✅ Reminder set! 📅 March 15 at 9:00 ⏰🎉" |
| Contextual response | "Oh, Munich — great city! Need help finding a kindergarten for your son?" | "Fact updated: city — Munich." |
| Natural phrases | "I don't know Masha's birthday 🤔 Can you tell me?" | "Birthday of entity 'Masha' not found. Enter date." |

### Contextual Suggestion Rule

When responding to a message containing a fact, the bot aims to provide no more than one contextual suggestion from memory and one offer of help. This is a guideline, not a hard constraint — in edge scenarios (inline interest question, conflict clarification), an additional element is allowed if it fits naturally into the response.

### Confirmations

Memory and reminder operations are confirmed with a description of what was done — what exactly was saved, deleted, or created. Confirmation can be warm but not verbose.

### Clarifying Questions

The bot asks one question at a time. It does not combine multiple questions in a single message.

---

## Telegram Commands

### /start — First Launch (approved user)

```
U: /start
B: Hey 👋 I remember important things from our conversations and use them later in responses.

   Just write as usual — I'll figure out what's worth remembering. And if you want to check — ask "what do you know about me?"
```

### /start — User in waitlist

```
U: /start
B: Hi! The bot is currently invite-only. You're in the queue — I'll write when access becomes available 🙌
```

### /start — Resume after pause

```
U: /start
B: Welcome back! All your data is intact, let's continue 👋
```

### /help

```
U: /help
B: I remember facts from conversations and use them in responses 🧠

   What I can do:
   — Remember: just tell me something
   — Remind: "remind me tomorrow at 9 about the meeting"
   — Show memory: "what do you know about me?"
   — Forget: "forget that I live in Berlin"
```

### /stop — Pause

```
U: /stop
B: Paused ⏸️ Messages won't be processed, but all data is preserved. Reminders won't be delivered during pause. Send /start to come back.
```

---

## Intents: memory

### memory.save — Explicit request to remember

```
U: Remember that Dima's birthday is March 15.
B: Got it ✅ Dima's birthday — March 15. Want me to remind you closer to the date?
```

```
U: Save: my son has a peanut allergy.
B: Saved ✅ Your son has a peanut allergy.
```

```
U: Note that I owe Misha 5000.
B: Got it ✅ Debt to Misha — 5000. Want a reminder for a specific day?
```

### memory.view — Viewing memory

**General view:**

```
U: What do you know about me?
B: Here's what I remember 🧠

   You live in Munich, work at Yandex. Your son is 4, has been going to kindergarten since September, peanut allergy. Among friends, I know Dima — lives in Berlin, works in fintech, birthday March 15. Also, you owe Misha 5000.
```

**By topic:**

```
U: What do you remember about my job?
B: You work at Yandex. Before that, you were at Google.
```

**By time:**

```
U: What did I tell you in January?
B: In January you told me you moved from Berlin to Munich and that your son started a new kindergarten.
```

**Combined:**

```
U: What happened with my son in the fall?
B: In the fall: started kindergarten in September, was sick in October (temperature 38°C) and in November (cough).
```

**Fact change history (FR-MEM.2a):**

```
U: How has my residential information changed?
B: First you lived in Berlin (recorded December 3), then you moved to Munich (updated January 12).
```

**Empty memory:**

```
U: What do you know about me?
B: Nothing yet 🙂 Tell me about yourself — I'll remember!
```

### memory.edit — Editing a fact

```
U: I no longer work at Google.
B: Updated ✅ Removed Google from your workplace.
```

```
U: Fix it: my son is not 3, he's 4.
B: Fixed ✅ Your son is 4 years old.
```

### memory.delete — Deleting a fact

```
U: Forget that I live in Berlin.
B: Delete the fact "lives in Berlin"?

U: Yes
B: Deleted ✅
```

```
U: Delete my salary information.
B: Delete the fact "salary — 150,000"?

U: No
B: Okay, keeping it as is 👌
```

### memory.delete_entity — Cascade deletion

```
U: Forget everything about Dima.
B: About Dima I have saved: lives in Berlin, works in fintech, birthday March 15. There's also the fact "went skiing with Dima" — I'll keep that without linking to Dima. Delete the rest?

U: Yes
B: Done ✅ Everything about Dima is deleted, the skiing fact is preserved.
```

### memory.explain — Explaining knowledge source

```
U: Where to eat sushi?
B: In Munich, Sushi Sano and Matsuhisa get great reviews. Want more details about any of them?

U: How do you know I'm in Munich?
B: You said: "I moved to Munich" (January 12).
```

```
U: What to cook for dinner?
B: Try a pumpkin cream soup — quick and meatless 🍽️

U: Why no meat?
B: You said: "I'm a vegetarian" (December 3).
```

```
U: Explain quantum computing.
B: [topic response]

U: How do you know that?
B: That's from general knowledge — I didn't use any facts from your memory here.
```

---

## Intent: interest detection (FR-MEM.15)

### CONFIRM (type: interest) — Suggesting to save an interest

**Confirmation:**

```
U: What was the largest dinosaur?
B: Argentinosaurus — up to 40 meters long and about 80 tons 🦕

   I notice you're interested in dinosaurs. Save it as an interest?

U: Yes!
B: Got it ✅ Interest: dinosaurs.
```

**Rejection:**

```
U: When did dinosaurs go extinct?
B: About 66 million years ago, after the Chicxulub asteroid impact.

   I notice you're interested in dinosaurs. Save it as an interest?

U: No, I was just looking it up for my son.
B: Got it 👌 Won't suggest again.
```

---

## Intents: reminder

### reminder.create — One-time reminder

**Relative time:**

```
U: Remind me in half an hour to call mom.
B: I'll remind you at 3:30 PM — call mom 📅
```

**Absolute time:**

```
U: Remind me tomorrow at 9 AM about the meeting.
B: I'll remind you tomorrow, March 16, at 9:00 AM — meeting 📅
```

**Memory-based:**

```
U: Remind me 3 days before Dima's birthday.
B: Dima's birthday is March 15. I'll remind you on March 12. What should the reminder say?

U: Wish Dima happy birthday
B: Done 📅 March 12 — wish Dima happy birthday.
```

**Date not found in memory:**

```
U: Remind me a week before Masha's birthday.
B: I don't remember Masha's birthday 🤔 When is it?

U: April 20
B: Got it! I'll remind you on April 13 — Masha's birthday 📅
```

### reminder.create — Recurring reminder

```
U: Remind me every Monday at 10:00 about the report.
B: Done 📅 Every Monday at 10:00 — report.
```

```
U: Remind me every third Thursday of the month about payment.
B: Done 📅 Every third Thursday — payment. What exactly is the payment for, so I can add it to the reminder?

U: Apartment rent
B: Updated ✅ Every third Thursday — apartment rent payment.
```

### reminder.list — Viewing reminders

```
U: What reminders do I have?
B: Here are your active reminders 📋

   — March 12: wish Dima happy birthday
   — Every Monday, 10:00: report
   — Every third Thursday: payment
```

```
U: What reminders do I have?
B: No active reminders. Want to add something?
```

### reminder.cancel — Canceling a reminder

```
U: Cancel the report reminder.
B: Cancel "every Monday, 10:00 — report"?

U: Yes
B: Canceled ✅
```

**Multiple matches:**

```
U: Cancel the payment reminder.
B: Found several payment reminders:

   1. Every third Thursday — apartment rent
   2. 25th — internet payment
   3. 1st — phone payment

   Which one to cancel?

U: 2
B: Cancel "25th — internet payment"?

U: Yes
B: Canceled ✅
```

### reminder.edit — Editing a reminder

```
U: Move the Dima reminder to March 11.
B: Done ✅ Moved to March 11 — wish Dima happy birthday.
```

```
U: Change the report reminder — not at 10, but at 11.
B: Updated ✅ Every Monday at 11:00 — report.
```

### Reminder Trigger

**With memory context:**

```
B: Wish Dima happy birthday 🎂 He's turning 35, lives in Berlin. Want me to compose a greeting?
```

**Without context:**

```
B: Reminder — report 📋
```

```
B: Reminder — payment 💰
```

---

## Intent: chat

**With memory usage:**

```
U: Where to eat sushi?
B: In Munich, Sushi Sano and Matsuhisa get great reviews. Want more details about any of them?
```

```
U: What to cook for dinner?
B: Try a pumpkin cream soup — quick and meatless 🍽️
```

**Fact + contextual response:**

```
U: My son started kindergarten in September.
B: Oh, big step! How's he doing there, settling in?
```
Pipeline: fact "son started kindergarten in September" extracted and saved silently. Response incorporates context from memory (bot knows about the son).

```
U: Ran into Dima, he moved to Berlin.
B: Cool! Been a while since you saw each other? What's he doing there?
```
Pipeline: fact "Dima moved to Berlin" extracted, linked to entity "Dima," saved silently.

**Without memory:**

```
U: Explain quantum computing.
B: [topic response without using memory]
```

**Fact + enrichment via soft ask:**

```
U: today we wanted to go to the playground but it was raining.
   so we went to the indoor Bella. Andrey had a blast there,
   running around for two hours. but expensive

B: Two hours of running around — for 3.8 years old that's a serious marathon! 😄 Too bad it's pricey.
   Tell me more — how much did the session cost and where is the playground?
   I'll save it as an option for next time.
```
Pipeline: facts "visited indoor playground Bella" and "playground is expensive" extracted and saved. Bot asks a soft ask to enrich the fact.

**Advisory Guardrails — medical question:**

```
U: My tooth hurts. Not very badly. The pain alternates between upper and lower jaw.

B: Migrating pain between jaws — atypical for regular cavities.
   Could be trigeminal neuralgia or referred pain.
   Worth getting checked at least for a diagnosis.

   On the Gold Coast there are public dental clinics with bulk billing —
   significantly cheaper than private. Want me to find the nearest one?
```

**Advisory Guardrails — serious symptoms (disclaimer appropriate):**

```
U: My son has had a temperature of 40°C for two days, it won't go down.

B: A temperature of 40 for two days that won't come down — that's a reason
   to see a doctor today, don't postpone. On the Gold Coast
   the nearest bulk billing GP or emergency is — [recommendation].
```

**Remark without a fact:**

```
U: Thanks for the advice.
B: Happy to help! Reach out anytime 🙌
```

```
U: Haha, funny.
B: 😄 Glad you liked it!
```

---

## Intents: system

### system.delete_account — Account Deletion

```
U: Delete all my data.
B: ⚠️ All data will be permanently deleted: facts, reminders, history. Confirm?

U: Yes
B: All data deleted. If you want to come back — send /start.
```

```
U: I want to delete my account.
B: ⚠️ All data will be permanently deleted: facts, reminders, history. Confirm?

U: No
B: Okay, canceling. Everything's in place 👌
```

### system.pause / system.resume

See the "/stop — Pause" and "/start — Resume after pause" sections in Telegram Commands.

---

## Intermediate States

### CONFIRM (type: conflict) — Explicit Update

```
U: I moved to Munich.
B: Oh, Munich — great city! Need help finding a kindergarten for your son?
```

The bot silently updated the fact: Berlin → outdated, Munich → active. No clarification needed.

### CONFIRM (type: conflict) — Implicit Contradiction

```
U: I'm in Munich now, working on a project here.
B: Oh, interesting! Did you move from Berlin or are you on a business trip?

U: On a business trip for a month.
B: Got it, keeping Berlin 👌
```

```
U: I'm in Munich now, working on a project here.
B: Oh, interesting! Did you move from Berlin or are you on a business trip?

U: I moved.
B: Great! Updated your city to Munich ✅
```

**Not a conflict:**

```
U: I'm looking at apartments in Munich.
B: Oh, planning to move? Need help with the search?
```
Pipeline: fact "looking at apartments in Munich" saved. No conflict with "lives in Berlin" — this is a supplement, not a contradiction.

### Coexistence: Parallel Facts

```
U: I work at Yandex.
B: You previously said you work at Google. Did you change jobs?

U: No, Google is my main job, and Yandex is a side gig.
B: Got it ✅ Updated: Google — main job, Yandex — side gig.
```

### Coexistence: Evolving Opinions

```
U: I think maybe I should go back after all, it's lonely without family here.
B: I understand, it's a tough balance. Want to discuss what options there are?
```
Pipeline: new fact "thinking about going back, lonely without family" saved as active alongside the existing "doesn't want to go back." The bot doesn't ask a clarifying question "did you change your mind?" — both opinions are current.

### CONFIRM (type: delete) — Deletion Confirmation

See examples in `memory.delete` and `memory.delete_entity`.

### CONFIRM (type: account_delete) — Account Deletion Confirmation

See example in `system.delete_account`.

### AWAIT (type: missing_data) — Timezone Determination (fallback)

```
U: Remind me tomorrow at 9 AM.
B: To remind you on time — what city are you in? 🌍

U: Munich
B: Got it! I'll remind you tomorrow at 9:00 AM 📅
```

### AWAIT (type: missing_data) — Missing Data

**City for weather:**

```
U: What's the weather like today?
B: Which city? 🌤️

U: Munich.
B: [forecast for Munich]
```

**Date for reminder:**

```
U: Remind me a week before Masha's birthday.
B: I don't remember Masha's birthday 🤔 When is it?

U: April 20
B: Got it! I'll remind you on April 13 — Masha's birthday 📅
```

---

## Intermediate State Reset

If the user doesn't respond to a clarifying question and sends a new message on a different topic, the bot resets the intermediate state (treats it as a cancel) and processes the new message normally. Example:

```
B: Did you move from Berlin or are you traveling?

U: Remind me tomorrow at 9 about the meeting.
B: I'll remind you tomorrow at 9:00 — meeting 📅
```

The Munich/Berlin conflict is canceled; Berlin remains active.

---

## System Messages

### Rate Limit

```
B: You're sending too many messages 😅 Hold on a bit, I'll be back online soon.
```

### Token Quota Exhausted

```
B: Monthly usage limit reached 😔 It will reset on [date]. If you need more — contact the administrator.
```

### Service Error

```
B: Something went wrong, I can't respond right now 😔 Try again later!
```

### Unprocessed Message (retry after failure)

```
B: Couldn't process your message from [time] — there was a failure. If you need a response — write again 🙏
```

### Intermediate State Reset on Timeout

```
B: The question about city is no longer active — we'll continue when you're ready 🙂
```

### "Bare" Confirmation After Timeout

```
U: yes
B: If that was about the city — tell me where you moved, and I'll update 🙂
```

### Missed Reminder (after failure)

```
B: Wish Dima happy birthday 🎂 He's turning 35, lives in Berlin. Want me to compose a greeting?
   ⚠️ Reminder was scheduled for 9:00, delivered with a delay.
```

### User Blocked

Messages are not processed. The bot does not respond.

---

## Traceability

| Section | Intent / State | FR | US |
|---------|---------------|----|----|
| /start (approved) | — | FR-ONB.1 | US-ONB.1 |
| /start (waitlist) | — | FR-ONB.2 | US-ONB.2 |
| /start (resume) | system.resume | FR-PLT.5 | US-PLT.3 |
| /help | — | — | — |
| /stop | system.pause | FR-PLT.5 | US-PLT.3 |
| memory.save | memory.save | FR-MEM.1, FR-MEM.2 | US-MEM.11 |
| memory.view | memory.view | FR-MEM.7, FR-MEM.8, FR-MEM.2a | US-MEM.6, US-MEM.7, US-MEM.12 |
| memory.edit | memory.edit | FR-MEM.9 | US-MEM.8 |
| memory.delete | memory.delete | FR-MEM.10 | US-MEM.9 |
| memory.delete_entity | memory.delete_entity | FR-MEM.11 | US-MEM.10 |
| memory.explain | memory.explain | FR-MEM.13 | US-MEM.13 |
| reminder.create | reminder.create | FR-REM.1, FR-REM.2, FR-REM.7 | US-REM.1, US-REM.2, US-REM.5 |
| reminder.list | reminder.list | FR-REM.4 | US-REM.4 |
| reminder.cancel | reminder.cancel | FR-REM.4 | US-REM.4 |
| reminder.edit | reminder.edit | FR-REM.4 | US-REM.4 |
| Trigger | — | FR-REM.3 | US-REM.3 |
| chat | chat | FR-COM.1, FR-COM.2, FR-COM.4, FR-COM.5, FR-COM.6 | US-COM.1, US-COM.2, US-COM.3 |
| system.delete_account | system.delete_account | FR-PLT.3 | US-PLT.1 |
| Interest detection | CONFIRM (type: interest) | FR-MEM.15 | US-MEM.14 |
| CONFIRM (type: conflict) | — | FR-MEM.4 | US-MEM.3 |
| CONFIRM (type: delete) | — | FR-MEM.10, FR-MEM.11 | US-MEM.9, US-MEM.10 |
| CONFIRM (type: account_delete) | — | FR-PLT.3 | US-PLT.1 |
| CONFIRM (type: interest) | — | FR-MEM.15 | US-MEM.14 |
| AWAIT (type: missing_data) | — | FR-REM.6, FR-REM.7, FR-COM.4 | US-REM.5, US-REM.6, US-COM.3 |
| Rate limit | — | FR-PLT.4, NFR-SEC.2 | US-PLT.2 |
| Token quota | — | FR-PLT.4, NFR-SEC.2 | US-PLT.2 |
| Service error | — | NFR-REL.3 | — |
| Unprocessed message (retry) | — | NFR-REL.3 | — |
| State reset on timeout | — | 4.1 IA | — |
| Missed reminder | — | NFR-REL.4 | — |
