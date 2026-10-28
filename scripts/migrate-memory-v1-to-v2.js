require("dotenv").config();

const {
  migrateLegacy,
} = require("../memory2/migrate");

async function main() {
  const userId =
    process.argv
      .slice(2)
      .find((x) => !x.startsWith("--")) ||
    process.env.OWNER_USER_ID;

  const force =
    process.argv.includes("--force");

  if (!userId) {
    console.log("");
    console.log("缺少 Discord User ID。");
    console.log("");
    console.log("方式 A：");
    console.log("  在 .env 設 OWNER_USER_ID=你的DiscordUserID");
    console.log("");
    console.log("方式 B：");
    console.log("  node scripts/migrate-memory-v1-to-v2.js 你的DiscordUserID");
    console.log("");
    process.exitCode = 1;
    return;
  }

  console.log(
    `🧠 Memory 1.x → 2.0 遷移：${userId}`
  );

  const result =
    await migrateLegacy(
      userId,
      { force }
    );

  if (result.skipped) {
    console.log(
      `⚠️ ${result.reason}`
    );
    return;
  }

  console.log("");
  console.log(
    `✅ 遷移完成：${result.imported} 筆`
  );
  console.log("");
  console.log(
    "舊版 memory/ 不會被刪除，Memory 2.0 也保留相容讀取。"
  );
}

main().catch(
  (error) => {
    console.error(
      "❌ 遷移失敗：",
      error?.message || error
    );
    process.exitCode = 1;
  }
);
