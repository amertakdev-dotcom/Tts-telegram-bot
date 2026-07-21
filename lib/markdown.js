// ===============================
// lib/markdown.js — renders AI-generated Markdown as real Telegram
// formatting instead of showing raw ** characters.
//
// LLM output (Groq /ask and Groq vision OCR both) commonly uses GitHub-style
// "**bold**", but Telegram's legacy Markdown parse_mode only understands
// single-asterisk "*bold*". Without conversion, Telegram just prints the
// literal ** characters. This also guards against parse errors: Telegram's
// Markdown parser throws if formatting characters aren't balanced/escaped,
// which would otherwise crash the whole send — so we fall back to plain
// text instead of failing silently.
// ===============================

function toTelegramMarkdown(text) {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // **bold** -> *bold*
    .replace(/__(.+?)__/g, "_$1_"); // __italic__ -> _italic_
}

async function sendFormatted(bot, chatId, text, options = {}) {
  try {
    return await bot.sendMessage(chatId, toTelegramMarkdown(text), {
      parse_mode: "Markdown",
      ...options,
    });
  } catch (err) {
    console.warn("⚠️ Markdown send failed, falling back to plain text:", err.message);
    return bot.sendMessage(chatId, text, options);
  }
}

module.exports = { toTelegramMarkdown, sendFormatted };