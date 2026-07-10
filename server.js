require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const User = require("./models/User");

// ─── Config ───────────────────────────────────────────────────────────────────
const BOT_TOKEN   = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const TTS_API_URL = process.env.TTS_API_URL || "https://khmer-tts-api.onrender.com/tts";
const AUDIO_DIR   = path.join(__dirname, "audio");

// ─── Speed cycle list ─────────────────────────────────────────────────────────
const SPEED_CYCLE = [0.5, 1.0, 1.5, 2.0];

// ─── Voice display name helper ────────────────────────────────────────────────
function getVoiceLabel(voice) {
  if (voice === "km-KH-PisethNeural") return "Piseth (ប្រុស)";
  if (voice === "km-KH-SreymomNeural") return "Sreymom (ស្រី)";
  return voice;
}

// ─── Inline keyboard builder (shows current voice & speed) ───────────────────
function buildInlineKeyboard(user) {
  const voiceLabel = user.voice === "km-KH-PisethNeural"
    ? "🎙 សំឡេងប្រុស ✅"
    : "🎙 សំឡេងប្រុស";
  const voiceLabelF = user.voice === "km-KH-SreymomNeural"
    ? "🎙 សំឡេងស្រី ✅"
    : "🎙 សំឡេងស្រី";

  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: voiceLabel,  callback_data: "voice_male"   },
          { text: voiceLabelF, callback_data: "voice_female" },
        ],
        [
          { text: `⚡ ល្បឿន: ${user.speed.toFixed(1)}x`, callback_data: "speed_cycle" },
          { text: "⚙️ Settings",                          callback_data: "settings"    },
        ],
      ],
    },
  };
}

// ─── Ensure audio directory exists ────────────────────────────────────────────
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  console.log("📁 Created audio directory.");
}

// ─── Connect to MongoDB ───────────────────────────────────────────────────────
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected."))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// ─── Init Bot ─────────────────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("🤖 Khmer TTS Bot is running...");

// ─── /start command ───────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const chatId    = msg.chat.id;
  const telegramId = msg.from.id;
  const firstName  = msg.from.first_name || "";
  const username   = msg.from.username   || "";

  try {
    let user = await User.findOne({ telegramId });

    if (!user) {
      user = await User.create({
        telegramId,
        firstName,
        username,
        voice: "km-KH-PisethNeural",
        speed: 1.0,
      });
      console.log(`👤 New user created: ${telegramId}`);
    }

    const welcomeText =
      `សូមវាយបញ្ចូលអក្សរដើម្បីបង្កើតសំឡេង Ai\n\n` +
      `🎙 Voice: ${getVoiceLabel(user.voice)}\n` +
      `⚡ Speed: ${user.speed.toFixed(1)}x`;

    await bot.sendMessage(chatId, welcomeText, buildInlineKeyboard(user));
  } catch (err) {
    console.error("❌ /start error:", err.message);
    await bot.sendMessage(chatId, "❌ មានបញ្ហាក្នុងការចាប់ផ្តើម។ សូមព្យាយាមម្តងទៀត។");
  }
});

// ─── Message handler (normal text → TTS only) ────────────────────────────────
bot.on("message", async (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith("/")) return;

  const chatId     = msg.chat.id;
  const telegramId = msg.from.id;
  const text       = msg.text.trim();

  try {
    let user = await User.findOne({ telegramId });

    if (!user) {
      user = await User.create({
        telegramId,
        firstName: msg.from.first_name || "",
        username:  msg.from.username   || "",
        voice: "km-KH-PisethNeural",
        speed: 1.0,
      });
    }

    // ── Normal text → TTS ────────────────────────────────────────────────────
    await handleTTS(bot, chatId, user, text);

  } catch (err) {
    console.error("❌ Message handler error:", err.message);
    await bot.sendMessage(chatId, "❌ មានបញ្ហា។ សូមព្យាយាមម្តងទៀត។");
  }
});

// ─── Callback Query handler (Inline button actions) ───────────────────────────
bot.on("callback_query", async (query) => {
  const chatId     = query.message.chat.id;
  const telegramId = query.from.id;
  const data       = query.data;
  const messageId  = query.message.message_id;

  try {
    let user = await User.findOne({ telegramId });

    if (!user) {
      user = await User.create({
        telegramId,
        firstName: query.from.first_name || "",
        username:  query.from.username   || "",
        voice: "km-KH-PisethNeural",
        speed: 1.0,
      });
    }

    // ── Male Voice ───────────────────────────────────────────────────────────
    if (data === "voice_male") {
      user.voice = "km-KH-PisethNeural";
      await user.save();
      await bot.answerCallbackQuery(query.id, { text: "បានប្តូរទៅសំឡេង Piseth ✅" });
      await bot.editMessageReplyMarkup(buildInlineKeyboard(user).reply_markup, {
        chat_id: chatId, message_id: messageId,
      });
      return;
    }

    // ── Female Voice ─────────────────────────────────────────────────────────
    if (data === "voice_female") {
      user.voice = "km-KH-SreymomNeural";
      await user.save();
      await bot.answerCallbackQuery(query.id, { text: "បានប្តូរទៅសំឡេង Sreymom ✅" });
      await bot.editMessageReplyMarkup(buildInlineKeyboard(user).reply_markup, {
        chat_id: chatId, message_id: messageId,
      });
      return;
    }

    // ── Speed Cycle ──────────────────────────────────────────────────────────
    if (data === "speed_cycle") {
      const currentIndex = SPEED_CYCLE.indexOf(user.speed);
      const nextIndex    = (currentIndex + 1) % SPEED_CYCLE.length;
      user.speed         = SPEED_CYCLE[nextIndex];
      await user.save();
      await bot.answerCallbackQuery(query.id, { text: `⚡ Speed: ${user.speed.toFixed(1)}x` });
      await bot.editMessageReplyMarkup(buildInlineKeyboard(user).reply_markup, {
        chat_id: chatId, message_id: messageId,
      });
      return;
    }

    // ── Settings ─────────────────────────────────────────────────────────────
    if (data === "settings") {
      const settingsText =
        `⚙️ *ការកំណត់បច្ចុប្បន្ន*\n\n` +
        `👤 ឈ្មោះ: ${user.firstName || "N/A"}\n` +
        `🎙 Voice: ${getVoiceLabel(user.voice)}\n` +
        `⚡ Speed: ${user.speed.toFixed(1)}x\n` +
        `🆔 ID: \`${user.telegramId}\``;
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, settingsText, {
        parse_mode: "Markdown",
        ...buildInlineKeyboard(user),
      });
      return;
    }

    await bot.answerCallbackQuery(query.id);

  } catch (err) {
    console.error("❌ Callback query error:", err.message);
    await bot.answerCallbackQuery(query.id, { text: "❌ មានបញ្ហា។" });
  }
});

// ─── TTS Handler ─────────────────────────────────────────────────────────────
async function handleTTS(bot, chatId, user, text) {
  const tempFilePath = path.join(AUDIO_DIR, `tts_${chatId}_${Date.now()}.mp3`);

  try {
    // 1. Call Render TTS API
    const response = await axios.post(
      TTS_API_URL,
      {
        text:  text,
        voice: user.voice,
      },
      {
        responseType: "arraybuffer",
        timeout: 30000,
      }
    );

    // 2. Write audio buffer to temp file
    const audioBuffer = Buffer.from(response.data);
    fs.writeFileSync(tempFilePath, audioBuffer);

    // 3. Build caption
    const voiceName = user.voice === "km-KH-PisethNeural" ? "Piseth" : "Sreymom";
    const caption   =
      `🎙 Voice: ${voiceName}\n` +
      `⚡ Speed: ${user.speed.toFixed(1)}x`;

    // 4. Send audio to Telegram with inline keyboard attached
    await bot.sendAudio(chatId, tempFilePath, {
      caption:   caption,
      title:     "Khmer TTS",
      performer: `Amertak TTS · ${voiceName}`,
      ...buildInlineKeyboard(user),
    });

    console.log(`🎵 Audio sent to ${chatId}`);

  } catch (err) {
    console.error("❌ TTS error:", err.message);

    let errMsg = "❌ មានបញ្ហាក្នុងការបង្កើតសំឡេង។ សូមព្យាយាមម្តងទៀត។";
    if (err.code === "ECONNABORTED" || err.message.includes("timeout")) {
      errMsg = "⏱ TTS API ឆ្លើយតបយឺត។ សូមព្យាយាមម្តងទៀត។";
    }

    await bot.sendMessage(chatId, errMsg);

  } finally {
    // 5. Cleanup temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log(`🗑 Deleted temp file: ${path.basename(tempFilePath)}`);
    }
  }
}

// ─── Polling error handler ────────────────────────────────────────────────────
bot.on("polling_error", (err) => {
  console.error("❌ Polling error:", err.message);
});
