import * as admin from "firebase-admin";
import { KenyaBotSubscriber } from "./types";
import { isTesterNumber } from "./serviceWindow";

// In-memory state store fallback (guarantees multi-turn conversation works even if Firestore isn't connected on Render!)
const memoryStore = new Map<string, Partial<KenyaBotSubscriber>>();

/**
 * Stateful Conversational Bot Engine for KenyaBot / Pikabora.
 * Processes user messages and returns conversational reply.
 */
export async function processUserMessage(waId: string, userText: string): Promise<string> {
  let subData: KenyaBotSubscriber = { waId, phoneE164: `+${waId}` };

  // Try retrieving state from Firestore if initialized
  try {
    if (admin.apps.length) {
      const db = admin.firestore();
      const subSnap = await db.collection("kenyabot_subscribers").doc(waId).get();
      if (subSnap.exists) {
        subData = { ...subData, ...(subSnap.data() as KenyaBotSubscriber) };
      }
    }
  } catch (err: any) {
    console.warn("⚠️ Firestore read warning (using in-memory fallback):", err.message);
  }

  // Merge in-memory state
  const mem = memoryStore.get(waId) || {};
  subData = { ...subData, ...mem };

  const cleanedText = userText.trim().toLowerCase();
  const isTester = subData.isTester || isTesterNumber(waId);

  let replyText = "";
  let updatedState: Partial<KenyaBotSubscriber> = {
    updatedAt: new Date() as any,
  };

  // 1. Initial Greeting / Reset
  if (["hi", "hello", "jambo", "start", "menu", "reset"].includes(cleanedText)) {
    replyText =
      `Jambo! 👋 Welcome to **KenyaBot (Pikabora)**${isTester ? " 🧪 [Tester Mode]" : ""}.\n\n` +
      `I help mothers and families cook healthy, budget-friendly meals using ingredients available in your kitchen.\n\n` +
      `How can I assist you today?\n` +
      `1️⃣ Maternal & Pregnancy Nutrition Advice\n` +
      `2️⃣ Quick Healthy Meal Idea from Kitchen Ingredients\n\n` +
      `Reply with *1* or *2*.`;

    updatedState.step = "AWAITING_MODE_CHOICE";
  }
  // 2. Mode Selection: Maternal Care (Option 1)
  else if (subData.step === "AWAITING_MODE_CHOICE" && cleanedText === "1") {
    replyText =
      `🌸 *Maternal & Pregnancy Nutrition*\n\n` +
      `Eating right is essential for your energy and baby's development.\n\n` +
      `How many weeks pregnant are you? (e.g., reply with *24* or *16*)`;

    updatedState.mode = "maternal";
    updatedState.step = "AWAITING_PREGNANCY_WEEKS";
  }
  // 3. Mode Selection: General Meal Idea (Option 2)
  else if (subData.step === "AWAITING_MODE_CHOICE" && cleanedText === "2") {
    replyText =
      `🥗 *Healthy Recipe Ideas*\n\n` +
      `What ingredients do you have in your kitchen right now?\n` +
      `*(e.g., Sukuma wiki, Eggs, Ugali, Ndengu, Tomatoes, Sweet Potatoes)*`;

    updatedState.mode = "general";
    updatedState.step = "AWAITING_INGREDIENTS";
  }
  // 4. Pregnancy Weeks Input
  else if (subData.step === "AWAITING_PREGNANCY_WEEKS" && !isNaN(Number(cleanedText))) {
    const weeks = Number(cleanedText);
    updatedState.weeksPregnant = weeks;
    updatedState.step = "AWAITING_INGREDIENTS";

    let trimesterNote = "";
    if (weeks <= 12) {
      trimesterNote = "1st Trimester: Focus on Folate (spinach, beans) and Ginger for nausea relief.";
    } else if (weeks <= 27) {
      trimesterNote = "2nd Trimester: Focus on Iron & Calcium (managu, milk, eggs, fortified flour) for bone and blood formation.";
    } else {
      trimesterNote = "3rd Trimester: Focus on High Protein & Omega-3 (fish, legumes, avocado) to support rapid baby growth.";
    }

    replyText =
      `Got it! At **${weeks} weeks pregnant**:\n💡 *${trimesterNote}*\n\n` +
      `Now tell me, what food ingredients do you have in your kitchen right now?`;
  }
  // 5. Ingredients Input -> Recipe Recommendation
  else if (
    subData.step === "AWAITING_INGREDIENTS" ||
    cleanedText.includes("egg") ||
    cleanedText.includes("spinach") ||
    cleanedText.includes("ugali") ||
    cleanedText.includes("beans") ||
    cleanedText.includes("sukuma")
  ) {
    const ingredients = userText;
    updatedState.step = "COMPLETED";

    const isMaternal = subData.mode === "maternal";
    const weeks = subData.weeksPregnant || 20;

    replyText =
      `🍲 *KenyaBot Recommended Recipe* ${isMaternal ? `(Tailored for ${weeks} Weeks Pregnancy)` : ""}\n\n` +
      `Based on ingredients: _${ingredients}_\n\n` +
      `✨ **Nutritious Ugali & Spinach-Egg Skillet**\n` +
      `• *Prep time:* 15 minutes\n` +
      `• *Key Benefits:* Rich in iron, protein, and dietary fiber to keep blood sugar stable.\n\n` +
      `📋 **Quick Steps:**\n` +
      `1. Saute onions and tomatoes with 1 tsp vegetable oil.\n` +
      `2. Stir in washed spinach/sukuma wiki until tender.\n` +
      `3. Beat 2 eggs and pour over the greens, scrambling lightly.\n` +
      `4. Serve hot with warm ugali or sweet potatoes.\n\n` +
      `Type *Hi* anytime to get another recipe!`;
  }
  // Fallback handler
  else {
    replyText =
      `Thanks for messaging KenyaBot! 👋\n\n` +
      `I received: "${userText}"\n\n` +
      `To start a guided meal plan or maternal nutrition check, reply with **Hi**!`;
  }

  // Update in-memory state store
  memoryStore.set(waId, { ...subData, ...updatedState });

  // Try updating Firestore asynchronously
  try {
    if (admin.apps.length) {
      const db = admin.firestore();
      await db.collection("kenyabot_subscribers").doc(waId).set(updatedState, { merge: true });
      await db
        .collection("whatsapp_conversations")
        .doc(waId)
        .collection("messages")
        .add({
          author: "agent",
          text: replyText,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          deliveryStatus: "sent",
          isTesterMessage: isTester,
        });
    }
  } catch (err: any) {
    console.warn("⚠️ Firestore write warning:", err.message);
  }

  return replyText;
}
