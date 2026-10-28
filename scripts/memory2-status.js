require("dotenv").config();

const { stats } = require("../memory2/memories");
const { getThreads } = require("../memory2/threads");
const { getSession } = require("../memory2/session");
const { getMeta } = require("../memory2/meta");
const { getState } = require("../memory2/state");

async function main() {
  const userId =
    process.argv
      .slice(2)
      .find((x) => !x.startsWith("--")) ||
    process.env.OWNER_USER_ID;

  if (!userId) {
    throw new Error(
      "請提供 Discord User ID，或在 .env 設 OWNER_USER_ID"
    );
  }

  const memory = stats(userId);
  const threads = getThreads(userId);
  const session = getSession(userId);
  const meta = getMeta(userId);

  console.log("");
  console.log("===== Memory System 2.0 =====");
  console.log(`User：${userId}`);
  console.log(`Long-term total：${memory.total}`);
  console.log(`Active：${memory.active}`);
  console.log(`Superseded：${memory.superseded}`);
  console.log(`Categories：${JSON.stringify(memory.categories)}`);
  console.log(`Open threads：${threads.threads.filter((t) => t.status === "open").length}`);
  console.log(`Recent messages：${session.messages.length}`);
  console.log(`Working summary：${session.summary ? "YES" : "NO"}`);
  console.log(`Last interaction：${meta.lastUserInteractionAt || "none"}`);
  console.log(`Last proactive：${meta.lastProactiveAt || "none"}`);
  console.log(`Legacy migrated：${meta.legacyMigratedAt || "NO"}`);

  if (process.argv.includes("--state")) {
    const state = await getState(userId);

    console.log("");
    console.log("----- Hidden State DEBUG -----");
    console.log(JSON.stringify(state, null, 2));
  }

  console.log("=============================");
}

main().catch(
  (error) => {
    console.error(
      "❌",
      error?.message || error
    );
    process.exitCode = 1;
  }
);
