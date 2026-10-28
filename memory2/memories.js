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

const {
  embedTexts,
  packEmbedding,
  cosinePacked,
} = require("./embeddings");

function defaultBank() {
  return {
    version: 2,
    memories: [],
  };
}

function getBank(userId) {
  return readUserFile(userId, "bank.json", defaultBank());
}

function textFeatures(text) {
  const normalized = normalizeText(text);
  const set = new Set();

  const words = String(text || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9_-]{1,}|[\u4e00-\u9fff]{2,}/g) || [];

  for (const word of words) set.add(word);

  for (let i = 0; i < normalized.length - 1; i++) {
    set.add(normalized.slice(i, i + 2));
  }

  return set;
}

function lexicalSimilarity(a, b) {
  const A = textFeatures(a);
  const B = textFeatures(b);

  if (!A.size || !B.size) return 0;

  let intersect = 0;
  for (const x of A) {
    if (B.has(x)) intersect++;
  }

  const union = A.size + B.size - intersect;
  return union ? intersect / union : 0;
}

function sanitizeCandidate(candidate = {}, source = "conversation") {
  const text = String(candidate.text || "").trim();
  if (!text) return null;

  const allowedCategories = new Set([
    "character",
    "user",
    "relationship",
    "timeline",
    "npc",
    "preference",
    "project",
    "other",
  ]);

  const category = allowedCategories.has(candidate.category)
    ? candidate.category
    : "other";

  return {
    text,
    category,
    slot: candidate.slot ? String(candidate.slot).trim().slice(0, 160) : null,
    value: candidate.value === undefined || candidate.value === null
      ? null
      : String(candidate.value).trim().slice(0, 500),
    importance: Math.round(clamp(candidate.importance ?? 6, 1, 10)),
    confidence: clamp(candidate.confidence ?? 0.75, 0, 1),
    allowMultiple: Boolean(candidate.allow_multiple ?? candidate.allowMultiple ?? false),
    tags: Array.isArray(candidate.tags)
      ? candidate.tags.map((x) => String(x).trim()).filter(Boolean).slice(0, 12)
      : [],
    source,
  };
}

async function addMemoryCandidates(userId, candidates, source = "conversation") {
  const sanitized = (Array.isArray(candidates) ? candidates : [])
    .map((c) => sanitizeCandidate(c, source))
    .filter(Boolean)
    .filter((c) => c.importance >= 6 && c.confidence >= 0.6);

  if (!sanitized.length) return [];

  const vectors = await embedTexts(sanitized.map((c) => c.text));

  return withUserLock(userId, async () => {
    const bank = getBank(userId);
    const now = nowIso();
    const changed = [];

    for (let i = 0; i < sanitized.length; i++) {
      const candidate = sanitized[i];
      const normalized = normalizeText(candidate.text);

      let existing = bank.memories.find(
        (m) =>
          m.status === "active" &&
          normalizeText(m.text) === normalized
      );

      if (existing) {
        existing.importance = Math.max(existing.importance || 1, candidate.importance);
        existing.confidence = Math.max(existing.confidence || 0, candidate.confidence);
        existing.updatedAt = now;
        existing.tags = [...new Set([...(existing.tags || []), ...candidate.tags])].slice(0, 16);

        if (!existing.embedding && vectors[i]) {
          existing.embedding = packEmbedding(vectors[i]);
        }

        changed.push(existing);
        continue;
      }

      if (candidate.slot && !candidate.allowMultiple) {
        existing = bank.memories
          .filter(
            (m) =>
              m.status === "active" &&
              m.slot === candidate.slot &&
              !m.allowMultiple
          )
          .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0];

        if (existing) {
          const sameValue =
            candidate.value &&
            existing.value &&
            normalizeText(candidate.value) === normalizeText(existing.value);

          const verySimilar =
            lexicalSimilarity(existing.text, candidate.text) >= 0.8;

          if (sameValue || verySimilar) {
            existing.text = candidate.text;
            existing.value = candidate.value ?? existing.value;
            existing.importance = Math.max(existing.importance || 1, candidate.importance);
            existing.confidence = Math.max(existing.confidence || 0, candidate.confidence);
            existing.updatedAt = now;
            existing.tags = [...new Set([...(existing.tags || []), ...candidate.tags])].slice(0, 16);

            if (vectors[i]) existing.embedding = packEmbedding(vectors[i]);
            changed.push(existing);
            continue;
          }

          existing.status = "superseded";
          existing.validTo = now;
          existing.updatedAt = now;
        }
      }

      const record = {
        id: id("mem"),
        text: candidate.text,
        category: candidate.category,
        slot: candidate.slot,
        value: candidate.value,
        importance: candidate.importance,
        confidence: candidate.confidence,
        allowMultiple: candidate.allowMultiple,
        tags: candidate.tags,
        source: candidate.source,

        status: "active",
        createdAt: now,
        updatedAt: now,
        validFrom: now,
        validTo: null,

        lastAccessedAt: null,
        accessCount: 0,

        embedding: vectors[i] ? packEmbedding(vectors[i]) : null,
      };

      if (existing && existing.status === "superseded") {
        record.supersedesId = existing.id;
      }

      bank.memories.push(record);
      changed.push(record);
    }

    writeUserFile(userId, "bank.json", bank);
    return changed;
  });
}

async function retrieveMemories(userId, query, limit = 10) {
  const bank = getBank(userId);

  const active = bank.memories.filter(
    (m) => m.status === "active"
  );

  if (!active.length) return [];

  let queryVector = null;

  try {
    [queryVector] = await embedTexts([query]);
  } catch {}

  const now = Date.now();

  const scored = active.map((m) => {
    const semantic =
      queryVector && m.embedding
        ? Math.max(0, cosinePacked(queryVector, m.embedding))
        : 0;

    const lexical = lexicalSimilarity(query, m.text);
    const importance = clamp((m.importance || 5) / 10, 0, 1);

    const timestamp = new Date(m.updatedAt || m.createdAt || 0).getTime();
    const ageDays = Number.isFinite(timestamp)
      ? Math.max(0, (now - timestamp) / 86400000)
      : 9999;

    const recency = Math.exp(-ageDays / 240);

    const categoryBoost =
      ["relationship", "timeline", "character"].includes(m.category)
        ? 0.035
        : 0;

    const score =
      semantic * 0.58 +
      lexical * 0.17 +
      importance * 0.16 +
      recency * 0.09 +
      categoryBoost;

    return {
      ...m,
      _score: score,
      _semantic: semantic,
      _lexical: lexical,
    };
  });

  const top = scored
    .sort((a, b) => b._score - a._score)
    .slice(0, Math.max(1, limit));

  withUserLock(userId, async () => {
    const latest = getBank(userId);
    const ids = new Set(top.map((m) => m.id));
    const nowIsoValue = nowIso();

    for (const m of latest.memories) {
      if (!ids.has(m.id)) continue;
      m.lastAccessedAt = nowIsoValue;
      m.accessCount = (m.accessCount || 0) + 1;
    }

    writeUserFile(userId, "bank.json", latest);
  }).catch(() => {});

  return top;
}

function formatMemories(memories) {
  if (!Array.isArray(memories) || !memories.length) {
    return "（目前沒有檢索到高度相關的 Memory 2.0 長期記憶）";
  }

  return memories
    .map((m, i) => {
      const date = m.updatedAt || m.createdAt || "";
      return `${i + 1}. [${m.category}] ${m.text}（重要度 ${m.importance}/10；更新 ${date}）`;
    })
    .join("\n");
}

function stats(userId) {
  const bank = getBank(userId);
  const result = {
    total: bank.memories.length,
    active: 0,
    superseded: 0,
    categories: {},
  };

  for (const m of bank.memories) {
    if (m.status === "active") result.active++;
    if (m.status === "superseded") result.superseded++;

    result.categories[m.category] =
      (result.categories[m.category] || 0) + 1;
  }

  return result;
}

module.exports = {
  defaultBank,
  getBank,
  addMemoryCandidates,
  retrieveMemories,
  formatMemories,
  lexicalSimilarity,
  stats,
};
