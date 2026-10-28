const {
  readUserFile,
  writeUserFile,
  withUserLock,
} = require("./store");

const {
  id,
  nowIso,
  clamp,
  normalizeText,
} = require("./util");

function defaultThreads() {
  return {
    version: 2,
    threads: [],
  };
}

function getThreads(userId) {
  return readUserFile(userId, "threads.json", defaultThreads());
}

function openThreads(userId, limit = 12) {
  return getThreads(userId)
    .threads
    .filter((t) => t.status === "open")
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, limit);
}

function normalizeDueAt(candidate, now = new Date()) {
  if (candidate.due_at || candidate.dueAt) {
    const raw = candidate.due_at || candidate.dueAt;
    const date = new Date(raw);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const hours = Number(candidate.follow_up_after_hours ?? candidate.followUpAfterHours);

  if (Number.isFinite(hours) && hours >= 0) {
    return new Date(now.getTime() + hours * 3600000).toISOString();
  }

  return null;
}

async function updateThreads(userId, add = [], resolveIds = []) {
  return withUserLock(userId, async () => {
    const data = getThreads(userId);
    const now = new Date();
    const resolveSet = new Set((resolveIds || []).map(String));

    for (const thread of data.threads) {
      if (resolveSet.has(thread.id)) {
        thread.status = "resolved";
        thread.resolvedAt = now.toISOString();
      }
    }

    for (const candidate of Array.isArray(add) ? add : []) {
      const topic = String(candidate.topic || "").trim();
      if (!topic) continue;

      const normalized = normalizeText(topic);

      let existing = data.threads.find(
        (t) =>
          t.status === "open" &&
          normalizeText(t.topic) === normalized
      );

      if (existing) {
        existing.priority = Math.max(
          existing.priority || 1,
          Math.round(clamp(candidate.priority ?? 5, 1, 10))
        );

        const due = normalizeDueAt(candidate, now);
        if (due) existing.dueAt = due;

        existing.updatedAt = now.toISOString();
        continue;
      }

      data.threads.push({
        id: id("thread"),
        topic,
        reason: String(candidate.reason || "").trim().slice(0, 500),
        priority: Math.round(clamp(candidate.priority ?? 5, 1, 10)),
        dueAt: normalizeDueAt(candidate, now),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        status: "open",
        lastPromptedAt: null,
        promptCount: 0,
      });
    }

    if (data.threads.length > 100) {
      const open = data.threads.filter((t) => t.status === "open");
      const closed = data.threads
        .filter((t) => t.status !== "open")
        .slice(-50);

      data.threads = [...closed, ...open].slice(-100);
    }

    writeUserFile(userId, "threads.json", data);
    return data;
  });
}

function dueThread(userId, now = new Date()) {
  const threads = openThreads(userId, 50);

  const eligible = threads
    .filter((t) => {
      if (!t.dueAt) return false;

      const due = new Date(t.dueAt);
      if (Number.isNaN(due.getTime()) || due > now) return false;

      if (t.lastPromptedAt) {
        const last = new Date(t.lastPromptedAt);
        const hours = (now - last) / 3600000;

        if (hours < 24) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if ((b.priority || 0) !== (a.priority || 0)) {
        return (b.priority || 0) - (a.priority || 0);
      }
      return new Date(a.dueAt) - new Date(b.dueAt);
    });

  return eligible[0] || null;
}

async function markPrompted(userId, threadId) {
  return withUserLock(userId, async () => {
    const data = getThreads(userId);
    const thread = data.threads.find((t) => t.id === threadId);

    if (thread) {
      thread.lastPromptedAt = nowIso();
      thread.promptCount = (thread.promptCount || 0) + 1;
      thread.updatedAt = nowIso();
      writeUserFile(userId, "threads.json", data);
    }

    return thread || null;
  });
}

function formatThreads(threads) {
  if (!threads?.length) return "（沒有未完成話題）";

  return threads
    .map(
      (t) =>
        `- ${t.id}: ${t.topic}` +
        (t.dueAt ? `｜可追問時間 ${t.dueAt}` : "")
    )
    .join("\n");
}

module.exports = {
  defaultThreads,
  getThreads,
  openThreads,
  updateThreads,
  dueThread,
  markPrompted,
  formatThreads,
};
