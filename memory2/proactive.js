const {
  listUserIds,
} = require("./store");

const {
  getMeta,
  localDateKey,
  touchProactive,
} = require("./meta");

const {
  dueThread,
  markPrompted,
} = require("./threads");

const {
  hoursBetween,
} = require("./util");

const {
  zonedParts,
} = require("./time");

const {
  addAssistantMessage,
} = require("./session");

let timer = null;
let running = false;

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function inQuietHours(hour) {
  const start = numberEnv("PROACTIVE_QUIET_START", 1);
  const end = numberEnv("PROACTIVE_QUIET_END", 8);

  if (start === end) return false;

  if (start < end) {
    return hour >= start && hour < end;
  }

  return hour >= start || hour < end;
}

function dailyCount(meta) {
  const key = localDateKey();

  if (meta.proactiveDateKey !== key) return 0;
  return Number(meta.proactiveCountToday || 0);
}

async function sendProactiveText(client, channelId, text) {
  if (!channelId) return false;

  try {
    const channel = await client.channels.fetch(channelId);

    if (!channel?.isTextBased?.()) return false;

    await channel.send(text);
    return true;
  } catch (error) {
    console.error("⚠️ 主動訊息傳送失敗：", error?.message || error);
    return false;
  }
}

async function tick({
  client,
  generateProactive,
  speakProactive,
}) {
  if (running) return;
  running = true;

  try {
    if (!boolEnv("PROACTIVE_ENABLED", true)) return;

    const owner = process.env.OWNER_USER_ID?.trim();
    const users = listUserIds();

    for (const userId of users) {
      if (owner && userId !== owner) continue;

      const meta = getMeta(userId);

      if (!meta.lastUserInteractionAt) continue;
      if (!meta.lastTextChannelId && !meta.lastGuildId) continue;

      const local = zonedParts();
      if (inQuietHours(local.hour)) continue;

      const inactivity = hoursBetween(meta.lastUserInteractionAt);
      const sinceProactive = meta.lastProactiveAt
        ? hoursBetween(meta.lastProactiveAt)
        : Infinity;

      const minInactive = numberEnv("PROACTIVE_MIN_INACTIVE_HOURS", 3);
      const cooldown = numberEnv("PROACTIVE_COOLDOWN_HOURS", 6);
      const maxDaily = numberEnv("PROACTIVE_DAILY_MAX", 2);

      if (inactivity === null || inactivity < minInactive) continue;
      if (sinceProactive !== null && sinceProactive < cooldown) continue;
      if (dailyCount(meta) >= maxDaily) continue;

      const thread = dueThread(userId);

      let reason = null;

      if (thread) {
        reason =
          `之前有一件還沒收尾、現在適合自然問一下的事：${thread.topic}` +
          (thread.reason ? `。背景：${thread.reason}` : "");
      } else {
        const spontaneous = boolEnv("PROACTIVE_SPONTANEOUS", true);
        const after = numberEnv("PROACTIVE_SPONTANEOUS_AFTER_HOURS", 8);

        if (!spontaneous || inactivity < after) continue;

        const chance = numberEnv("PROACTIVE_SPONTANEOUS_CHANCE", 0.12);
        if (Math.random() > chance) continue;

        reason =
          `已經大約 ${Math.round(inactivity)} 小時沒互動。` +
          "沒有必要問『你還好嗎』；可以依目前時間、共同記憶或她自己的個性自然丟一句訊息。";
      }

      let text;

      try {
        text = await generateProactive({
          userId,
          reason,
        });
      } catch (error) {
        console.error("⚠️ 主動訊息生成失敗：", error?.message || error);
        continue;
      }

      if (!text) continue;

      const mode = (process.env.PROACTIVE_MODE || "text").toLowerCase();

      let sentText = false;
      let sentVoice = false;

      if (mode === "text" || mode === "both") {
        sentText = await sendProactiveText(
          client,
          meta.lastTextChannelId,
          text
        );
      }

      if ((mode === "voice" || mode === "both") && typeof speakProactive === "function") {
        try {
          sentVoice = await speakProactive({
            guildId: meta.lastGuildId,
            userId,
            text,
          });
        } catch (error) {
          console.error("⚠️ 主動語音失敗：", error?.message || error);
        }
      }

      if (mode === "voice" && !sentVoice) {
        sentText = await sendProactiveText(
          client,
          meta.lastTextChannelId,
          text
        );
      }

      if (!sentText && !sentVoice) continue;

      await addAssistantMessage(userId, text);
      await touchProactive(userId);

      if (thread) {
        await markPrompted(userId, thread.id);
      }

      console.log(`💬 Proactive：${meta.displayName || userId} ← ${text}`);
    }
  } finally {
    running = false;
  }
}

function startProactiveEngine(options) {
  if (timer) return timer;

  const minutes = Math.max(
    1,
    numberEnv("PROACTIVE_CHECK_MINUTES", 10)
  );

  console.log(
    `⏰ Proactive Behavior 啟動：每 ${minutes} 分鐘檢查`
  );

  setTimeout(() => {
    tick(options).catch((error) => {
      console.error("⚠️ Proactive tick：", error?.message || error);
    });
  }, 30000);

  timer = setInterval(() => {
    tick(options).catch((error) => {
      console.error("⚠️ Proactive tick：", error?.message || error);
    });
  }, minutes * 60000);

  timer.unref?.();
  return timer;
}

function stopProactiveEngine() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  startProactiveEngine,
  stopProactiveEngine,
  tick,
};
