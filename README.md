# Pikabora WhatsApp bot (v0.1)

Run: `PIKABORA_BACKEND_URL=http://localhost:8000 PIKABORA_REVIEWER_JID=<your-jid> node index.js`
Then scan the QR code with the WhatsApp account that should run the bot.

## What's real and tested (17 passing tests, `node --test`)
- Full onboarding state machine (country -> week -> foods -> recommendation),
  tested directly, no mocks.
- Safety pre-check runs on EVERY message before anything else -- a real
  bug I found by testing: without this, a message like "I'm bleeding" typed
  during onboarding would have been parsed as a food list and silently lost.
  Now it interrupts at any stage and sends immediately, bypassing approval.
- Human-approval queue (enqueue draft -> reviewer approves/edits by id).
- Verified end-to-end against the REAL running Python backend (not a mock):
  onboarding -> real /nutrition/recommend call -> real ranked meals ->
  formatted draft -> safety escalation -> backend audit log. Script at
  `scripts/manual_integration_check.js`, run with a live backend to repeat it.

## What is NOT tested, and why
`src/whatsapp.js` -- the actual Baileys connection -- has not been run
against a live WhatsApp account. Baileys authenticates via QR-code scan with
a real phone, which this sandboxed environment cannot do. Everything that
sits behind it (conversation logic, backend calls, approval queue) is
tested; the transport layer itself is standard Baileys boilerplate that
needs a real first run, ideally by you, before trusting it.

## Bugs found by actually testing this, not by inspection
1. The bot's safety check didn't exist at all in the first draft -- caught
   by running a real simulated conversation and noticing "I have swelling"
   would've been silently swallowed as a food list.
2. The backend's `foods_available` field required at least one item, which
   broke the safety-escalation audit call (there are no foods to report).
   Fixed on the backend (v0.6).
3. The backend's own CLINICAL_TERMS list was missing real WHO danger signs
   (bleeding, swelling, severe headache, blurred vision, reduced fetal
   movement) that the bot's list already had -- found because the two lists
   disagreed on a real test case. Both now match; there's no shared source
   between the two codebases, so future edits need to touch both by hand.

## Not built yet
- Persistent session storage (currently an in-memory Map -- a restart loses
  every in-progress conversation).
- Rate limiting / abuse handling.
- Multi-language (Kiswahili/French/Yoruba etc.) prompts -- onboarding text
  is English-only right now.
