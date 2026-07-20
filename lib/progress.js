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

module.exports = { progressBar, shouldUpdate, clearProgress, editProgress };
