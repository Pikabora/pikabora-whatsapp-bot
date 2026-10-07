import { normalizePhoneNumber, isTesterNumber, withinServiceWindow } from "../serviceWindow";

console.log("==========================================");
console.log("🧪 KenyaBot Tester Number Verification Test");
console.log("==========================================");

const testNumbers = [
  "08111156597",
  "07033180897",
  "+2348111156597",
  "254182533383",
  "0712345678",
];

for (const raw of testNumbers) {
  const norm = normalizePhoneNumber(raw);
  const isTester = isTesterNumber(raw) || isTesterNumber(norm.waId);
  
  const mockSub = {
    waId: norm.waId,
    phoneE164: norm.phoneE164,
    isTester: isTester,
    // 25 hours ago (outside 24h window for normal users)
    lastUserMessageAt: Date.now() - 25 * 60 * 60 * 1000, 
  };

  const windowActive = withinServiceWindow(mockSub);

  console.log(`\n📱 Input Number: ${raw}`);
  console.log(`   ➜ WA ID: ${norm.waId}`);
  console.log(`   ➜ E.164: ${norm.phoneE164}`);
  console.log(`   ➜ Is Configured Tester: ${isTester ? "✅ YES" : "❌ NO"}`);
  console.log(`   ➜ 24h Service Window Check (25h old msg): ${windowActive ? "✅ ALLOWED (Bypassed)" : "🚫 BLOCKED (Expired)"}`);
}

console.log("\n==========================================");
console.log("✅ All tester normalization tests completed!");
console.log("==========================================");
