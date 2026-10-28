const fs = require("fs");
const path = require("path");

const MEMORY_DIR = __dirname;

function readJson(filename, fallback = {}) {
  const filePath = path.join(MEMORY_DIR, filename);

  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );
  } catch (error) {
    console.error(
      `⚠️ 無法讀取 ${filename}:`,
      error.message
    );

    return fallback;
  }
}

function loadCoreMemory() {
  return {
    profile: readJson("profile.json"),
    relationship: readJson("relationship.json"),
    user_memory: readJson("user_memory.json"),
    npcs: readJson("npcs.json"),
    recent_context: readJson("recent_context.json"),
    unresolved_threads: readJson(
      "unresolved_threads.json"
    )
  };
}

function loadTimeline() {
  return readJson(
    "timeline.json",
    { events: [] }
  );
}

function loadMemoryIndex() {
  return readJson(
    "memory_index.json",
    { memories: [] }
  );
}

function getImportantMemories(minImportance = 8) {
  const data = loadMemoryIndex();

  return (data.memories || [])
    .filter(memory => {
      return (
        typeof memory.importance === "number" &&
        memory.importance >= minImportance
      );
    })
    .sort(
      (a, b) =>
        (b.importance || 0) -
        (a.importance || 0)
    );
}

function getImportantTimeline(minImportance = 8) {
  const data = loadTimeline();

  return (data.events || [])
    .filter(event => {
      return (
        typeof event.importance === "number" &&
        event.importance >= minImportance
      );
    });
}

function buildMemoryContext() {
  const core = loadCoreMemory();

  const importantMemories =
    getImportantMemories(8);

  const importantTimeline =
    getImportantTimeline(8);

  return {
    ...core,

    important_memories:
      importantMemories,

    important_timeline:
      importantTimeline
  };
}

module.exports = {
  loadCoreMemory,
  loadTimeline,
  loadMemoryIndex,
  getImportantMemories,
  getImportantTimeline,
  buildMemoryContext
};