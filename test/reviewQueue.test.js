'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rq = require('../src/reviewQueue');

test.beforeEach(() => rq._reset());

test('a queued draft can be approved by id and returns the original text', () => {
  const id = rq.enqueueDraft('2547000', 'Try ugali with sukuma wiki.');
  const result = rq.resolveReviewerMessage(`APPROVE ${id}`);
  assert.equal(result.action, 'approve');
  assert.equal(result.toPhone, '2547000');
  assert.equal(result.text, 'Try ugali with sukuma wiki.');
  assert.equal(rq.pendingCount(), 0);
});

test('bare APPROVE works when exactly one draft is pending', () => {
  rq.enqueueDraft('2547000', 'draft text');
  const result = rq.resolveReviewerMessage('approve');
  assert.equal(result.action, 'approve');
});

test('bare APPROVE is ambiguous with two pending drafts and matches neither', () => {
  rq.enqueueDraft('AAA', 'first');
  rq.enqueueDraft('BBB', 'second');
  const result = rq.resolveReviewerMessage('approve');
  assert.equal(result.action, 'none');
  assert.equal(rq.pendingCount(), 2); // neither draft consumed
});

test('EDIT replaces the text that gets sent', () => {
  const id = rq.enqueueDraft('2547000', 'original draft');
  const result = rq.resolveReviewerMessage(`EDIT ${id}: a better version`);
  assert.equal(result.action, 'edit');
  assert.equal(result.text, 'a better version');
});

test('unknown id is reported, not silently ignored', () => {
  const result = rq.resolveReviewerMessage('APPROVE ZZZZ');
  assert.equal(result.action, 'unknown_id');
});

test('unrelated text is not mistaken for a reviewer command', () => {
  rq.enqueueDraft('2547000', 'draft');
  const result = rq.resolveReviewerMessage('hello there');
  assert.equal(result.action, 'none');
  assert.equal(rq.pendingCount(), 1);
});
