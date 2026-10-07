import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { withinServiceWindow, toE164, isTesterNumber, normalizePhoneNumber } from "./serviceWindow";
import { sendWhatsAppText } from "./whatsappApi";

/**
 * Firebase Cloud Function trigger watching:
 * `whatsapp_conversations/{waId}/messages/{msgId}`
 *
 * When an agent/bot creates a message document (author === "agent"),
 * this function checks subscriber state, 24-hr service window, tester privileges,
 * and calls Meta WhatsApp Cloud API to deliver the text message.
 */
export const relayAgentWhatsAppReply = onDocumentCreated(
  {
    document: "whatsapp_conversations/{waId}/messages/{msgId}",
    memory: "256MiB",
    maxInstances: 5,
    secrets: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
  },
  async (event) => {
    const msg = event.data?.data();

    // 1. Only relay messages written by the bot / agent
    if (!msg || msg.author !== "agent" || !event.data) return null;

    const { waId, msgId } = event.params;
    const msgRef = event.data.ref;
    const db = admin.firestore();

    try {
      // 2. Normalize and query subscriber details
      const norm = normalizePhoneNumber(waId);
      const subSnap = await db
        .collection("kenyabot_subscribers")
        .doc(waId)
        .get();

      let subData: any = {};
      if (subSnap.exists) {
        subData = subSnap.data() || {};
      } else {
        // Fallback for direct or tester messages
        subData = {
          waId: norm.waId,
          phoneE164: norm.phoneE164,
          isTester: isTesterNumber(waId),
        };
      }

      // 3. Verify WhatsApp 24-hour service window (Testers automatically bypass this!)
      if (!withinServiceWindow(subData)) {
        console.warn(`[relayAgentWhatsAppReply] Window closed for ${waId}`);
        await msgRef.update({
          deliveryStatus: "window_closed",
          deliveryError:
            "WhatsApp 24-hour reply window closed. Customer must send a message first.",
        });
        return null;
      }

      // 4. Send WhatsApp Message via Meta Cloud API
      const recipientPhone = subData.phoneE164 || norm.phoneE164 || toE164(waId);
      const res = await sendWhatsAppText({
        to: recipientPhone,
        body: msg.text,
      });

      // 5. Update Firestore document with delivery status
      await msgRef.update({
        deliveryStatus: res.ok ? "sent" : "failed",
        deliveryError: res.ok ? null : (res.error || "WhatsApp rejected the message."),
        waMessageId: res.messageId || null,
        deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[relayAgentWhatsAppReply] Successfully delivered message ${msgId} to ${recipientPhone}`);
      return null;
    } catch (e: any) {
      console.error({
        relayAgentWhatsAppReply: "failed",
        waId,
        msgId,
        message: e.message,
      });

      await msgRef.update({
        deliveryStatus: "failed",
        deliveryError: e.message || "Unknown delivery error.",
      });

      return null;
    }
  }
);
