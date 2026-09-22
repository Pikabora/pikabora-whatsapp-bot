'use strict';

const COUNTRIES = { kenya: 'KE', ke: 'KE', nigeria: 'NG', ng: 'NG', senegal: 'SN', sn: 'SN' };

// Mirrors app/engine.py's CLINICAL_TERMS on the backend. Duplicated on
// purpose so the bot can react to a safety concern typed at ANY point in the
// conversation -- including before onboarding is even finished, when there
// is no backendRequest to send yet. Keep these two lists in sync by hand;
// there is no shared source between the two codebases right now.
const CLINICAL_TERMS = [
  'severe anaemia', 'severe anemia', 'gestational diabetes', 'diabetes',
  'hypertension', 'high blood pressure', 'kidney disease', 'kidney problem',
  'persistent vomiting', "can't keep food down", 'allergic', 'allergy',
  'bleeding', 'severe pain', 'swelling', 'can\'t feel the baby move',
  'baby not moving', 'severe headache', 'blurred vision',
];

const SAFETY_MESSAGE = 'This needs a clinician or antenatal care, not a meal suggestion. Please contact your clinic or community health worker right away.';

function detectClinicalConcern(text) {
  const t = (text || '').toLowerCase();
  return CLINICAL_TERMS.find(term => t.includes(term)) || null;
}

function parseCountry(text) {
  const t = text.trim().toLowerCase();
  return COUNTRIES[t] || null;
}

function parseWeek(text) {
  const m = text.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return (n >= 1 && n <= 45) ? n : null;
}

function parseFoods(text) {
  return text
    .split(/,| and |\n/i)
    .map(s => s.trim())
    .filter(Boolean);
}

function freshSession() {
  return { stage: 'NEW', country: null, pregnancy_week: null, recent_food_groups: [] };
}

/**
 * Pure function: (session, incomingText) -> {
 *   session: <updated session>,
 *   reply: <string to send immediately, or null>,
 *   backendRequest: <object to send to /nutrition/recommend, or null>,
 *   needsApproval: <bool -- only meaningful when backendRequest is set>,
 *   isSafetyEscalation: <bool -- when true, reply must be sent immediately,
 *                         bypassing the human-approval queue entirely>
 * }
 * No I/O. This is what test/conversation.test.js exercises directly.
 */
function handleMessage(session, phone, text) {
  const raw = (text || '').trim();

  // Safety check runs FIRST, before onboarding stage logic, before anything
  // else. A message like "I'm bleeding" must never be parsed as a food list
  // just because the user happened to be at the AWAITING_FOODS stage.
  const concern = detectClinicalConcern(raw);
  if (concern) {
    const backendRequest = session.country && session.pregnancy_week ? {
      user_state_id: phone, country: session.country, pregnancy_week: session.pregnancy_week,
      foods_available: [], recent_food_groups: session.recent_food_groups || [],
      clinical_flags: [raw],
    } : null;
    return {
      session, // do not advance onboarding on a safety message
      reply: SAFETY_MESSAGE,
      backendRequest, // sent for audit/logging only if we can -- see index.js
      needsApproval: false,
      isSafetyEscalation: true,
    };
  }

  if (/^restart$/i.test(raw)) {
    return { session: freshSession(), reply: 'Starting over. Which country are you in? (Kenya, Nigeria, or Senegal)', backendRequest: null, needsApproval: false, isSafetyEscalation: false };
  }

  switch (session.stage) {
    case 'NEW': {
      return {
        session: { ...session, stage: 'AWAITING_COUNTRY' },
        reply: "Hi, I'm Pikabora \u{1F44B} I help you cook nutritious meals from what's already in your kitchen.\n\nWhich country are you in? (Kenya, Nigeria, or Senegal)",
        backendRequest: null,
        needsApproval: false,
        isSafetyEscalation: false,
      };
    }
    case 'AWAITING_COUNTRY': {
      const country = parseCountry(raw);
      if (!country) {
        return { session, reply: "Sorry, I didn't catch that -- please reply Kenya, Nigeria, or Senegal.", backendRequest: null, needsApproval: false, isSafetyEscalation: false };
      }
      return {
        session: { ...session, stage: 'AWAITING_WEEK', country },
        reply: 'Great. How many weeks pregnant are you?',
        backendRequest: null,
        needsApproval: false,
        isSafetyEscalation: false,
      };
    }
    case 'AWAITING_WEEK': {
      const week = parseWeek(raw);
      if (week === null) {
        return { session, reply: 'Please reply with a number of weeks, like "24".', backendRequest: null, needsApproval: false, isSafetyEscalation: false };
      }
      return {
        session: { ...session, stage: 'AWAITING_FOODS', pregnancy_week: week },
        reply: "What do you have in your kitchen today? List a few things, e.g. \"maize flour, sukuma wiki, eggs\".",
        backendRequest: null,
        needsApproval: false,
        isSafetyEscalation: false,
      };
    }
    case 'AWAITING_FOODS':
    case 'ONBOARDED': {
      const foods = parseFoods(raw);
      if (foods.length === 0) {
        return { session, reply: "I didn't catch any foods there -- list a few things separated by commas.", backendRequest: null, needsApproval: false, isSafetyEscalation: false };
      }
      return {
        session: { ...session, stage: 'ONBOARDED' },
        reply: null,
        backendRequest: {
          user_state_id: phone,
          country: session.country,
          pregnancy_week: session.pregnancy_week,
          foods_available: foods,
          recent_food_groups: session.recent_food_groups || [],
        },
        needsApproval: true,
        isSafetyEscalation: false,
      };
    }
    default:
      return { session: freshSession(), reply: 'Something went wrong on my side -- let\'s start again. Which country are you in?', backendRequest: null, needsApproval: false, isSafetyEscalation: false };
  }
}

/**
 * Formats the backend's /nutrition/recommend JSON into a WhatsApp-friendly
 * chat message. Safety escalations are handled by the caller BEFORE this --
 * see index.js -- because they must never wait on human approval.
 */
function formatRecommendation(resp) {
  if (!resp.recommendations || resp.recommendations.length === 0) {
    return resp.message;
  }
  const top = resp.recommendations[0];
  const lines = [`Here's an idea: *${top.meal_name}*${top.local_name ? ` (${top.local_name})` : ''}`];
  if (top.strengths && top.strengths.length) lines.push(top.strengths[0]);
  if (top.possible_gaps && top.possible_gaps.length) lines.push(`Worth knowing: ${top.possible_gaps[0]}`);
  if (top.improvement) lines.push(`Tip: ${top.improvement}`);
  if (top.missing_components && top.missing_components.length) {
    lines.push(`(You didn't mention: ${top.missing_components.join(', ')} -- add if you have it.)`);
  }
  return lines.join('\n');
}

module.exports = { freshSession, handleMessage, formatRecommendation, parseCountry, parseWeek, parseFoods, detectClinicalConcern };

