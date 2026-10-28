const {
  readUserFile,
  writeUserFile,
  withUserLock,
} = require("./store");

const { nowIso } = require("./util");

function defaultMeta() {
  return {
    version: 2,
    displayName: null,
    lastGuildId: null,
    lastTextChannelId: null,
    lastUserInteractionAt: null,
    lastAnyInteractionAt: null,
    lastProactiveAt: null,
    proactiveDateKey: null,
    proactiveCountToday: 0,
    legacyMigratedAt: null,
  };
}

function getMeta(userId) {
  return readUserFile(userId, "meta.json", defaultMeta());
}

async function rememberLocation(userId, patch = {}) {
  return withUserLock(userId, async () => {
    const meta = getMeta(userId);

    if (patch.displayName) meta.displayName = String(patch.displayName);
    if (patch.guildId) meta.lastGuildId = String(patch.guildId);
    if (patch.channelId) meta.lastTextChannelId = String(patch.channelId);

    writeUserFile(userId, "meta.json", meta);
    return meta;
  });
}

async function touchUserInteraction(userId, patch = {}) {
  return withUserLock(userId, async () => {
    const meta = getMeta(userId);
    const now = nowIso();

    if (patch.displayName) meta.displayName = String(patch.displayName);
    if (patch.guildId) meta.lastGuildId = String(patch.guildId);
    if (patch.channelId) meta.lastTextChannelId = String(patch.channelId);

    meta.lastUserInteractionAt = now;
    meta.lastAnyInteractionAt = now;

    writeUserFile(userId, "meta.json", meta);
    return meta;
  });
}

function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.CHARACTER_TIMEZONE || "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function touchProactive(userId) {
  return withUserLock(userId, async () => {
    const meta = getMeta(userId);
    const now = nowIso();
    const dateKey = localDateKey();

    if (meta.proactiveDateKey !== dateKey) {
      meta.proactiveDateKey = dateKey;
      meta.proactiveCountToday = 0;
    }

    meta.proactiveCountToday += 1;
    meta.lastProactiveAt = now;
    meta.lastAnyInteractionAt = now;

    writeUserFile(userId, "meta.json", meta);
    return meta;
  });
}

async function markLegacyMigrated(userId) {
  return withUserLock(userId, async () => {
    const meta = getMeta(userId);
    meta.legacyMigratedAt = nowIso();
    writeUserFile(userId, "meta.json", meta);
    return meta;
  });
}

module.exports = {
  defaultMeta,
  getMeta,
  rememberLocation,
  touchUserInteraction,
  touchProactive,
  localDateKey,
  markLegacyMigrated,
};
