// ===============================
// lib/downloader.js — Video/Audio/Image downloader via the Amertak backend
//
// Flow:
//   1. User sends a link (YouTube / TikTok / Pinterest / Spotify).
//   2. We call the backend's /api/info?url=... to auto-detect the platform
//      and resolve real download links (this ALSO blocks the TTS handler
//      for that message — a URL is never spoken).
//   3. We show inline buttons only for the formats that actually exist
//      (video / image / audio), with real progress updates.
//   4. On tap, the chosen file is streamed backend → bot → Telegram
//      entirely in memory (via axios responseType:"stream" piped straight
//      into sendVideo/sendAudio/sendPhoto). Nothing is ever written to
//      Render's disk.
// ===============================
const axios = require("axios");
const {
  INFO_API_URL,
  PROXY_DOWNLOAD_URL,
  backendHeaders,
} = require("../config");
const { buildFormatKeyboard } = require("./keyboards");
const {
  createDownloadSession,
  getDownloadSession,
  deleteDownloadSession,
} = require("./sessions");
const { progressBar, editProgress, startTicker } = require("./progress");

const URL_REGEX = /(https?:\/\/[^\s]+)/i;

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("tiktok.com") || u.includes("vm.tiktok") || u.includes("vt.tiktok")) return "tiktok";
  if (u.includes("pinterest.com") || u.includes("pin.it")) return "pinterest";
  if (u.includes("spotify.com") || u.includes("open.spotify")) return "spotify";
  return null;
}

function extractUrl(text) {
  const m = text.match(URL_REGEX);
  return m ? m[1] : null;
}

function sanitizeFilename(name) {
  return String(name || "download")
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .trim()
    .slice(0, 100) || "download";
}

// Normalizes each platform's very different response shape into a single
// { title, downloads: { video, audio, images: [] } } object.
function normalizeDownloads(platform, data) {
  if (!data) return null;

  if (platform === "youtube") {
    return {
      title: data.title || "youtube_video",
      downloads: {
        video: data.bestDownload?.video?.url || null,
        audio: data.bestDownload?.audio?.url || null,
        images: [],
      },
    };
  }

  if (platform === "tiktok") {
    const images = Array.isArray(data.downloads?.images)
      ? data.downloads.images.map((img) => img.url).filter(Boolean)
      : [];
    return {
      title: data.title || "tiktok_post",
      downloads: {
        video: data.downloads?.noWatermark || data.downloads?.hdNoWatermark || null,
        audio: data.downloads?.audio || null,
        images,
      },
    };
  }

  if (platform === "pinterest") {
    const single = data.downloads?.imageOriginal || data.downloads?.image || null;
    return {
      title: data.title || "pinterest_pin",
      downloads: {
        video: data.downloads?.video || null,
        audio: null,
        images: single ? [single] : [],
      },
    };
  }

  if (platform === "spotify") {
    return {
      title: [data.title, data.artist].filter(Boolean).join(" - ") || "spotify_track",
      downloads: {
        video: null,
        audio: data.downloads?.mp3?.url || null,
        images: [],
      },
    };
  }

  return null;
}

function buildCaption(title) {
  return `🔗 ${title || "Downloaded"}\n⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ: @amertak_bot`;
}

// Streams a remote file through the backend's proxy-download endpoint
// (which fixes up Referer/headers per-CDN) straight into a Telegram send
// call. Nothing touches disk — it's a live pipe from HTTP response to
// Telegram's upload stream. This is the SLOW path (CDN → backend → bot →
// Telegram, three hops) but it's the only one that works for CDNs like
// YouTube's googlevideo.com that reject requests without the right Referer.
async function streamToTelegram(bot, chatId, kind, remoteUrl, filename, options, onProgress) {
  const proxyUrl =
    `${PROXY_DOWNLOAD_URL}?url=${encodeURIComponent(remoteUrl)}` +
    `&filename=${encodeURIComponent(filename)}`;

  const upstream = await axios.get(proxyUrl, {
    responseType: "stream",
    timeout: 120000,
    headers: backendHeaders(),
  });

  const total = parseInt(upstream.headers["content-length"] || "0", 10);
  let received = 0;

  if (onProgress && total > 0) {
    upstream.data.on("data", (chunk) => {
      received += chunk.length;
      const percent = Math.min(99, Math.floor((received / total) * 100));
      onProgress(percent);
    });
  }

  const contentType =
    upstream.headers["content-type"] ||
    (kind === "photo" ? "image/jpeg" : kind === "audio" ? "audio/mpeg" : "video/mp4");

  const fileOptions = { filename, contentType };

  if (kind === "video") return bot.sendVideo(chatId, upstream.data, options, fileOptions);
  if (kind === "audio") return bot.sendAudio(chatId, upstream.data, options, fileOptions);
  if (kind === "photo") return bot.sendPhoto(chatId, upstream.data, options, fileOptions);
  throw new Error(`Unknown stream kind: ${kind}`);
}

// FAST path: hand the raw CDN URL straight to Telegram and let Telegram's
// own servers fetch it — this skips our backend AND our bot process
// entirely, which is where most of the "takes too long to send" delay was
// coming from (CDN → Render backend → Render bot → Telegram was 3 hops;
// this is CDN → Telegram directly). Works for CDNs that don't care about
// Referer (tikwm, pinimg, spotify cdn, etc). Falls back to the proxy-relay
// above when Telegram can't fetch it directly — most commonly YouTube's
// googlevideo.com links, which 403 without a matching Referer header.
async function sendMedia(bot, chatId, kind, remoteUrl, filename, options, hooks = {}) {
  const { onFallback, onProgress } = hooks;
  try {
    if (kind === "video") return await bot.sendVideo(chatId, remoteUrl, options);
    if (kind === "audio") return await bot.sendAudio(chatId, remoteUrl, options);
    if (kind === "photo") return await bot.sendPhoto(chatId, remoteUrl, options);
    throw new Error(`Unknown kind: ${kind}`);
  } catch (directErr) {
    console.warn(`⚠️ Direct send failed (${kind}), falling back to proxy relay:`, directErr.message);
    if (onFallback) await onFallback();
    return streamToTelegram(bot, chatId, kind, remoteUrl, filename, options, onProgress);
  }
}

// ─── Step 1: link received in a normal message ─────────────────────────────
async function handleLinkMessage(bot, msg, url) {
  const chatId = msg.chat.id;
  const platform = detectPlatform(url);

  if (!platform) {
    await bot.sendMessage(
      chatId,
      "❌ លីងនេះមិនត្រូវបានគាំទ្រទេ។\nគាំទ្រ: YouTube, TikTok, Pinterest, Spotify"
    );
    return;
  }

  const progressMsg = await bot.sendMessage(chatId, `🔎 កំពុងវិភាគលីង...\n${progressBar(15)}`);

  // Some platforms (YouTube especially) chain through several fallback
  // extractors on the backend and can take a while — keep the bar moving
  // instead of leaving it stuck at 15% the whole time.
  const ticker = startTicker(bot, chatId, progressMsg.message_id, "🔎 កំពុងវិភាគលីង...", {
    from: 15,
    to: 85,
    stepMs: 1000,
    step: 6,
  });

  try {
    const { data } = await axios.get(INFO_API_URL, {
      params: { url },
      timeout: 45000,
      headers: backendHeaders(),
    });

    ticker.stop();

    if (!data || data.success === false) {
      throw new Error(data?.error || "Failed to analyze link");
    }

    await editProgress(bot, chatId, progressMsg.message_id, "🔎 កំពុងវិភាគលីង...", 90);

    const normalized = normalizeDownloads(platform, data.data);
    const hasAnything =
      normalized &&
      (normalized.downloads.video || normalized.downloads.audio || normalized.downloads.images.length);

    if (!hasAnything) {
      await bot.editMessageText("❌ រកមិនឃើញឯកសារសម្រាប់ទាញយកទេ។ លីងអាចមិនត្រឹមត្រូវ ឬឯកជន។", {
        chat_id: chatId,
        message_id: progressMsg.message_id,
      });
      return;
    }

    const sessionId = createDownloadSession({
      chatId,
      telegramId: msg.from.id,
      title: normalized.title,
      downloads: normalized.downloads,
    });

    await bot.editMessageText("ជ្រើសរើសទម្រង់÷", {
      chat_id: chatId,
      message_id: progressMsg.message_id,
      reply_markup: buildFormatKeyboard(sessionId, normalized.downloads),
    });
  } catch (err) {
    ticker.stop();
    console.error("❌ Downloader analyze error:", err.message);
    await bot
      .editMessageText("❌ មិនអាចវិភាគលីងនេះបានទេ។ សូមព្យាយាមម្តងទៀត។", {
        chat_id: chatId,
        message_id: progressMsg.message_id,
      })
      .catch(() => {});
  }
}

// ─── Step 2: user tapped a format button ───────────────────────────────────
async function handleDownloadCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [, type, sessionId] = query.data.split(":");

  const session = getDownloadSession(sessionId);
  if (!session) {
    await bot.answerCallbackQuery(query.id, {
      text: "❌ សម័យផុតកំណត់ សូមផ្ញើលីងម្តងទៀត។",
    });
    return;
  }

  await bot.answerCallbackQuery(query.id);

  const { title, downloads } = session;

  try {
    if (type === "image" && downloads.images.length > 0) {
      const total = downloads.images.length;
      for (let i = 0; i < total; i++) {
        const basePercent = Math.floor((i / total) * 95);
        await editProgress(bot, chatId, messageId, `📤 កំពុងផ្ញើរូបភាព ${i + 1}/${total}...`, basePercent);

        await sendMedia(
          bot,
          chatId,
          "photo",
          downloads.images[i],
          `${sanitizeFilename(title)}_${i + 1}.jpg`,
          i === 0 ? { caption: buildCaption(title) } : {},
          {
            onFallback: () =>
              editProgress(bot, chatId, messageId, `📤 កំពុងផ្ញើរូបភាព ${i + 1}/${total} (បម្រុង)...`, basePercent),
          }
        );
      }
    } else {
      const remoteUrl = downloads[type];
      if (!remoteUrl) {
        await bot.editMessageText("❌ ទម្រង់នេះមិនអាចប្រើបានទេ។", {
          chat_id: chatId,
          message_id: messageId,
        });
        return;
      }

      const ext = type === "audio" ? "mp3" : "mp4";
      const filename = `${sanitizeFilename(title)}.${ext}`;
      const kind = type === "audio" ? "audio" : "video";

      // Fast path first — Telegram fetches the CDN URL itself, so this is
      // usually near-instant. We only show the (slower) progress bar once
      // we know we've had to fall back to relaying it through our backend.
      await editProgress(bot, chatId, messageId, "🚀 កំពុងផ្ញើ...", 30);

      let lastPercent = 5;
      await sendMedia(bot, chatId, kind, remoteUrl, filename, { caption: buildCaption(title) }, {
        onFallback: () => editProgress(bot, chatId, messageId, "⬇️ កំពុងទាញយក & ផ្ញើ (បម្រុង)...", 5),
        onProgress: (percent) => {
          if (percent - lastPercent >= 10) {
            lastPercent = percent;
            editProgress(bot, chatId, messageId, "⬇️ កំពុងទាញយក & ផ្ញើ (បម្រុង)...", percent).catch(() => {});
          }
        },
      });
    }

    await editProgress(bot, chatId, messageId, "✅ ស្រេច!", 100);
  } catch (err) {
    console.error("❌ Downloader send error:", err.message);
    await bot
      .editMessageText("❌ បរាជ័យក្នុងការទាញយក ឬផ្ញើឯកសារ។ សូមព្យាយាមម្តងទៀត។", {
        chat_id: chatId,
        message_id: messageId,
      })
      .catch(() => {});
  } finally {
    deleteDownloadSession(sessionId);
  }
}

module.exports = {
  extractUrl,
  detectPlatform,
  handleLinkMessage,
  handleDownloadCallback,
};
