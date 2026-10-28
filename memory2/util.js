const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return cloneFallback(fallback);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`⚠️ JSON 讀取失敗：${file}`, error?.message || error);
    return cloneFallback(fallback);
  }
}

function cloneFallback(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function writeJsonAtomic(file, data) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temp, file);
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeText(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、；：「」『』（）()【】\[\]'"`~!@#$%^&*_=+<>?\\/|:;,.]/g, "");
}

function extractJson(text) {
  if (!text) return null;

  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  try {
    return JSON.parse(s);
  } catch {}

  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");

  if (first >= 0 && last > first) {
    try {
      return JSON.parse(s.slice(first, last + 1));
    } catch {}
  }

  return null;
}

function chunkText(text, maxChars = 5500) {
  const src = String(text || "").trim();
  if (!src) return [];

  const chunks = [];
  let cursor = 0;

  while (cursor < src.length) {
    let end = Math.min(src.length, cursor + maxChars);

    if (end < src.length) {
      const slice = src.slice(cursor, end);
      const candidates = [
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf("。"),
      ];
      const cut = Math.max(...candidates);
      if (cut > maxChars * 0.55) end = cursor + cut + 1;
    }

    chunks.push(src.slice(cursor, end).trim());
    cursor = end;
  }

  return chunks.filter(Boolean);
}

function hoursBetween(a, b = new Date()) {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.max(0, (db - da) / 3600000);
}

module.exports = {
  ensureDir,
  readJson,
  writeJsonAtomic,
  clamp,
  nowIso,
  id,
  normalizeText,
  extractJson,
  chunkText,
  hoursBetween,
};
