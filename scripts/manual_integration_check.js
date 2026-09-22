'use strict';
// This deliberately talks to a REAL running backend (localhost:8000), not a
// mock. It proves the bot's request shape and response formatting actually
// work against the live FastAPI service, not just against what I assumed
// its contract was.
const { freshSession, handleMessage, formatRecommendation } = require('../src/conversation');
const backend = require('../src/backendClient');

async function run() {
  let session = freshSession();
  const phone = 'sim-user-1';

  let r = handleMessage(session, phone, 'hi');
  console.log('BOT:', r.reply);
  session = r.session;

  r = handleMessage(session, phone, 'Kenya');
  console.log('BOT:', r.reply);
  session = r.session;

  r = handleMessage(session, phone, '24');
  console.log('BOT:', r.reply);
  session = r.session;

  r = handleMessage(session, phone, 'maize flour, sukuma wiki, eggs');
  session = r.session;
  console.log('USER SENT FOODS -> backendRequest:', JSON.stringify(r.backendRequest));

  const backendResponse = await backend.getRecommendation(r.backendRequest);
  console.log('RAW BACKEND RESPONSE:', JSON.stringify(backendResponse, null, 1));

  const draft = formatRecommendation(backendResponse);
  console.log('\nDRAFT MESSAGE FOR HUMAN REVIEWER:\n' + draft);

  // second turn: already onboarded, ask again with a local-language term
  r = handleMessage(session, phone, 'iyan'); // wrong-country term on purpose -- KE session, Yoruba word
  const backendResponse2 = await backend.getRecommendation(r.backendRequest);
  console.log('\n--- second query (out-of-vocabulary for KE, on purpose) ---');
  console.log(formatRecommendation(backendResponse2));

  // safety escalation path -- send a REAL message through handleMessage,
  // the same way index.js would, rather than hand-editing a request field
  r = handleMessage(session, phone, 'I have severe swelling in my legs');
  console.log('\n--- safety escalation path (real incoming message) ---');
  console.log('isSafetyEscalation:', r.isSafetyEscalation, '| needsApproval:', r.needsApproval);
  console.log('BOT (sent immediately, no approval wait):', r.reply);
  if (r.backendRequest) {
    const audited = await backend.getRecommendation(r.backendRequest);
    console.log('backend audit-logged it as data_confidence:', audited.data_confidence, '| safety_flags:', JSON.stringify(audited.safety_flags));
  }
}

run().catch(e => { console.error('INTEGRATION TEST FAILED:', e.message); process.exit(1); });
