import * as admin from "firebase-admin";

export interface KenyaBotSubscriber {
  waId: string;
  phoneE164: string;
  lastUserMessageAt?: admin.firestore.Timestamp | Date | string | number;
  isTester?: boolean;
  step?: string;
  mode?: "maternal" | "general";
  weeksPregnant?: number;
  ingredients?: string[];
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
}

export interface ConversationMessage {
  id?: string;
  author: "user" | "agent";
  text: string;
  timestamp: admin.firestore.Timestamp | Date | string | number;
  deliveryStatus?: "pending" | "sent" | "failed" | "window_closed";
  deliveryError?: string | null;
  waMessageId?: string | null;
  isTesterMessage?: boolean;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: { body: string };
          type: string;
        }>;
      };
      field: string;
    }>;
  }>;
}
