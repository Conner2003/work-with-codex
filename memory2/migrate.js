const { responseText } = require("./openai");
const { extractJson, chunkText } = require("./util");
const { addMemoryCandidates } = require("./memories");
const { rawLegacyContext } = require("./legacy");
const { getMeta, markLegacyMigrated } = require("./meta");

async function extractLegacyChunk(chunk) {
  const output = await responseText({
    model: process.env.MEMORY_MODEL || "gpt-5.6-luna",
    reasoning: "low",
    max_output_tokens: 1600,

    instructions: `
你正在把舊版角色記憶遷移到 Memory System 2.0。
只輸出合法 JSON：
{
  "memories": [
    {
      "text": "...",
      "category": "character|user|relationship|timeline|npc|preference|project|other",
      "slot": "單值可更新事實的穩定 slot；事件則 null",
      "value": "slot 的值或 null",
      "importance": 1-10,
      "confidence": 0-1,
      "allow_multiple": false,
      "tags": ["legacy"]
    }
  ]
}

規則：
- 嚴格依據輸入文字，不得杜撰。
- 同一件事不要拆成大量瑣碎重複記憶。
- 人名、學校、共同經歷、角色設定、重要偏好、關係事件優先。
- 短暫寒暄不要保存。
- timeline 事件通常 allow_multiple=true 且 slot=null。
- 只保留 importance >= 6 的內容。
`.trim(),

    input: chunk,
  });

  const parsed = extractJson(output);
  return parsed?.memories || [];
}

async function migrateLegacy(userId, { force = false } = {}) {
  const meta = getMeta(userId);

  if (meta.legacyMigratedAt && !force) {
    return {
      skipped: true,
      reason: `已於 ${meta.legacyMigratedAt} 遷移過。要重跑請加 --force`,
      imported: 0,
    };
  }

  const legacy = await rawLegacyContext(userId);

  if (!legacy) {
    return {
      skipped: true,
      reason: "找不到 memory/manager.js 可提供的舊版記憶內容。",
      imported: 0,
    };
  }

  const chunks = chunkText(legacy, 5000);
  let imported = 0;

  for (let i = 0; i < chunks.length; i++) {
    console.log(`🧠 遷移舊記憶 ${i + 1}/${chunks.length}...`);

    const memories = await extractLegacyChunk(chunks[i]);
    const added = await addMemoryCandidates(userId, memories, "legacy");
    imported += added.length;
  }

  await markLegacyMigrated(userId);

  return {
    skipped: false,
    imported,
  };
}

module.exports = {
  migrateLegacy,
};
