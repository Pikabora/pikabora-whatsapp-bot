import { KenyaBotSubscriber } from "./types";

/**
 * Normalizes phone numbers to standard E.164 format or clean digits.
 * Example inputs: "08111156597", "07033180897", "+2348111156597", "254182533383"
 */
export function normalizePhoneNumber(rawNumber: string, defaultCountryPrefix = "234"): { waId: string; phoneE164: string } {
  let cleaned = rawNumber.replace(/[\s\-\(\)\+]/g, "").trim();

  // If local Nigerian number starting with '0' (e.g., 08111156597, 07033180897)
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = `${defaultCountryPrefix}${cleaned.substring(1)}`;
  } 
  // If local Kenyan number starting with '07' or '01' (e.g. 0712345678)
  else if (cleaned.startsWith("0") && (cleaned.startsWith("07") || cleaned.startsWith("01")) && cleaned.length === 10) {
    cleaned = `254${cleaned.substring(1)}`;
  }

  const waId = cleaned;
  const phoneE164 = `+${cleaned}`;

  return { waId, phoneE164 };
}

/**
 * Parses configured tester numbers from env or default fallback list.
 * Includes numbers like 08111156597, 07033180897.
 */
export function getTesterNumbers(): Set<string> {
  const envTesters = process.env.TESTER_NUMBERS || "08111156597,07033180897";
  const rawList = envTesters.split(",").map((num) => num.trim()).filter(Boolean);

  const set = new Set<string>();
  for (const raw of rawList) {
    const norm = normalizePhoneNumber(raw);
    set.add(raw);
    set.add(norm.waId);
    set.add(norm.phoneE164);
  }
  return set;
}

/**
 * Checks if a subscriber phone number or waId is a tester.
 */
export function isTesterNumber(waIdOrPhone: string): boolean {
  if (!waIdOrPhone) return false;
  const testers = getTesterNumbers();
  const norm = normalizePhoneNumber(waIdOrPhone);

  return testers.has(waIdOrPhone) || testers.has(norm.waId) || testers.has(norm.phoneE164);
}

/**
 * Checks if a subscriber is within Meta's 24-hour WhatsApp service window.
 * Note: Tester numbers AUTOMATICALLY bypass this window restriction for smooth testing!
 */
export function withinServiceWindow(sub: KenyaBotSubscriber): boolean {
  // Always allow tester numbers during testing/development!
  if (sub.isTester || isTesterNumber(sub.waId) || isTesterNumber(sub.phoneE164)) {
    return true;
  }

  if (!sub.lastUserMessageAt) return false;

  let lastMsgMs: number;
  const target = sub.lastUserMessageAt as any;
  if (target && typeof target.toMillis === "function") {
    lastMsgMs = target.toMillis();
  } else if (target instanceof Date) {
    lastMsgMs = target.getTime();
  } else if (typeof target === "number") {
    lastMsgMs = target;
  } else {
    lastMsgMs = new Date(target as string).getTime();
  }

  const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
  return Date.now() - lastMsgMs <= twentyFourHoursInMs;
}

/**
 * Ensures a phone number string has the '+' prefix.
 */
export function toE164(waId: string): string {
  return waId.startsWith("+") ? waId : `+${waId}`;
}
