import axios from "axios";

export interface SendMessageOptions {
  to: string;
  body: string;
  phoneNumberId?: string;
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
  phoneNumberId: customPhoneId,
}: SendMessageOptions): Promise<SendMessageResult> {
  const phoneNumberId = customPhoneId || process.env.WHATSAPP_PHONE_NUMBER_ID;
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

/**
 * Registers the phone number with Meta Cloud API using a 6-digit PIN.
 * Required when switching from a test number or onboarding a live phone number.
 */
export async function registerPhoneNumber(pin: string = "123456"): Promise<any> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN");
  }

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/register`;

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      pin: pin,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

/**
 * Queries Meta Graph API for the phone number status and metadata.
 */
export async function getPhoneNumberStatus(customId?: string): Promise<any> {
  const phoneNumberId = customId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN");
  }

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,platform_type,throughput`;

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
}

