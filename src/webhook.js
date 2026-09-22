'use strict';

const express = require('express');
const { freshSession, handleMessage, formatRecommendation } = require('./conversation');
const { sendMessage } = require('./whatsapp');
const backend = require('./backendClient');
const reviewQueue = require('./reviewQueue');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'pikabora2026';
const REVIEWER_JID = process.env.PIKABORA_REVIEWER_JID;

// In-memory session store: phone -> conversation state
const sessions = new Map();
function getSession(jid) {
  if (!sessions.has(jid)) sessions.set(jid, freshSession());
  return sessions.get(jid);
}

function createWebhookApp() {
  const app = express();
  app.use(express.json());

  // --- Meta webhook verification (GET) ---
  app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    console.log(`[VERIFY] mode=${mode} token=${token}`);
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[VERIFY] Webhook verified successfully!');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  // --- Incoming messages (POST) ---
  app.post('/webhook', async (req, res) => {
    // Acknowledge immediately so Meta doesn't retry
    res.sendStatus(200);

    try {
      const body = req.body;
      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of (body.entry || [])) {
        for (const change of (entry.changes || [])) {
          const value = change.value;
          if (!value || !value.messages) continue;

          for (const msg of value.messages) {
            if (msg.type !== 'text') continue;
            const fromPhone = msg.from; // e.g. "254712345678"
            const text = msg.text?.body?.trim();
            if (!text) continue;

            console.log(`[INCOMING] from=${fromPhone}: ${text}`);

            // Reviewer commands
            if (REVIEWER_JID && fromPhone === REVIEWER_JID.replace('@s.whatsapp.net', '')) {
              const result = reviewQueue.resolveReviewerMessage(text);
              if (result.action === 'approve' || result.action === 'edit') {
                await sendMessage(result.toPhone, result.text);
                await sendMessage(fromPhone, `Sent to ${result.toPhone}.`);
              } else if (result.action === 'unknown_id') {
                await sendMessage(fromPhone, `No pending draft with id ${result.id}.`);
              }
              continue;
            }

            // Normal user message
            const session = getSession(fromPhone);
            const result = handleMessage(session, fromPhone, text);
            sessions.set(fromPhone, result.session);

            if (result.isSafetyEscalation) {
              await sendMessage(fromPhone, result.reply);
              if (result.backendRequest) {
                backend.getRecommendation(result.backendRequest).catch(e =>
                  console.error('audit log failed:', e.message));
              }
              continue;
            }

            if (result.reply) {
              await sendMessage(fromPhone, result.reply);
              continue;
            }

            if (result.backendRequest) {
              let backendResponse;
              try {
                backendResponse = await backend.getRecommendation(result.backendRequest);
              } catch (e) {
                console.error('backend call failed:', e.message);
                await sendMessage(fromPhone, "Sorry, I'm having trouble right now — please try again in a moment.");
                continue;
              }
              const draft = formatRecommendation(backendResponse);
              if (result.needsApproval && REVIEWER_JID) {
                const id = reviewQueue.enqueueDraft(fromPhone, draft);
                await sendMessage(REVIEWER_JID.replace('@s.whatsapp.net', ''),
                  reviewQueue.reviewerPromptFor(id, fromPhone, draft));
              } else {
                await sendMessage(fromPhone, draft);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[Webhook handler error]', e);
    }
  });

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok', bot: 'pikabora-whatsapp' }));

  return app;
}

module.exports = { createWebhookApp, sessions, getSession };
