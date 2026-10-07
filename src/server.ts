import express from "express";
import * as admin from "firebase-admin";
import dotenv from "dotenv";
import { normalizePhoneNumber, isTesterNumber } from "./serviceWindow";
import { processUserMessage } from "./botEngine";
import { sendWhatsAppText } from "./whatsappApi";

dotenv.config();

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
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

  if (body.object === "whatsapp_business_account") {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (message && message.type === "text") {
      const rawFrom = message.from; // e.g. 2348111156597 or 254182533383
      const text = message.text?.body || "";
      const msgId = message.id;

      const norm = normalizePhoneNumber(rawFrom);
      const waId = norm.waId;
      const isTester = isTesterNumber(rawFrom) || isTesterNumber(waId);

      console.log(`📩 Incoming message from ${norm.phoneE164}${isTester ? " [TESTER]" : ""}: "${text}"`);

      const db = admin.firestore();

      // Update subscriber document with latest timestamp and tester status
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

      // Store incoming user message in Firestore
      await db
        .collection("whatsapp_conversations")
        .doc(waId)
        .collection("messages")
        .doc(msgId)
        .set({
          author: "user",
          text,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          isTesterMessage: isTester,
        });

      // Process Bot Engine Logic
      try {
        await processUserMessage(waId, text);
      } catch (err: any) {
        console.error("Error processing bot logic:", err.message);
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  }

  res.sendStatus(404);
});

/**
 * 3. Manual Tester Trigger Endpoint (POST /test-send)
 * Useful for testing numbers like 08111156597 or 07033180897 without sending actual WhatsApp messages first!
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

    // Send direct WhatsApp text for immediate tester confirmation
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
