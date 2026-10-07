import * as admin from "firebase-admin";
import { KenyaBotSubscriber } from "./types";
import { isTesterNumber } from "./serviceWindow";

/**
 * Stateful Conversational Bot Engine for KenyaBot / Pikabora.
 * Processes user messages and creates agent responses in Firestore.
 */
export async function processUserMessage(waId: string, userText: string): Promise<string> {
  const db = admin.firestore();
  const subRef = db.collection("kenyabot_subscribers").doc(waId);
  const subSnap = await subRef.get();

  const subData: KenyaBotSubscriber = subSnap.exists
    ? (subSnap.data() as KenyaBotSubscriber)
    : { waId, phoneE164: `+${waId}` };

  const cleanedText = userText.trim().toLowerCase();
  const isTester = subData.isTester || isTesterNumber(waId);

  let replyText = "";
  let updatedState: Partial<KenyaBotSubscriber> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
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
  else if (subData.step === "AWAITING_INGREDIENTS" || cleanedText.includes("egg") || cleanedText.includes("spinach") || cleanedText.includes("ugali") || cleanedText.includes("beans") || cleanedText.includes("sukuma")) {
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

  // Update subscriber state in Firestore
  await subRef.set(updatedState, { merge: true });

  // Add agent reply to Firestore messages subcollection
  const agentMsgRef = db
    .collection("whatsapp_conversations")
    .doc(waId)
    .collection("messages")
    .doc();

  await agentMsgRef.set({
    author: "agent",
    text: replyText,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    deliveryStatus: "pending",
    isTesterMessage: isTester,
  });

  return replyText;
}
