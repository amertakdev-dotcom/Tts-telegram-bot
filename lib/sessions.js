// ===============================
// lib/sessions.js — short-lived in-memory state
//
// Telegram callback_data is limited to 64 bytes, so we can't stuff a full
// download URL into a button. Instead we store the resolved download links
// here under a short random id and only put "dl:<type>:<id>" on the button.
//
// Nothing here ever touches disk — it's process memory only, and entries
// expire on their own so a restart/redeploy on Render just means old
// buttons stop working (user simply resends the link).
// ===============================

const crypto = require("crypto");

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const downloadSessions = new Map();

function createDownloadSession(payload) {
  const id = crypto.randomBytes(4).toString("hex"); // short, callback_data-safe
  downloadSessions.set(id, { ...payload, id, createdAt: Date.now() });
  return id;
}

function getDownloadSession(id) {
  const session = downloadSessions.get(id);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    downloadSessions.delete(id);
    return null;
  }
  return session;
}

function deleteDownloadSession(id) {
  downloadSessions.delete(id);
}

// Periodic cleanup so the Map doesn't grow forever on a long-running instance.
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of downloadSessions) {
    if (now - session.createdAt > SESSION_TTL_MS) downloadSessions.delete(id);
  }
}, 5 * 60 * 1000).unref();

// ─── OCR "awaiting photo" state ────────────────────────────────────────────
// Set when the user taps [✂️ ចម្លងអត្ថបទ]; cleared as soon as a photo arrives
// (or after a timeout so it doesn't linger forever).
const awaitingOcr = new Map(); // telegramId -> expiry timestamp
const OCR_WAIT_MS = 10 * 60 * 1000; // 10 minutes

function setAwaitingOcr(telegramId) {
  awaitingOcr.set(telegramId, Date.now() + OCR_WAIT_MS);
}

function isAwaitingOcr(telegramId) {
  const expiry = awaitingOcr.get(telegramId);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    awaitingOcr.delete(telegramId);
    return false;
  }
  return true;
}

function clearAwaitingOcr(telegramId) {
  awaitingOcr.delete(telegramId);
}

module.exports = {
  createDownloadSession,
  getDownloadSession,
  deleteDownloadSession,
  setAwaitingOcr,
  isAwaitingOcr,
  clearAwaitingOcr,
};
