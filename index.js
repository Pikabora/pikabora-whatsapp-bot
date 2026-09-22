'use strict';
const { connect } = require('./src/whatsapp');
const { freshSession, handleMessage, formatRecommendation } = require('./src/conversation');
const backend = require('./src/backendClient');
const reviewQueue = require('./src/reviewQueue');

const REVIEWER_JID = process.env.PIKABORA_REVIEWER_JID; // e.g. '2547XXXXXXXX@s.whatsapp.net'
if (!REVIEWER_JID) {
  console.warn('PIKABORA_REVIEWER_JID is not set -- nutrition-content drafts have nowhere to go for approval. Set it before running for real.');
}

// In-memory session store: phone -> conversation state. Resets on restart --
// acceptable for a human-reviewed pilot with a handful of concurrent
// conversations, not for production scale. Move to the backend's own
// persistence (or a small local DB) before this runs unattended.
const sessions = new Map();
function getSession(jid) {
  if (!sessions.has(jid)) sessions.set(jid, freshSession());
  return sessions.get(jid);
}

async function main() {
  const sock = await connect(async (fromJid, text, sockRef) => {
    // Messages FROM the reviewer are commands about pending drafts, not a
    // new end-user conversation.
    if (REVIEWER_JID && fromJid === REVIEWER_JID) {
      const result = reviewQueue.resolveReviewerMessage(text);
      if (result.action === 'approve' || result.action === 'edit') {
        await sockRef.sendMessage(result.toPhone, { text: result.text });
        await sockRef.sendMessage(REVIEWER_JID, { text: `Sent to ${result.toPhone}.` });
      } else if (result.action === 'unknown_id') {
        await sockRef.sendMessage(REVIEWER_JID, { text: `No pending draft with id ${result.id}.` });
      }
      // action 'none' -- not a recognised command, ignore silently
      return;
    }

    // Ordinary end-user message.
    const session = getSession(fromJid);
    const result = handleMessage(session, fromJid, text);
    sessions.set(fromJid, result.session);

    if (result.isSafetyEscalation) {
      // Never queue a safety message for approval -- send immediately.
      await sockRef.sendMessage(fromJid, { text: result.reply });
      if (REVIEWER_JID) {
        await sockRef.sendMessage(REVIEWER_JID, { text: `[Safety escalation sent automatically to ${fromJid}] "${text}"` });
      }
      if (result.backendRequest) {
        backend.getRecommendation(result.backendRequest).catch(e => console.error('audit log call failed:', e.message));
      }
      return;
    }

    if (result.reply) {
      // Plain onboarding prompt -- pre-scripted, safe, no approval needed.
      await sockRef.sendMessage(fromJid, { text: result.reply });
      return;
    }

    if (result.backendRequest) {
      let backendResponse;
      try {
        backendResponse = await backend.getRecommendation(result.backendRequest);
      } catch (e) {
        console.error('backend call failed:', e.message);
        await sockRef.sendMessage(fromJid, { text: "Sorry, I'm having trouble right now -- please try again in a moment." });
        return;
      }
      const draft = formatRecommendation(backendResponse);
      if (result.needsApproval && REVIEWER_JID) {
        const id = reviewQueue.enqueueDraft(fromJid, draft);
        await sockRef.sendMessage(REVIEWER_JID, { text: reviewQueue.reviewerPromptFor(id, fromJid, draft) });
      } else {
        // No reviewer configured -- fall back to sending directly. Only
        // acceptable outside the human-reviewed pilot phase.
        await sockRef.sendMessage(fromJid, { text: draft });
      }
    }
  });

  return sock;
}

if (require.main === module) {
  // Start dummy HTTP server for Render Web Service health checks
  const http = require('http');
  const port = process.env.PORT || 3000;
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Pikabora Bot is running!\n');
  }).listen(port, () => {
    console.log(`Health check server listening on port ${port}`);
  });

  main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
}

module.exports = { main, getSession, sessions };
