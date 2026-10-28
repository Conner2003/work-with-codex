const { responseText } = require("./openai");
const { extractJson } = require("./util");
const { addMemoryCandidates } = require("./memories");
const { applyDeltas } = require("./state");
const { openThreads, updateThreads } = require("./threads");
const { maybeCompact } = require("./session");
const { buildTimeContext } = require("./time");
const { getMeta } = require("./meta");

const queues = new Map();

function enqueue(userId, task) {
  const key = String(userId);
  const previous = queues.get(key) || Promise.resolve();

  const next = previous
    .catch(() => {})
    .then(task);

  queues.set(key, next);

  next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });

  return next;
}

async function analyzeTurn({
  userId,
  username,
  userText,
  assistantText,
}) {
  const currentThreads = openThreads(userId, 12);
  const time = buildTimeContext(getMeta(userId));

  const jsonText = await responseText({
    model: process.env.MEMORY_MODEL || "gpt-5.6-luna",
    reasoning: "low",
    max_output_tokens: 1400,

    instructions: `
你是 Virtual Girlfriend Bot 的「背景狀態與記憶分析器」。
你不負責跟使用者聊天，只負責把一輪對話轉成結構化狀態。

只輸出合法 JSON，不要 markdown，不要解釋。

JSON 格式：
{
  "memories": [
    {
      "text": "一條完整、可獨立理解的記憶",
      "category": "character|user|relationship|timeline|npc|preference|project|other",
      "slot": "可更新的事實欄位，沒有則 null",
      "value": "slot 的目前值，沒有則 null",
      "importance": 1-10,
      "confidence": 0-1,
      "allow_multiple": false,
      "tags": ["..."]
    }
  ],
  "emotion_delta": {
    "mood": 0,
    "fatigue": 0,
    "socialEnergy": 0,
    "stress": 0,
    "irritation": 0,
    "warmth": 0,
    "curiosity": 0
  },
  "relationship_delta": {
    "trust": 0,
    "liking": 0,
    "security": 0,
    "respect": 0,
    "romanticAttraction": 0,
    "sexualAttraction": 0,
    "intimacyWillingness": 0
  },
  "threads_add": [
    {
      "topic": "之後值得自然追問的事情",
      "reason": "為什麼",
      "priority": 1-10,
      "due_at": "ISO-8601 或 null",
      "follow_up_after_hours": 0
    }
  ],
  "threads_resolve": ["thread_id"]
}

記憶規則：
1. 只記真正可能在幾天、幾週、幾個月後仍有價值的內容。
2. 普通寒暄、隨手一句、暫時狀態通常不要寫長期記憶。
3. 使用者明確講出的自身事實可以記；不要自行診斷或腦補。
4. 角色自己明確自我揭露的穩定設定（例如名字、過去、偏好）可以成為 character memory。
5. assistant 的一般即興台詞不能隨便當作永久事實。
6. slot 用來處理會被更新的單值事實，例如：
   character.name
   user.school.highschool
   user.job.current
   user.preference.minecraft
   relationship.stage
   同一 slot 的新值日後會 supersede 舊值。
7. timeline/event 通常 slot=null 且 allow_multiple=true。
8. importance < 6 的東西通常不要列入 memories。

狀態規則：
1. emotion_delta 是短期變化，普通一輪多數在 -2 到 +2；重大事件才可更大。
2. relationship_delta 變化必須非常慢；普通互動通常 -1、0、+1。
3. 不要因為友善就直接增加 romanticAttraction / sexualAttraction。
4. 關係與浪漫／性吸引是獨立維度。

Proactive thread 規則：
1. 只有未來真的適合再次問的事情才建立。
2. 例如：明天有面試、下週要做某件事、今天發生的事情尚未有結果。
3. 不要為普通聊天每輪都建立 thread。
4. 若這輪已經回答了 existing thread，將其 id 放入 threads_resolve。
`.trim(),

    input: `
現在時間：
${time.local}
ISO：${time.nowIso}
時區：${time.timezone}

使用者：
${username || userId}

目前未完成 threads：
${JSON.stringify(currentThreads, null, 2)}

本輪：
USER:
${userText}

CHARACTER:
${assistantText}
`.trim(),
  });

  const parsed = extractJson(jsonText);

  if (!parsed) {
    throw new Error("Memory 2.0 Analyzer 沒有回傳合法 JSON");
  }

  await Promise.all([
    addMemoryCandidates(
      userId,
      parsed.memories || [],
      "conversation"
    ),

    applyDeltas(
      userId,
      parsed.emotion_delta || {},
      parsed.relationship_delta || {}
    ),

    updateThreads(
      userId,
      parsed.threads_add || [],
      parsed.threads_resolve || []
    ),
  ]);

  await maybeCompact(userId);
}

function schedulePostTurn(payload) {
  enqueue(payload.userId, async () => {
    try {
      await analyzeTurn(payload);
      console.log("🧠 Memory 2.0 背景更新完成");
    } catch (error) {
      console.error("⚠️ Memory 2.0 背景更新失敗：", error?.message || error);
    }
  });
}

module.exports = {
  analyzeTurn,
  schedulePostTurn,
};
