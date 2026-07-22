// ===============================
// lib/solver.js — "ដោះស្រាយលំហាត់" (solve an exercise from a photo)
//
// Flow: user taps [🧮 ដោះស្រាយលំហាត់] on /start -> sends a photo of an
// exercise -> Groq vision reads + solves it and returns structured JSON ->
// that JSON is rendered into the SAME worksheet-style HTML used for the
// PDF -> page 1 is sent as a photo in chat, and the full multi-page PDF is
// stashed in an in-memory session behind a [📄 ទាញយក PDF] button.
//
// Nothing is written to disk: the photo bytes, the rendered PNG, and the
// rendered PDF all stay in memory (Buffers) and the PDF session expires on
// its own if never downloaded.
// ===============================
const axios = require("axios");
const { GROQ_API_KEY, GROQ_VISION_MODEL, AI_FOOTER_NAME } = require("../config");
const { isAwaitingSolve, clearAwaitingSolve, createPdfSession, getPdfSession } = require("./sessions");
const { editProgress, startTicker } = require("./progress");
const { buildWorksheetHtml } = require("./worksheetTemplate");
const { renderFirstPageImage, renderPdf } = require("./pdfRenderer");

const SOLVE_SYSTEM_PROMPT = `You are a physics/math teacher. Look at the image of one or more exercises (may be in Khmer, English, or mixed) and solve every exercise shown, fully worked out step by step.

Reply with ONLY a single JSON object (no markdown fences, no commentary) matching EXACTLY this shape:
{
  "title": "លំហាត់ និងដំណោះស្រាយ",
  "subtitle": "<short topic name in Khmer, e.g. ចលនារង្វង់ (Circular Motion)>",
  "badge": "អមដំណោះស្រាយលម្អិត",
  "problems": [
    {
      "number": "<Khmer numeral, e.g. ១>",
      "points": "<e.g. ១០ ពិន្ទុ, or empty string if unknown>",
      "statement": "<the exercise text, in the same language it was given>",
      "givens": ["v = 2 m/s", "r = 4 m", "..."],
      "steps": [
        { "label": "ក. <short step title>:", "note": "<optional 1-line explanation, or omit>", "lines": ["<formula/calculation line>", "..."] }
      ],
      "answer": "ចម្លើយ: <final result(s)>"
    }
  ]
}

Rules:
- Keep all Khmer text in Khmer, all math/formulas in the original notation.
- One "problems" entry per distinct exercise found in the image.
- "steps" must show the actual working (formula, substitution, result), not just the final answer.
- If something isn't given/asked, omit that field rather than inventing data.`;

// Returns true if it handled the photo (i.e. the user had tapped the
// solve button first), false otherwise so the caller can fall through to
// another photo handler (e.g. OCR).
async function handleSolvePhoto(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  if (!isAwaitingSolve(telegramId)) return false;
  clearAwaitingSolve(telegramId);

  const progressMsg = await bot.sendMessage(chatId, `🧮 កំពុងអានលំហាត់...\n▰▱▱▱▱ 15%`);
  const ticker = startTicker(bot, chatId, progressMsg.message_id, "🧮 កំពុងដោះស្រាយលំហាត់...", {
    from: 15,
    to: 70,
    stepMs: 1000,
    step: 6,
  });

  try {
    const photo = msg.photo[msg.photo.length - 1];
    const fileLink = await bot.getFileLink(photo.file_id);
    const imgRes = await axios.get(fileLink, { responseType: "arraybuffer", timeout: 30000 });
    const base64 = Buffer.from(imgRes.data).toString("base64");
    const mime = /\.png($|\?)/i.test(fileLink) ? "image/png" : "image/jpeg";

    const groqRes = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: GROQ_VISION_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: SOLVE_SYSTEM_PROMPT },
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            ],
          },
        ],
      },
      {
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        timeout: 45000,
      }
    );

    ticker.stop();
    await editProgress(bot, chatId, progressMsg.message_id, "🎨 កំពុងបង្កើតឯកសារលទ្ធផល...", 80);

    const raw = groqRes.data?.choices?.[0]?.message?.content;
    const data = JSON.parse(raw);
    if (!data.problems || !data.problems.length) {
      throw new Error("No problems found in AI response");
    }

    const html = buildWorksheetHtml(data, { aiName: AI_FOOTER_NAME });

    const [pngBuffer, pdfBuffer] = await Promise.all([renderFirstPageImage(html), renderPdf(html)]);

    const sessionId = createPdfSession({
      chatId,
      telegramId,
      buffer: pdfBuffer,
      filename: "amertak-solution.pdf",
    });

    await editProgress(bot, chatId, progressMsg.message_id, "✅ ស្រេច!", 100);

    await bot.sendPhoto(
      chatId,
      pngBuffer,
      {
        caption: `🧮 ដំណោះស្រាយលំហាត់\n⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ: @amertak_bot`,
        reply_markup: {
          inline_keyboard: [[{ text: "📄 ទាញយក PDF", callback_data: `pdf:${sessionId}` }]],
        },
      },
      { filename: "solution-preview.png", contentType: "image/png" }
    );
  } catch (err) {
    ticker.stop();
    console.error("❌ Solver error:", err.message);
    if (err.response?.data) console.error("❌ Solver error detail:", JSON.stringify(err.response.data));
    await bot
      .editMessageText("❌ មិនអាចដោះស្រាយលំហាត់នេះបានទេ។ សូមព្យាយាមម្តងទៀត។", {
        chat_id: chatId,
        message_id: progressMsg.message_id,
      })
      .catch(() => {});
  }

  return true;
}

async function handlePdfCallback(bot, query) {
  const chatId = query.message.chat.id;
  const sessionId = query.data.split(":")[1];
  const session = getPdfSession(sessionId);

  if (!session) {
    await bot.answerCallbackQuery(query.id, { text: "❌ សម័យផុតកំណត់ សូមផ្ញើររូបភាពម្តងទៀត។" });
    return;
  }

  await bot.answerCallbackQuery(query.id, { text: "📄 កំពុងផ្ញើ PDF..." });
  await bot.sendDocument(
    chatId,
    session.buffer,
    { caption: "📄 ដំណោះស្រាយពេញលេញ (PDF)" },
    { filename: session.filename, contentType: "application/pdf" }
  );
}

module.exports = { handleSolvePhoto, handlePdfCallback };
