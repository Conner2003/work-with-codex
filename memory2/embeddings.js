const { getOpenAI } = require("./openai");

function packEmbedding(values) {
  if (!Array.isArray(values) || values.length === 0) return null;

  const buffer = Buffer.allocUnsafe(values.length * 4);

  for (let i = 0; i < values.length; i++) {
    buffer.writeFloatLE(Number(values[i]) || 0, i * 4);
  }

  return buffer.toString("base64");
}

function cosinePacked(queryVector, packed) {
  if (!Array.isArray(queryVector) || !packed) return 0;

  const buffer = Buffer.from(packed, "base64");
  const length = Math.min(queryVector.length, Math.floor(buffer.length / 4));

  if (!length) return 0;

  let dot = 0;
  let qa = 0;
  let qb = 0;

  for (let i = 0; i < length; i++) {
    const a = Number(queryVector[i]) || 0;
    const b = buffer.readFloatLE(i * 4);

    dot += a * b;
    qa += a * a;
    qb += b * b;
  }

  if (qa === 0 || qb === 0) return 0;
  return dot / (Math.sqrt(qa) * Math.sqrt(qb));
}

async function embedTexts(texts) {
  const clean = (Array.isArray(texts) ? texts : [texts])
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  if (!clean.length) return [];

  const openai = getOpenAI();

  try {
    const result = await openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
      input: clean,
      encoding_format: "float",
    });

    return result.data.map((item) => item.embedding);
  } catch (error) {
    console.error("⚠️ Embedding 失敗，將退回關鍵字檢索：", error?.message || error);
    return clean.map(() => null);
  }
}

module.exports = {
  packEmbedding,
  cosinePacked,
  embedTexts,
};
