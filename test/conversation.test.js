'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { freshSession, handleMessage, formatRecommendation, parseCountry, parseWeek, parseFoods } = require('../src/conversation');

test('parseCountry accepts name and code, rejects garbage', () => {
  assert.equal(parseCountry('Kenya'), 'KE');
  assert.equal(parseCountry('nigeria'), 'NG');
  assert.equal(parseCountry('SN'), 'SN');
  assert.equal(parseCountry('Ghana'), null);
});

test('parseWeek accepts 1-45, rejects out of range and non-numeric', () => {
  assert.equal(parseWeek('24'), 24);
  assert.equal(parseWeek('week 30 please'), 30);
  assert.equal(parseWeek('0'), null);
  assert.equal(parseWeek('50'), null);
  assert.equal(parseWeek('soon'), null);
});

test('parseFoods splits on commas and "and"', () => {
  assert.deepEqual(parseFoods('rice, beans and fish'), ['rice', 'beans', 'fish']);
});

test('full onboarding flow reaches a backendRequest with everything collected', () => {
  let session = freshSession();
  let r = handleMessage(session, '2547000', 'hi');
  assert.equal(r.session.stage, 'AWAITING_COUNTRY');
  assert.equal(r.backendRequest, null);

  r = handleMessage(r.session, '2547000', 'Kenya');
  assert.equal(r.session.stage, 'AWAITING_WEEK');
  assert.equal(r.session.country, 'KE');

  r = handleMessage(r.session, '2547000', '24');
  assert.equal(r.session.stage, 'AWAITING_FOODS');
  assert.equal(r.session.pregnancy_week, 24);

  r = handleMessage(r.session, '2547000', 'maize flour, sukuma wiki, eggs');
  assert.equal(r.session.stage, 'ONBOARDED');
  assert.equal(r.needsApproval, true);
  assert.deepEqual(r.backendRequest, {
    user_state_id: '2547000', country: 'KE', pregnancy_week: 24,
    foods_available: ['maize flour', 'sukuma wiki', 'eggs'], recent_food_groups: [],
  });
});

test('an already-onboarded user skips straight back to food questions', () => {
  const session = { stage: 'ONBOARDED', country: 'NG', pregnancy_week: 20, recent_food_groups: [] };
  const r = handleMessage(session, '234800', 'rice, beans');
  assert.equal(r.needsApproval, true);
  assert.equal(r.backendRequest.country, 'NG');
});

test('invalid country reply re-asks without advancing stage', () => {
  const session = { stage: 'AWAITING_COUNTRY', country: null, pregnancy_week: null, recent_food_groups: [] };
  const r = handleMessage(session, 'x', 'Ghana');
  assert.equal(r.session.stage, 'AWAITING_COUNTRY');
  assert.match(r.reply, /didn't catch/i);
});

test('"restart" resets session from any stage', () => {
  const session = { stage: 'ONBOARDED', country: 'KE', pregnancy_week: 30, recent_food_groups: [] };
  const r = handleMessage(session, 'x', 'restart');
  assert.equal(r.session.stage, 'NEW');
});

test('a safety concern is caught before onboarding is even done, not parsed as garbage input', () => {
  const session = { stage: 'AWAITING_COUNTRY', country: null, pregnancy_week: null, recent_food_groups: [] };
  const r = handleMessage(session, 'x', "I'm bleeding");
  assert.equal(r.isSafetyEscalation, true);
  assert.match(r.reply, /clinician or antenatal care/i);
  assert.equal(r.backendRequest, null); // no country yet -- can't call the backend, still must warn
  assert.equal(r.session.stage, 'AWAITING_COUNTRY'); // does not advance onboarding
});

test('a safety concern typed while answering the foods question is NOT parsed as a food list', () => {
  const session = { stage: 'AWAITING_FOODS', country: 'KE', pregnancy_week: 24, recent_food_groups: [] };
  const r = handleMessage(session, '2547000', 'I have severe swelling in my legs');
  assert.equal(r.isSafetyEscalation, true);
  assert.equal(r.needsApproval, false); // must never wait on human approval
  assert.ok(r.backendRequest); // country+week known -- send for audit
  assert.deepEqual(r.backendRequest.clinical_flags, ['I have severe swelling in my legs']);
});

test('formatRecommendation renders top pick with gap and improvement', () => {
  const resp = {
    mode: 'QUALITATIVE',
    recommendations: [{
      meal_id: 'KE-M001', meal_name: 'Ugali + sukuma wiki + egg', local_name: 'Ugali na sukuma wiki na yai',
      score: 75, strengths: ['Protein + leafy vegetables'], possible_gaps: ['Iron/folate depends on portion'],
      improvement: 'Add beans too', missing_components: [],
    }],
  };
  const text = formatRecommendation(resp);
  assert.match(text, /Ugali \+ sukuma wiki \+ egg/);
  assert.match(text, /Add beans too/);
});

test('formatRecommendation falls back to the message when nothing matched', () => {
  const resp = { mode: 'QUALITATIVE', recommendations: [], message: 'None matched, try again.' };
  assert.equal(formatRecommendation(resp), 'None matched, try again.');
});
