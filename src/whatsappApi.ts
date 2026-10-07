import axios from "axios";

export interface SendMessageOptions {
  to: string;
  body: string;
}

export interface SendMessageResult {
  ok: boolean;
  messageId: string | null;
  error?: string;
}

/**
 * Sends a text message via WhatsApp Cloud API.
 */
export async function sendWhatsAppText({
  to,
  body,
}: SendMessageOptions): Promise<SendMessageResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.warn("⚠️ WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set. Simulating message dispatch.");
    return {
      ok: true,
      messageId: `sim_${Date.now()}`,
    };
  }

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { preview_url: false, body: body },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const isOk = response.status === 200 || response.status === 201;
    const messageId = response.data?.messages?.[0]?.id || null;

    return {
      ok: isOk,
      messageId: messageId,
    };
  } catch (err: any) {
    const errorMsg = err.response?.data?.error?.message || err.message || "Unknown Meta API error";
    console.error("❌ WhatsApp Cloud API call failed:", errorMsg);
    return {
      ok: false,
      messageId: null,
      error: errorMsg,
    };
  }
}
