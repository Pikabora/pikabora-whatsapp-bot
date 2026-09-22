'use strict';

// Pending drafts waiting for a human reviewer to approve before they reach
// the real user. In-memory only -- fine for a human-reviewed pilot with a
// handful of concurrent conversations; a restart drops anything unapproved,
// which is a real limitation worth knowing, not a hidden one.
const pending = new Map(); // id -> { toPhone, draftText, createdAt }

function makeId() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function enqueueDraft(toPhone, draftText) {
  const id = makeId();
  pending.set(id, { toPhone, draftText, createdAt: Date.now() });
  return id;
}

function reviewerPromptFor(id, toPhone, draftText) {
  return [
    `New draft for ${toPhone} [${id}]:`,
    '---',
    draftText,
    '---',
    `Reply "APPROVE ${id}" to send as-is, or "EDIT ${id}: <replacement text>" to send something else.`,
  ].join('\n');
}

/**
 * Parses a reviewer's message. Returns one of:
 *   { action: 'approve', id, toPhone, text }
 *   { action: 'edit', id, toPhone, text }
 *   { action: 'none' }   -- not a recognised reviewer command
 *   { action: 'unknown_id', id }
 */
function resolveReviewerMessage(text) {
  const raw = (text || '').trim();

  let m = raw.match(/^APPROVE\s+([A-Z0-9]{4})$/i);
  if (!m && /^APPROVE$/i.test(raw) && pending.size === 1) {
    m = [null, [...pending.keys()][0]];
  }
  if (m) {
    const id = m[1].toUpperCase();
    const draft = pending.get(id);
    if (!draft) return { action: 'unknown_id', id };
    pending.delete(id);
    return { action: 'approve', id, toPhone: draft.toPhone, text: draft.draftText };
  }

  m = raw.match(/^EDIT\s+([A-Z0-9]{4}):\s*([\s\S]+)$/i);
  if (!m && /^EDIT:\s*([\s\S]+)$/i.test(raw) && pending.size === 1) {
    const only = raw.match(/^EDIT:\s*([\s\S]+)$/i);
    m = [null, [...pending.keys()][0], only[1]];
  }
  if (m) {
    const id = m[1].toUpperCase();
    const draft = pending.get(id);
    if (!draft) return { action: 'unknown_id', id };
    pending.delete(id);
    return { action: 'edit', id, toPhone: draft.toPhone, text: m[2].trim() };
  }

  return { action: 'none' };
}

function pendingCount() { return pending.size; }
function _reset() { pending.clear(); } // test helper only

module.exports = { enqueueDraft, reviewerPromptFor, resolveReviewerMessage, pendingCount, _reset };
