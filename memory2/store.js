const path = require("path");
const fs = require("fs");

const {
  ensureDir,
  readJson,
  writeJsonAtomic,
} = require("./util");

const ROOT = path.join(__dirname, "data");
ensureDir(ROOT);

const locks = new Map();

function safeUserId(userId) {
  return String(userId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function userDir(userId) {
  const dir = path.join(ROOT, safeUserId(userId));
  ensureDir(dir);
  return dir;
}

function fileFor(userId, name) {
  return path.join(userDir(userId), name);
}

function readUserFile(userId, name, fallback) {
  return readJson(fileFor(userId, name), fallback);
}

function writeUserFile(userId, name, data) {
  writeJsonAtomic(fileFor(userId, name), data);
}

function listUserIds() {
  ensureDir(ROOT);

  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function withUserLock(userId, task) {
  const key = safeUserId(userId);
  const previous = locks.get(key) || Promise.resolve();

  const next = previous
    .catch(() => {})
    .then(task);

  locks.set(key, next);

  const cleanup = () => {
    if (locks.get(key) === next) {
      locks.delete(key);
    }
  };

  next.then(cleanup, cleanup);

  return next;
}

module.exports = {
  ROOT,
  safeUserId,
  userDir,
  fileFor,
  readUserFile,
  writeUserFile,
  listUserIds,
  withUserLock,
};
