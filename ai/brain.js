const fs = require("fs");
const path = require("path");

const {
  responseText,
} = require("../memory2/openai");

const {
  buildContext,
} = require("../memory2/context");

const {
  modelMessages,
  addTurn,
} = require("../memory2/session");

const {
  touchUserInteraction,
} = require("../memory2/meta");

const {
  schedulePostTurn,
} = require("../memory2/postTurn");

const characterPath =
  path.join(
    __dirname,
    "..",
    "personality",
    "character.md"
  );

function loadCharacter() {
  try {
    return fs.readFileSync(
      characterPath,
      "utf8"
    );
  } catch {
    return [
      "你是一名具有獨立人格的原創女性角色。",
      "你不是客服，也不是無條件迎合使用者的 AI。",
      "使用自然台灣繁體中文。",
    ].join("\n");
  }
}

function cleanReply(text) {
  return String(text || "")
    .trim()
    .replace(/^["「]|["」]$/g, "")
    .trim();
}

function brainInstructions({
  character,
  context,
  username,
}) {
  return `
你正在扮演一個「持續存在」的原創角色，而不是客服、心理師或一般 AI Assistant。

================ 角色核心 ================
${character}
==========================================

使用者顯示名稱：
${username || "使用者"}

${context}

【回答規則】
1. 使用自然台灣繁體中文與口語。
2. Discord 語音優先：通常 1～3 句，除非內容真的需要更長。
3. 不要每句都服務式回覆，不要動不動「有什麼我可以幫你的」。
4. 可以有自己的觀點、猶豫、吐槽、不同意、懶散與情緒。
5. Memory 是背景證據，不要說「我的資料庫顯示」「我從記憶檔看到」。
6. 如果舊記憶和新的 active 記憶衝突，以較新的 active 記憶為準。
7. 不要把隱藏情緒／關係狀態的數字講出來。
8. 時間資訊是真實背景：可以自然注意到凌晨、隔了幾天、某件事昨天或明天等。
9. 關係要自然發展；好感、信任、浪漫吸引、性吸引不是同一件事，不強迫戀愛。
10. 不要為了顯得像真人而杜撰未發生的共同經歷。
11. 如果你確實不記得某個細節，可以自然說不確定，不要硬掰。
12. 不要在每次回答裡主動解釋你是怎麼運作的。
`.trim();
}

async function think({
  userId,
  username,
  text,
  guildId = null,
  channelId = null,
}) {
  const userText = String(text || "").trim();

  if (!userText) return "嗯？";

  const character = loadCharacter();
  const contextData = await buildContext(userId, userText);

  const priorMessages =
    modelMessages(
      userId,
      Number(process.env.BRAIN_RECENT_MESSAGES || 18)
    );

  const input = [
    ...priorMessages,
    {
      role: "user",
      content: userText,
    },
  ];

  let reply = await responseText({
    model:
      process.env.BRAIN_MODEL ||
      "gpt-5.6-terra",

    reasoning:
      process.env.BRAIN_REASONING ||
      "low",

    max_output_tokens:
      Number(
        process.env.BRAIN_MAX_OUTPUT_TOKENS ||
        320
      ),

    instructions:
      brainInstructions({
        character,
        context: contextData.text,
        username,
      }),

    input,
  });

  reply = cleanReply(reply);

  if (!reply) {
    reply = "嗯？你再講一次。";
  }

  await addTurn(
    userId,
    userText,
    reply
  );

  await touchUserInteraction(
    userId,
    {
      displayName: username,
      guildId,
      channelId,
    }
  );

  schedulePostTurn({
    userId,
    username,
    userText,
    assistantText: reply,
  });

  return reply;
}

async function generateProactive({
  userId,
  reason,
}) {
  const character = loadCharacter();
  const contextData = await buildContext(
    userId,
    reason || "主動訊息"
  );

  const priorMessages =
    modelMessages(userId, 12);

  let reply = await responseText({
    model:
      process.env.BRAIN_MODEL ||
      "gpt-5.6-terra",

    reasoning:
      process.env.BRAIN_REASONING ||
      "low",

    max_output_tokens: 180,

    instructions:
      brainInstructions({
        character,
        context: contextData.text,
        username:
          contextData.meta.displayName ||
          "使用者",
      }) +
      `

【這是一則主動訊息】
你現在不是在回答新問題，而是角色自己決定先開口。
只能傳 1～2 句。
不要寫成客服關懷通知。
不要說「系統提醒我」。
如果 reason 是之前的未完成事件，就自然接續，不要像行事曆通知。
如果沒有具體事件，可以丟一句符合她個性的話，但不要過度黏人。`,

    input: [
      ...priorMessages,
      {
        role: "user",
        content:
          `[內部觸發原因，不可照字面轉述]\n${reason || "適合自然主動說一句話"}`,
      },
    ],
  });

  reply = cleanReply(reply);

  if (!reply) return "";

  return reply;
}

module.exports = {
  think,
  generateProactive,
};
