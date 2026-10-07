import express from "express";
import * as admin from "firebase-admin";
import dotenv from "dotenv";
import { normalizePhoneNumber, isTesterNumber } from "./serviceWindow";
import { processUserMessage } from "./botEngine";
import { sendWhatsAppText } from "./whatsappApi";

dotenv.config();

// Initialize Firebase Admin SDK safely if credentials exist
try {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized with service account.");
    } else {
      admin.initializeApp();
      console.log("ℹ️ Firebase Admin initialized with default project credentials.");
    }
  }
} catch (err: any) {
  console.warn("⚠️ Firebase Admin initialization notice:", err.message);
}

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "pikabora2026";

/**
 * Health Check Endpoint
 */
app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "KenyaBot (Pikabora) WhatsApp Webhook Server",
    testersConfigured: ["08111156597", "07033180897"],
    timestamp: new Date().toISOString(),
  });
});

/**
 * 1. Meta Webhook Verification (GET /webhook)
 */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`🔍 Webhook Verification Attempt: mode=${mode}, token=${token}`);

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Meta Webhook verified successfully!");
      return res.status(200).send(challenge);
    } else {
      console.warn("❌ Webhook verification failed. Token mismatch.");
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

/**
 * 2. Meta Webhook Incoming Messages (POST /webhook)
 */
app.post("/webhook", async (req, res) => {
  const body = req.body;

  // Immediately acknowledge Meta Webhook to avoid timeout retries
  res.status(200).send("EVENT_RECEIVED");

  if (body.object === "whatsapp_business_account") {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (message && message.type === "text") {
      const rawFrom = message.from; // e.g. 2348111156597 or 254182533383
      const userText = message.text?.body || "";
      const msgId = message.id;

      const norm = normalizePhoneNumber(rawFrom);
      const waId = norm.waId;
      const isTester = isTesterNumber(rawFrom) || isTesterNumber(waId);

      console.log(`📩 [INCOMING] From ${norm.phoneE164}${isTester ? " [TESTER]" : ""}: "${userText}"`);

      // Store in Firestore asynchronously if available
      try {
        if (admin.apps.length) {
          const db = admin.firestore();
          await db.collection("kenyabot_subscribers").doc(waId).set(
            {
              waId,
              phoneE164: norm.phoneE164,
              lastUserMessageAt: admin.firestore.FieldValue.serverTimestamp(),
              isTester: isTester,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          await db
            .collection("whatsapp_conversations")
            .doc(waId)
            .collection("messages")
            .doc(msgId)
            .set({
              author: "user",
              text: userText,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              isTesterMessage: isTester,
            });
        }
      } catch (dbErr: any) {
        console.warn("⚠️ Firestore save warning:", dbErr.message);
      }

      // Generate bot response text
      try {
        const botReply = await processUserMessage(waId, userText);

        console.log(`📤 [OUTGOING] Replying to ${norm.phoneE164}: "${botReply.substring(0, 50)}..."`);

        // Send reply DIRECTLY via Meta WhatsApp Cloud API!
        const apiResult = await sendWhatsAppText({
          to: norm.phoneE164,
          body: botReply,
        });

        if (apiResult.ok) {
          console.log(`✅ [DELIVERED] Message sent successfully to ${norm.phoneE164}! waMessageId=${apiResult.messageId}`);
        } else {
          console.error(`❌ [DELIVERY FAILED] Could not send WhatsApp reply to ${norm.phoneE164}:`, apiResult.error);
        }
      } catch (engineErr: any) {
        console.error("❌ Error executing bot engine:", engineErr.message);
      }
    }
  }
});

/**
 * 3. Manual Tester Trigger Endpoint (POST /test-send)
 */
app.post("/test-send", async (req, res) => {
  const { phone, text } = req.body;

  if (!phone || !text) {
    return res.status(400).json({ error: "Please provide 'phone' and 'text' in body." });
  }

  const norm = normalizePhoneNumber(phone);
  console.log(`🧪 Tester Trigger for ${norm.phoneE164}: "${text}"`);

  try {
    const reply = await processUserMessage(norm.waId, text);

    const apiResult = await sendWhatsAppText({
      to: norm.phoneE164,
      body: reply,
    });

    return res.status(200).json({
      success: true,
      phone: norm.phoneE164,
      isTester: isTesterNumber(phone),
      botReply: reply,
      apiResult,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 KenyaBot Express Webhook Server listening on port ${PORT}`);
});
