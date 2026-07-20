// ===============================
// lib/keyboards.js — inline keyboards
// ===============================
const { SPEED_CYCLE } = require("../config");

function getVoiceLabel(voice) {
  if (voice === "km-KH-PisethNeural") return "Piseth (ប្រុស)";
  if (voice === "km-KH-SreymomNeural") return "Sreymom (ស្រី)";
  return voice;
}

// TTS voice / speed / settings keyboard (unchanged behaviour from before)
function buildInlineKeyboard(user) {
  const voiceLabel =
    user.voice === "km-KH-PisethNeural" ? "🎙 សំឡេងប្រុស ✅" : "🎙 សំឡេងប្រុស";

  const voiceLabelF =
    user.voice === "km-KH-SreymomNeural" ? "🎙 សំឡេងស្រី ✅" : "🎙 សំឡេងស្រី";

  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: voiceLabel, callback_data: "voice_male" },
          { text: voiceLabelF, callback_data: "voice_female" },
        ],
        [
          { text: `⚡ ល្បឿន: ${user.speed.toFixed(1)}x`, callback_data: "speed_cycle" },
          { text: "⚙️ Settings", callback_data: "settings" },
        ],
      ],
    },
  };
}

// Same as buildInlineKeyboard but with an extra row for the OCR feature,
// used only on the /start welcome message.
function buildStartKeyboard(user) {
  const base = buildInlineKeyboard(user);
  base.reply_markup.inline_keyboard.push([
    { text: "✂️ ចម្លងអត្ថបទ (ពីរូបភាព)", callback_data: "ocr_start" },
  ]);
  return base;
}

// Format-choice keyboard shown after a supported link is analyzed.
// Only shows buttons for formats that are actually available:
// video, then image (only for image-type posts), then audio.
function buildFormatKeyboard(sessionId, downloads) {
  const row = [];
  if (downloads.video) {
    row.push({ text: "🎬 វីដេអូ", callback_data: `dl:video:${sessionId}` });
  }
  if (downloads.images && downloads.images.length > 0) {
    row.push({ text: "🖼 រូបភាព", callback_data: `dl:image:${sessionId}` });
  }
  if (downloads.audio) {
    row.push({ text: "🎧 សំឡេង", callback_data: `dl:audio:${sessionId}` });
  }
  return { inline_keyboard: [row] };
}

module.exports = {
  getVoiceLabel,
  buildInlineKeyboard,
  buildStartKeyboard,
  buildFormatKeyboard,
};
