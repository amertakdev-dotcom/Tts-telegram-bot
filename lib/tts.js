// ===============================
// lib/tts.js — Text-to-Speech handler
//
// IMPORTANT: this never writes to disk. The audio bytes returned by the
// Amertak TTS API are kept in a Buffer in memory and handed straight to
// Telegram's sendAudio, which is exactly what we want on Render (its
// filesystem is ephemeral anyway, so writing temp files there buys us
// nothing and only adds cleanup risk).
// ===============================
const axios = require("axios");
const { TTS_API_URL } = require("../config");
const { buildInlineKeyboard } = require("./keyboards");
const { editProgress, startTicker } = require("./progress");

async function handleTTS(bot, chatId, user, text) {
  // No byte-level signal is available while the TTS API is generating
  // audio, so show a ticking progress bar instead of leaving the user
  // staring at a blank chat.
  const progressMsg = await bot.sendMessage(chatId, `🎙️ កំពុងបង្កើតសំឡេង...\n▰▱▱▱▱ 15%`);
  const ticker = startTicker(bot, chatId, progressMsg.message_id, "🎙️ កំពុងបង្កើតសំឡេង...");

  try {
    // 1. Call TTS API
    const response = await axios.post(
      TTS_API_URL,
      { text, voice: user.voice },
      { responseType: "arraybuffer", timeout: 30000 }
    );

    ticker.stop();
    await editProgress(bot, chatId, progressMsg.message_id, "📤 កំពុងផ្ញើសំឡេង...", 95);

    // 2. Keep the audio in memory only
    const audioBuffer = Buffer.from(response.data);

    // 3. Caption
    const voiceName = user.voice === "km-KH-PisethNeural" ? "ᴘɪsᴇᴛʜ" : "sʀᴇʏᴍᴏᴍ";
    const caption = `♡ ᴠᴏɪᴄᴇ: ${voiceName}\n⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ: @amertak_bot`;

    // 4. Send audio straight from the buffer (fileOptions tells the
    // Telegram lib what filename/mimetype to declare, since a raw Buffer
    // has no path/extension of its own).
    await bot.sendAudio(
      chatId,
      audioBuffer,
      {
        caption,
        title: "សំឡេង Ai ;)",
        performer: `បង្កើតដោយ: អមតៈ - Amertak · ${voiceName}`,
        ...buildInlineKeyboard(user),
      },
      { filename: `tts_${Date.now()}.mp3`, contentType: "audio/mpeg" }
    );

    await editProgress(bot, chatId, progressMsg.message_id, "✅ ស្រេច!", 100);
    setTimeout(() => bot.deleteMessage(chatId, progressMsg.message_id).catch(() => {}), 1500);

    console.log(`🎵 Audio sent to ${chatId}`);
  } catch (err) {
    ticker.stop();
    console.error("❌ TTS Error:", err.message);

    let errorMessage = "❌ មានបញ្ហាក្នុងការបង្កើតសំឡេង។ សូមព្យាយាមម្តងទៀត។";
    if (err.code === "ECONNABORTED" || (err.message || "").includes("timeout")) {
      errorMessage = "⏱ 𝚃𝚃𝚂 𝙰𝙿𝙸 𝚃𝙾𝙾𝙺 𝚃𝙾 𝙻𝙾𝙽𝙶 𝚃𝙾 𝚁𝙴𝚂𝙿𝙾𝙽𝙳។ សូមព្យាយាមម្តងទៀត។";
    }

    await bot
      .editMessageText(errorMessage, { chat_id: chatId, message_id: progressMsg.message_id })
      .catch(() => bot.sendMessage(chatId, errorMessage));
  }
}

module.exports = { handleTTS };
