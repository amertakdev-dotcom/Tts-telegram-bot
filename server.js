// ===============================
// server.js — Amertak Mini Bot (Upgraded)
//
// New in this version:
//   • Link downloader (YouTube/TikTok/Pinterest/Spotify) — sends the media
//     directly to Telegram (audio/video/image) with real progress bars.
//     A link BLOCKS the TTS handler for that message.
//   • "Copy text from image" via Groq vision — tap the button on /start,
//     send a photo, get the extracted text back.
//   • Nothing is ever written to Render's disk. TTS audio, downloaded
//     media, and photos for OCR all stay in memory (Buffers / streams)
//     and are discarded as soon as they're sent.
// ===============================

const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const axios = require("axios");
const http = require("http");

const User = require("./models/User");
const {
  BOT_TOKEN,
  GROQ_API_KEY,
  MONGODB_URI,
  BOT_USERNAME,
  WEBSITE_URL,
  DEVELOPER_LINK,
  SPEED_CYCLE,
} = require("./config");

const { getVoiceLabel, buildStartKeyboard, buildInlineKeyboard } = require("./lib/keyboards");
const { handleTTS } = require("./lib/tts");
const { extractUrl, handleLinkMessage, handleDownloadCallback } = require("./lib/downloader");
const { handlePhotoMessage } = require("./lib/ocr");
const { setAwaitingOcr } = require("./lib/sessions");

// ─── MongoDB ──────────────────────────────────────────────────────────────
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB error:", err.message);
    process.exit(1);
  });

// ─── Bot Init ─────────────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("🤖 Amertak Mini Bot running...");

async function findOrCreateUser(from) {
  let user = await User.findOne({ telegramId: from.id });
  if (!user) {
    user = await User.create({
      telegramId: from.id,
      firstName: from.first_name || "",
      username: from.username || "",
      voice: "km-KH-PisethNeural",
      speed: 1.0,
    });
    console.log(`👤 New user ${from.id}`);
  }
  return user;
}

// ─── /start ───────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const user = await findOrCreateUser(msg.from);

    const fullName = `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim() || "User";
    const userLink = msg.from.username
      ? `[${fullName}](https://t.me/${msg.from.username})`
      : fullName;

    const welcomeText = `សូមស្វាគមន៍ ${userLink} មកកាន់ [Amertak Mini Bot](https://t.me/${BOT_USERNAME}) 🤖

• មុខងារ:
- 🎙 បង្កើតសំឡេង Ai
- 🤖 Ai Chat - សួរអ្វីក៏បាន
- ⬇️ ទាញយក វីដេអូ/រូបភាព/សំឡេង ពី YouTube, TikTok, Pinterest, Spotify
- ✂️ ចម្លងអត្ថបទពីរូបភាព

• របៀបប្រើ:
1. ផ្ញើអក្សរទៅកាន់ bot ដើម្បីបង្កើតសំឡេង
2. ផ្ញើលីង YouTube/TikTok/Pinterest/Spotify ដើម្បីទាញយក
3. ចុច [✂️ ចម្លងអត្ថបទ] រួចផ្ញើររូបភាព ដើម្បីស្រង់អត្ថបទ
4. សរសេរ /ask សំណួរ ដើម្បីសួរទៅ Ai

• ព័ត៌មានបន្ថែម:
🌐 វេបសាយ: [អមតៈ - Amertak](${WEBSITE_URL})
🥀 ម្ចាស់បូត: [Thavrath Amertak](${DEVELOPER_LINK})
`;

    await bot.sendMessage(chatId, welcomeText, {
      parse_mode: "Markdown",
      ...buildStartKeyboard(user),
    });
  } catch (err) {
    console.error("❌ Start error:", err.message);
    await bot.sendMessage(chatId, "❌ មានបញ្ហាក្នុងការចាប់ផ្តើម bot");
  }
});

// ─── /ask command (AI Assistant) ───────────────────────────────────────────
bot.onText(/\/ask(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userQuestion = match[1]?.trim();

  if (!userQuestion) {
    return bot.sendMessage(
      chatId,
      "❓ សូមវាយសំណួរ បន្ទាប់ពី /ask\n\nឧទាហរណ៍:\n/ask របៀបប្រើ Amertak Mini Bot?"
    );
  }

  try {
    await bot.sendChatAction(chatId, "typing");

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `
អ្នកជា Amertak AI Assistant ក្នុង Amertak Mini Bot។

ព័ត៌មានអំពី Bot:

ឈ្មោះ:
Amertak Mini Bot

មុខងារ:
- បង្កើតសំឡេង AI Khmer TTS
- AI Chat សួរអ្វីក៏បាន
- ទាញយក វីដេអូ/រូបភាព/សំឡេង ពី YouTube, TikTok, Pinterest, Spotify
- ចម្លងអត្ថបទពីរូបភាព (OCR)

Website:
https://amertak.vercel.app
Link of website:
tools/text-to-speech-khmer (tts)
tools/downloader
tools/cloud
tools/qr-code
tools/transcribe

Developer:
គីន ថាវរ៉ាត់
Telegram:
https://t.me/amertak_network

របៀបឆ្លើយ:
- ឆ្លើយជាភាសាខ្មែរ ជាចម្បង
- ឆ្លើយឲ្យងាយយល់
- រៀបចំជាចំណុចនៅពេលចាំបាច់
- សម្រាប់ coding ផ្តល់ code និង explanation
- កុំបង្កើតព័ត៌មានមិនពិត
- មិនត្រូវឆ្លើយថាបង្កើតឡើងដោយក្រុមហ៑ុនទេ គឺបង្កើតដោយ developer តែម្នាក់ប៉ុណ្ណោះ បើ user សួរ
`,
          },
          { role: "user", content: userQuestion },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const answer = response.data.choices[0].message.content;
    await bot.sendMessage(chatId, `🤖 Amertak AI:\n\n${answer}`);
  } catch (err) {
    console.error("❌ AI Ask Error:", err.message);
    await bot.sendMessage(chatId, "❌ AI មិនអាចឆ្លើយបានទេ សូមព្យាយាមម្តងទៀត។");
  }
});

// ─── Normal Message Handler (link → downloader / photo → OCR / text → TTS) ─
bot.on("message", async (msg) => {
  // Photos always go through the OCR pipeline (only acted on if the user
  // pressed the [✂️ ចម្លងអត្ថបទ] button first — see lib/ocr.js).
  if (msg.photo && msg.photo.length > 0) {
    return handlePhotoMessage(bot, msg);
  }

  if (!msg.text) return;
  if (msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // A message containing a link BLOCKS TTS entirely and goes straight to
  // the downloader flow instead.
  const url = extractUrl(text);
  if (url) {
    return handleLinkMessage(bot, msg, url);
  }

  try {
    const user = await findOrCreateUser(msg.from);
    await handleTTS(bot, chatId, user, text);
  } catch (err) {
    console.error("❌ Message handler error:", err.message);
    await bot.sendMessage(chatId, "❌ មានបញ្ហា សូមព្យាយាមម្តងទៀត។");
  }
});

// ─── Callback Query Handler ─────────────────────────────────────────────────
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id;
  const data = query.data;
  const messageId = query.message.message_id;

  // Downloader format buttons are handled by their own module.
  if (data.startsWith("dl:")) {
    return handleDownloadCallback(bot, query);
  }

  try {
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        firstName: query.from.first_name || "",
        username: query.from.username || "",
        voice: "km-KH-PisethNeural",
        speed: 1.0,
      });
    }

    // Copy-text-from-image trigger
    if (data === "ocr_start") {
      setAwaitingOcr(telegramId);
      await bot.answerCallbackQuery(query.id, { text: "📷 សូមផ្ញើររូបភាព" });
      await bot.sendMessage(chatId, "📷 សូមផ្ញើររូបភាពដែលមានអត្ថបទ មកខ្ញុំ ដើម្បីស្រង់អត្ថបទ។");
      return;
    }

    // Voice Male
    if (data === "voice_male") {
      user.voice = "km-KH-PisethNeural";
      await user.save();
      await bot.answerCallbackQuery(query.id, { text: "បានប្តូរទៅ Piseth ✅" });
      await bot.editMessageReplyMarkup(buildInlineKeyboard(user).reply_markup, {
        chat_id: chatId,
        message_id: messageId,
      });
      return;
    }

    // Voice Female
    if (data === "voice_female") {
      user.voice = "km-KH-SreymomNeural";
      await user.save();
      await bot.answerCallbackQuery(query.id, { text: "បានប្តូរទៅ Sreymom ✅" });
      await bot.editMessageReplyMarkup(buildInlineKeyboard(user).reply_markup, {
        chat_id: chatId,
        message_id: messageId,
      });
      return;
    }

    // Speed
    if (data === "speed_cycle") {
      const currentIndex = SPEED_CYCLE.indexOf(user.speed);
      const nextIndex = (currentIndex + 1) % SPEED_CYCLE.length;
      user.speed = SPEED_CYCLE[nextIndex];
      await user.save();
      await bot.answerCallbackQuery(query.id, { text: `⚡ Speed ${user.speed.toFixed(1)}x` });
      await bot.editMessageReplyMarkup(buildInlineKeyboard(user).reply_markup, {
        chat_id: chatId,
        message_id: messageId,
      });
      return;
    }

    // Settings
    if (data === "settings") {
      const settingsText = `⚙️ ការកំណត់

👤 ឈ្មោះ:
${user.firstName || "N/A"}

🎙 Voice:
${getVoiceLabel(user.voice)}

⚡ Speed:
${user.speed.toFixed(1)}x

🆔 ID:
\`${user.telegramId}\`
`;
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, settingsText, {
        parse_mode: "Markdown",
        ...buildInlineKeyboard(user),
      });
      return;
    }

    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error("❌ Callback error:", err.message);
    await bot.answerCallbackQuery(query.id, { text: "❌ Error" }).catch(() => {});
  }
});

// ─── Polling Error ──────────────────────────────────────────────────────────
bot.on("polling_error", (err) => {
  console.error("❌ Telegram polling error:", err.message);
});

// ─── Render HTTP Server (keeps the Render web service alive) ───────────────
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Amertak Mini Bot is running.\n");
  })
  .listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
  });
