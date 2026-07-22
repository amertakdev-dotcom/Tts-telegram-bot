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

// ─── "ដោះស្រាយលំហាត់" (solve exercise) awaiting-photo state ───────────────
// Same pattern as awaitingOcr above, kept as a separate flag so the two
// photo-driven features don't collide.
const awaitingSolve = new Map(); // telegramId -> expiry timestamp
const SOLVE_WAIT_MS = 10 * 60 * 1000; // 10 minutes

function setAwaitingSolve(telegramId) {
  awaitingSolve.set(telegramId, Date.now() + SOLVE_WAIT_MS);
}

function isAwaitingSolve(telegramId) {
  const expiry = awaitingSolve.get(telegramId);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    awaitingSolve.delete(telegramId);
    return false;
  }
  return true;
}

function clearAwaitingSolve(telegramId) {
  awaitingSolve.delete(telegramId);
}

// ─── Generated PDF sessions ─────────────────────────────────────────────────
// The rendered worksheet PDF (a Buffer) is held here just long enough for
// the user to tap [📄 ទាញយក PDF]. Same short-id/callback_data trick as
// download sessions, and same reasoning: nothing is ever written to disk,
// it's a plain in-memory Buffer that's dropped once used or expired.
const PDF_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const pdfSessions = new Map();

function createPdfSession(payload) {
  const id = crypto.randomBytes(4).toString("hex");
  pdfSessions.set(id, { ...payload, id, createdAt: Date.now() });
  return id;
}

function getPdfSession(id) {
  const session = pdfSessions.get(id);
  if (!session) return null;
  if (Date.now() - session.createdAt > PDF_SESSION_TTL_MS) {
    pdfSessions.delete(id);
    return null;
  }
  return session;
}

function deletePdfSession(id) {
  pdfSessions.delete(id);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of pdfSessions) {
    if (now - session.createdAt > PDF_SESSION_TTL_MS) pdfSessions.delete(id);
  }
}, 5 * 60 * 1000).unref();

module.exports = {
  createDownloadSession,
  getDownloadSession,
  deleteDownloadSession,
  setAwaitingOcr,
  isAwaitingOcr,
  clearAwaitingOcr,
  setAwaitingSolve,
  isAwaitingSolve,
  clearAwaitingSolve,
  createPdfSession,
  getPdfSession,
  deletePdfSession,
};
