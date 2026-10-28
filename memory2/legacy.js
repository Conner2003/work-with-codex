const fs = require("fs");
const path = require("path");

const LEGACY_FILES = [
  "profile.json",
  "relationship.json",
  "user_memory.json",
  "npcs.json",
  "timeline.json",
  "memory_index.json",
  "unresolved_threads.json",
  "recent_context.json",
];

async function managerContext(userId) {
  try {
    const legacy = require("../memory/manager");

    if (typeof legacy.buildMemoryContext !== "function") {
      return "";
    }

    try {
      return String(
        (await Promise.resolve(legacy.buildMemoryContext(userId))) || ""
      );
    } catch {
      return String(
        (await Promise.resolve(legacy.buildMemoryContext())) || ""
      );
    }
  } catch {
    return "";
  }
}

async function rawLegacyContext(userId) {
  const memoryDir = path.join(__dirname, "..", "memory");
  const blocks = [];

  for (const name of LEGACY_FILES) {
    const file = path.join(memoryDir, name);

    try {
      if (!fs.existsSync(file)) continue;

      const text = fs.readFileSync(file, "utf8").trim();
      if (!text) continue;

      blocks.push(`===== ${name} =====\n${text}`);
    } catch {}
  }

  // 如果 JSON 檔不存在或很少，仍保留 manager 的整理結果。
  const manager = await managerContext(userId);

  if (manager) {
    blocks.push(`===== manager_context =====\n${manager}`);
  }

  return blocks.join("\n\n");
}

async function legacyContext(userId) {
  if (
    String(process.env.MEMORY2_LEGACY_CONTEXT || "true").toLowerCase() === "false"
  ) {
    return "";
  }

  const raw = await managerContext(userId);

  if (raw) {
    return raw.slice(0, 7000);
  }

  return (await rawLegacyContext(userId)).slice(0, 7000);
}

module.exports = {
  legacyContext,
  rawLegacyContext,
};
