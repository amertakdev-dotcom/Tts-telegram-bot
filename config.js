// ===============================
// config.js — central configuration
// ===============================
require("dotenv").config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

// Base URL of the Amertak backend (the one that hosts /api/tts, /api/info,
// /api/proxy-download, ...). Everything is derived from this so changing the
// deployment only requires updating one env var.
const API_BASE_URL =
  process.env.API_BASE_URL || "https://amertak-cdn.onrender.com/api";

const TTS_API_URL = process.env.TTS_API_URL || `${API_BASE_URL}/tts`;
const INFO_API_URL = `${API_BASE_URL}/info`;
const PROXY_DOWNLOAD_URL = `${API_BASE_URL}/proxy-download`;

// Optional shared secret — only sent if the backend's API_SECRET_KEY guard
// is turned on. Safe to leave unset.
const API_SECRET_KEY = process.env.API_SECRET_KEY || "";

// Groq vision model used for "copy text from image" (OCR). Groq's vision
// lineup changes often — llama-4-scout was retired; as of this writing the
// current (and only) production vision model is qwen/qwen3.6-27b. Check
// https://console.groq.com/docs/vision if this stops working again.
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b";

const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile";

// Name shown in the "Prepared with ..." footer of generated worksheet PDFs.
const AI_FOOTER_NAME = process.env.AI_FOOTER_NAME || "Amertak AI";

const BOT_USERNAME = "amertak_bot";
const WEBSITE_URL = "https://amertak.vercel.app";
const DEVELOPER_NAME = "គីន ថាវរ៉ាត់";
const DEVELOPER_LINK = "https://t.me/amertak_network";

const SPEED_CYCLE = [0.5, 1.0, 1.5, 2.0];

// Extra header sent to the Amertak backend when a secret key is configured.
function backendHeaders(extra = {}) {
  const headers = { ...extra };
  if (API_SECRET_KEY) headers["x-api-key"] = API_SECRET_KEY;
  return headers;
}

module.exports = {
  BOT_TOKEN,
  GROQ_API_KEY,
  MONGODB_URI,
  API_BASE_URL,
  TTS_API_URL,
  INFO_API_URL,
  PROXY_DOWNLOAD_URL,
  API_SECRET_KEY,
  GROQ_VISION_MODEL,
  GROQ_CHAT_MODEL,
  AI_FOOTER_NAME,
  BOT_USERNAME,
  WEBSITE_URL,
  DEVELOPER_NAME,
  DEVELOPER_LINK,
  SPEED_CYCLE,
  backendHeaders,
};
