const { hoursBetween } = require("./util");

function getTimezone() {
  return process.env.CHARACTER_TIMEZONE || "Asia/Taipei";
}

function zonedParts(date = new Date(), timeZone = getTimezone()) {
  const formatter = new Intl.DateTimeFormat("zh-TW", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = {};
  for (const item of formatter.formatToParts(date)) {
    if (item.type !== "literal") parts[item.type] = item.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    formatted: `${parts.year}/${parts.month}/${parts.day} ${parts.weekday} ${parts.hour}:${parts.minute}`,
  };
}

function partOfDay(hour) {
  if (hour < 5) return "深夜";
  if (hour < 8) return "清晨";
  if (hour < 12) return "早上";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  if (hour < 22) return "晚上";
  return "深夜";
}

function humanDuration(hours) {
  if (hours === null || hours === undefined) return "未知";
  if (hours < 1 / 60) return "不到 1 分鐘";
  if (hours < 1) return `約 ${Math.max(1, Math.round(hours * 60))} 分鐘`;
  if (hours < 24) return `約 ${Math.round(hours)} 小時`;

  const days = hours / 24;
  if (days < 14) return `約 ${Math.round(days)} 天`;

  const weeks = days / 7;
  if (weeks < 8) return `約 ${Math.round(weeks)} 週`;

  const months = days / 30.44;
  if (months < 18) return `約 ${Math.round(months)} 個月`;

  return `約 ${(days / 365.25).toFixed(1)} 年`;
}

function buildTimeContext(meta = {}) {
  const now = new Date();
  const parts = zonedParts(now);
  const sinceUser = meta.lastUserInteractionAt
    ? hoursBetween(meta.lastUserInteractionAt, now)
    : null;

  return {
    timezone: getTimezone(),
    nowIso: now.toISOString(),
    local: parts.formatted,
    hour: parts.hour,
    weekday: parts.weekday,
    partOfDay: partOfDay(parts.hour),
    sinceLastUserHours: sinceUser,
    sinceLastUserHuman: humanDuration(sinceUser),
    lastUserInteractionAt: meta.lastUserInteractionAt || null,
  };
}

module.exports = {
  getTimezone,
  zonedParts,
  partOfDay,
  humanDuration,
  buildTimeContext,
};
