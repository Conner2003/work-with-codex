const {
  readUserFile,
  writeUserFile,
  withUserLock,
} = require("./store");

const { id, nowIso } = require("./util");
const { responseText } = require("./openai");

function defaultSession() {
  return {
    version: 2,
    summary: "",
    summaryUpdatedAt: null,
    messages: [],
  };
}

function getSession(userId) {
  return readUserFile(userId, "session.json", defaultSession());
}

async function addTurn(userId, userText, assistantText) {
  return withUserLock(userId, async () => {
    const session = getSession(userId);
    const now = nowIso();

    session.messages.push(
      {
        id: id("msg"),
        role: "user",
        text: String(userText || "").trim(),
        at: now,
      },
      {
        id: id("msg"),
        role: "assistant",
        text: String(assistantText || "").trim(),
        at: now,
      }
    );

    if (session.messages.length > 100) {
      session.messages = session.messages.slice(-80);
    }

    writeUserFile(userId, "session.json", session);
    return session;
  });
}

async function addAssistantMessage(userId, assistantText) {
  return withUserLock(userId, async () => {
    const session = getSession(userId);

    session.messages.push({
      id: id("msg"),
      role: "assistant",
      text: String(assistantText || "").trim(),
      at: nowIso(),
      proactive: true,
    });

    if (session.messages.length > 100) {
      session.messages = session.messages.slice(-80);
    }

    writeUserFile(userId, "session.json", session);
    return session;
  });
}

function modelMessages(userId, limit = 20) {
  const session = getSession(userId);

  return session.messages
    .slice(-limit)
    .map((m) => ({
      role: m.role,
      content: m.text,
    }));
}

function summaryPrompt(userId) {
  const session = getSession(userId);
  return session.summary || "";
}

function recentTranscript(userId, limit = 12) {
  const session = getSession(userId);

  return session.messages
    .slice(-limit)
    .map((m) => `${m.role === "user" ? "使用者" : "角色"}（${m.at}）：${m.text}`)
    .join("\n");
}

async function maybeCompact(userId) {
  const snapshot = getSession(userId);

  if (snapshot.messages.length < 48) return false;

  const selected = snapshot.messages.slice(0, 28);
  const selectedIds = new Set(selected.map((m) => m.id));

  const transcript = selected
    .map((m) => `${m.role === "user" ? "使用者" : "角色"}：${m.text}`)
    .join("\n");

  const oldSummary = snapshot.summary || "（尚無舊摘要）";

  let newSummary;

  try {
    newSummary = await responseText({
      model: process.env.MEMORY_MODEL || "gpt-5.6-luna",
      reasoning: "low",
      max_output_tokens: 900,
      instructions: [
        "你是對話工作記憶摘要器。",
        "把舊摘要與新的對話片段合併成一份精簡但可延續對話的摘要。",
        "保留：最近事件、尚未解決的事情、角色與使用者立場、承諾、重要情緒轉折、下一輪需要知道的脈絡。",
        "不要杜撰。不要把普通寒暄寫成長期人格。",
        "使用繁體中文。只輸出摘要正文。",
      ].join("\n"),
      input: `舊摘要：\n${oldSummary}\n\n新增片段：\n${transcript}`,
    });
  } catch (error) {
    console.error("⚠️ Session 摘要失敗：", error?.message || error);
    return false;
  }

  if (!newSummary) return false;

  return withUserLock(userId, async () => {
    const session = getSession(userId);

    session.messages = session.messages.filter((m) => !selectedIds.has(m.id));
    session.summary = newSummary;
    session.summaryUpdatedAt = nowIso();

    writeUserFile(userId, "session.json", session);
    return true;
  });
}

module.exports = {
  defaultSession,
  getSession,
  addTurn,
  addAssistantMessage,
  modelMessages,
  summaryPrompt,
  recentTranscript,
  maybeCompact,
};
