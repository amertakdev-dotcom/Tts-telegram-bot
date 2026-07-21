// ===============================
// lib/progress.js — "▰▰▰▰▱" style progress bars + throttled message edits
// ===============================

// Builds a progress bar string like "▰▰▰▱▱ 60%"
function progressBar(percent, size = 5) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((p / 100) * size);
  return `${"▰".repeat(filled)}${"▱".repeat(size - filled)} ${p}%`;
}

// Keeps last-sent percent per message so we don't spam editMessageText
// (Telegram rate-limits edits). Only re-renders on real jumps in progress.
const lastPercentByMessage = new Map();

function shouldUpdate(messageKey, percent, minDeltaPercent = 10) {
  const last = lastPercentByMessage.get(messageKey);
  if (last === undefined || percent - last >= minDeltaPercent || percent >= 100) {
    lastPercentByMessage.set(messageKey, percent);
    return true;
  }
  return false;
}

function clearProgress(messageKey) {
  lastPercentByMessage.delete(messageKey);
}

// Edits a Telegram message with a label + progress bar, swallowing the
// harmless "message is not modified" error Telegram throws when the text
// happens to be identical to what's already there.
async function editProgress(bot, chatId, messageId, label, percent) {
  try {
    await bot.editMessageText(`${label}\n${progressBar(percent)}`, {
      chat_id: chatId,
      message_id: messageId,
    });
  } catch (err) {
    if (!/message is not modified/i.test(err.message || "")) {
      console.error("❌ Progress edit error:", err.message);
    }
  }
}

// Starts a fake-but-reassuring "still working" ticker for operations where
// we have no byte-level progress signal (e.g. waiting on a text-to-speech
// API that just returns one big blob at the end). Climbs from `from` up to
// `to` (never 100 — that's reserved for the real completion edit) and stops
// as soon as .stop() is called.
function startTicker(bot, chatId, messageId, label, opts = {}) {
  const { from = 15, to = 92, stepMs = 900, step = 9 } = opts;
  let percent = from;
  editProgress(bot, chatId, messageId, label, percent).catch(() => {});
  const timer = setInterval(() => {
    percent = Math.min(to, percent + step);
    editProgress(bot, chatId, messageId, label, percent).catch(() => {});
  }, stepMs);
  return { stop: () => clearInterval(timer) };
}

module.exports = { progressBar, shouldUpdate, clearProgress, editProgress, startTicker };
