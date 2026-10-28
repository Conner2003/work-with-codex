const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MEMORY_DIR = __dirname;


// ===============================
// 基本檔案工具
// ===============================

function readJson(filename, fallback = {}) {
  const filePath = path.join(MEMORY_DIR, filename);

  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );
  } catch {
    return fallback;
  }
}


function atomicWriteJson(filename, data) {
  const filePath = path.join(MEMORY_DIR, filename);
  const tempPath = `${filePath}.tmp`;

  fs.writeFileSync(
    tempPath,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  fs.renameSync(tempPath, filePath);
}


function createId() {
  return crypto.randomUUID();
}


function nowIso() {
  return new Date().toISOString();
}


// ===============================
// 防止重複記憶
// ===============================

function normalizeText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


function alreadyExists(array, content) {
  const target = normalizeText(content);

  return array.some(item =>
    normalizeText(item.content) === target
  );
}


// ===============================
// 寫入不同記憶區
// ===============================

function saveCharacterMemory(memory) {
  const data = readJson(
    "profile.json",
    {
      schema_version: "1.0",
      original_character_settings: [],
      interaction_formed_settings: []
    }
  );

  data.interaction_formed_settings ||= [];

  if (
    alreadyExists(
      data.interaction_formed_settings,
      memory.content
    )
  ) {
    return false;
  }

  data.interaction_formed_settings.push(memory);

  atomicWriteJson("profile.json", data);

  return true;
}


function saveUserMemory(memory) {
  const data = readJson(
    "user_memory.json",
    {
      schema_version: "1.0",
      known_facts: []
    }
  );

  data.known_facts ||= [];

  if (
    alreadyExists(
      data.known_facts,
      memory.content
    )
  ) {
    return false;
  }

  data.known_facts.push(memory);

  atomicWriteJson("user_memory.json", data);

  return true;
}


function saveTimelineMemory(memory) {
  const data = readJson(
    "timeline.json",
    {
      schema_version: "1.0",
      events: []
    }
  );

  data.events ||= [];

  if (
    alreadyExists(
      data.events,
      memory.content
    )
  ) {
    return false;
  }

  data.events.push(memory);

  atomicWriteJson("timeline.json", data);

  return true;
}


function saveRelationshipMemory(memory) {
  const data = readJson(
    "relationship.json",
    {
      schema_version: "1.0",
      current_status: [],
      observations: []
    }
  );

  // 不直接讓 AI 覆蓋 current_status
  // 新的關係變化先寫 observations
  data.observations ||= [];

  if (
    alreadyExists(
      data.observations,
      memory.content
    )
  ) {
    return false;
  }

  data.observations.push(memory);

  atomicWriteJson("relationship.json", data);

  return true;
}


function saveNpcMemory(memory) {
  const data = readJson(
    "npcs.json",
    {
      schema_version: "1.0",
      established: [],
      notes: []
    }
  );

  data.established ||= [];

  if (
    alreadyExists(
      data.established,
      memory.content
    )
  ) {
    return false;
  }

  data.established.push(memory);

  atomicWriteJson("npcs.json", data);

  return true;
}


function saveUnresolvedMemory(memory) {
  const data = readJson(
    "unresolved_threads.json",
    {
      schema_version: "1.0",
      threads: [],
      uncertain_or_unknown: []
    }
  );

  data.threads ||= [];

  if (
    alreadyExists(
      data.threads,
      memory.content
    )
  ) {
    return false;
  }

  data.threads.push(memory);

  atomicWriteJson(
    "unresolved_threads.json",
    data
  );

  return true;
}


// ===============================
// 總記憶索引
// ===============================

function addToMemoryIndex(memory) {
  const data = readJson(
    "memory_index.json",
    {
      schema_version: "1.0",
      memories: []
    }
  );

  data.memories ||= [];

  if (
    alreadyExists(
      data.memories,
      memory.content
    )
  ) {
    return;
  }

  data.memories.push(memory);

  atomicWriteJson(
    "memory_index.json",
    data
  );
}


// ===============================
// 真正的 Memory Writer
// ===============================

async function processMemory({
  userId,
  username,
  userText,
  assistantText
}) {

  const prompt = `
你是「長期記憶判斷器」。

你的工作不是聊天，而是判斷下面這一輪對話中，
是否出現值得永久保存的新資訊。

【使用者】
Discord 名稱：${username}

使用者說：
${userText}

【角色回答】
${assistantText}


請非常保守。

不要因為一句普通閒聊就建立記憶。

值得保存的例子：

- 使用者穩定的個人資料
- 使用者明確喜好或厭惡
- 使用者的重要人生經歷
- 角色第一次確立自己的名字、年齡、工作、生日等
- 角色明確形成的新喜好
- 新的重要 NPC
- 第一次約會、告白、重大爭吵、和好等共同事件
- 明確且持續的關係變化
- 尚未解決的重要話題

通常不要保存：

- 今天吃什麼
- 普通寒暄
- 一次性的心情
- 無關緊要的小事
- 單純玩笑
- 推測
- AI 自己臨時補造的設定


【非常重要】

只能保存這一輪對話真正支持的內容。

不要因為角色回答中出現某件事，
就自動認定它是真的角色歷史。

如果角色只是隨口生成一個過去，
而之前沒有根據，
confidence 必須降低，甚至不要保存。

如果不確定，就不要記。


category 只能是：

character
user
npc
timeline
relationship
unresolved
none


importance：
1 到 10

confidence：
high
medium
low


只有真正值得長期保存的資訊，
importance 才應 >= 6。


輸出有效 JSON，格式只能是：

{
  "memories": [
    {
      "category": "user",
      "type": "preference",
      "content": "完整且獨立可理解的記憶句子",
      "importance": 7,
      "confidence": "high"
    }
  ]
}

如果沒有值得保存的內容：

{
  "memories": []
}
`;


  const response =
    await openai.responses.create({
      model:
        process.env.MEMORY_MODEL ||
        process.env.BRAIN_MODEL ||
        "gpt-5.6-terra",

      reasoning: {
        effort: "low"
      },

      input: prompt,

      max_output_tokens: 500
    });


  let raw =
    response.output_text?.trim();

  if (!raw) return [];


  // 防止模型包 markdown ```json
  raw = raw
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();


  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(
      "⚠️ 記憶判斷 JSON 解析失敗"
    );

    console.error(raw);

    return [];
  }


  const candidates =
    Array.isArray(parsed.memories)
      ? parsed.memories
      : [];


  const saved = [];


  for (const candidate of candidates) {

    if (!candidate?.content) continue;

    if (
      typeof candidate.importance !== "number"
    ) {
      continue;
    }

    // 第一版門檻設高一點
    if (candidate.importance < 6) {
      continue;
    }

    if (
      !["high", "medium"].includes(
        candidate.confidence
      )
    ) {
      continue;
    }

    if (
      ![
        "character",
        "user",
        "npc",
        "timeline",
        "relationship",
        "unresolved"
      ].includes(candidate.category)
    ) {
      continue;
    }


    const memory = {
      id: createId(),

      type:
        candidate.type ||
        candidate.category,

      content:
        candidate.content.trim(),

      importance:
        Math.min(
          10,
          Math.max(
            1,
            candidate.importance
          )
        ),

      confidence:
        candidate.confidence,

      source:
        "discord_conversation",

      user_id:
        userId,

      created_at:
        nowIso()
    };


    let written = false;


    switch (candidate.category) {

      case "character":
        written =
          saveCharacterMemory(memory);
        break;

      case "user":
        written =
          saveUserMemory(memory);
        break;

      case "npc":
        written =
          saveNpcMemory(memory);
        break;

      case "timeline":
        written =
          saveTimelineMemory(memory);
        break;

      case "relationship":
        written =
          saveRelationshipMemory(memory);
        break;

      case "unresolved":
        written =
          saveUnresolvedMemory(memory);
        break;
    }


    if (written) {
      addToMemoryIndex(memory);

      saved.push({
        category:
          candidate.category,

        ...memory
      });
    }
  }


  if (saved.length > 0) {

    console.log(
      `🧠 長期記憶新增 ${saved.length} 筆`
    );

    for (const memory of saved) {
      console.log(
        `   💾 [${memory.category}] ${memory.content}`
      );
    }

  } else {

    console.log(
      "🫧 本輪沒有需要永久保存的記憶"
    );
  }


  return saved;
}


module.exports = {
  processMemory
};