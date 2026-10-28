const { getMeta } = require("./meta");
const { getState, statePrompt } = require("./state");
const { buildTimeContext } = require("./time");
const {
  retrieveMemories,
  formatMemories,
} = require("./memories");
const {
  summaryPrompt,
} = require("./session");
const {
  openThreads,
  formatThreads,
} = require("./threads");
const { legacyContext } = require("./legacy");

async function buildContext(userId, query) {
  const meta = getMeta(userId);

  const [
    state,
    memories,
    legacy,
  ] = await Promise.all([
    getState(userId),
    retrieveMemories(userId, query, Number(process.env.MEMORY_RETRIEVAL_TOP_K || 10)),
    legacyContext(userId),
  ]);

  const time = buildTimeContext(meta);
  const summary = summaryPrompt(userId);
  const threads = openThreads(userId, 10);

  const text = [
    "================ Memory System 2.0 ================",

    "【現在時間】",
    `時區：${time.timezone}`,
    `角色當地時間：${time.local}（${time.partOfDay}）`,
    `距離使用者上次互動：${time.sinceLastUserHuman}`,
    time.lastUserInteractionAt
      ? `上次互動時間戳：${time.lastUserInteractionAt}`
      : "上次互動時間戳：尚無",

    "",
    statePrompt(state),

    "",
    "【Persistent Working Memory｜跨重啟短期摘要】",
    summary || "（尚無摘要）",

    "",
    "【這次查詢最相關的長期記憶】",
    formatMemories(memories),

    "",
    "【未完成／之後可以追問的事情】",
    formatThreads(threads),

    legacy
      ? [
          "",
          "【舊版 Memory 1.x 相容層】",
          "以下只是舊資料相容來源；如果和 Memory 2.0 的較新 active 記憶衝突，以較新的 Memory 2.0 為準。",
          legacy,
        ].join("\n")
      : "",

    "===================================================",
  ]
    .filter((x) => x !== "")
    .join("\n");

  return {
    text,
    meta,
    state,
    memories,
    time,
    summary,
    threads,
  };
}

module.exports = {
  buildContext,
};
