// ===============================
// lib/ocr.js — "ចម្លងអត្ថបទ" (copy text from image) via Groq vision
//
// The photo is fetched from Telegram straight into a Buffer, base64-encoded
// in memory, sent to Groq, and discarded. No file ever touches disk.
// ===============================
const axios = require("axios");
const { GROQ_API_KEY, GROQ_VISION_MODEL } = require("../config");
const { isAwaitingOcr, clearAwaitingOcr } = require("./sessions");
const { editProgress } = require("./progress");

async function handlePhotoMessage(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  if (!isAwaitingOcr(telegramId)) {
    await bot.sendMessage(
      chatId,
      "ℹ️ ដើម្បីស្រង់អត្ថបទពីរូបភាព សូមចុចប៊ូតុង [✂️ ចម្លងអត្ថបទ] នៅសារ /start រួចផ្ញើររូបភាពមកខ្ញុំម្តងទៀត។"
    );
    return;
  }
  clearAwaitingOcr(telegramId);

  const progressMsg = await bot.sendMessage(chatId, `🔍 កំពុងស្កេនរូបភាព...\n▰▱▱▱▱ 20%`);

  try {
    // Telegram sends multiple sizes — take the highest resolution one.
    const photo = msg.photo[msg.photo.length - 1];
    const fileLink = await bot.getFileLink(photo.file_id);

    const imgRes = await axios.get(fileLink, { responseType: "arraybuffer", timeout: 30000 });
    const base64 = Buffer.from(imgRes.data).toString("base64");
    const mime = /\.png($|\?)/i.test(fileLink) ? "image/png" : "image/jpeg";

    await editProgress(bot, chatId, progressMsg.message_id, "🧠 កំពុងវិភាគអក្សរ...", 60);

    const groqRes = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: GROQ_VISION_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Extract ALL text visible in this image exactly as written, preserving line breaks. Keep Khmer, English, and numbers exactly as shown. Reply with ONLY the extracted text and nothing else — no explanation, no translation.",
              },
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            ],
          },
        ],
      },
      {
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    const extracted = groqRes.data?.choices?.[0]?.message?.content?.trim();

    await editProgress(bot, chatId, progressMsg.message_id, "✅ ស្រង់អត្ថបទរួចរាល់!", 100);

    if (!extracted) {
      await bot.sendMessage(chatId, "❌ រកមិនឃើញអក្សរនៅក្នុងរូបភាពនេះទេ។");
    } else {
      await bot.sendMessage(chatId, `📝 អត្ថបទដែលបានស្រង់ចេញ:\n\n${extracted}`);
    }
  } catch (err) {
    console.error("❌ OCR error:", err.message);
    await bot
      .editMessageText("❌ បរាជ័យក្នុងការស្កេនរូបភាព។ សូមព្យាយាមម្តងទៀត។", {
        chat_id: chatId,
        message_id: progressMsg.message_id,
      })
      .catch(() => {});
  }
}

module.exports = { handlePhotoMessage };
