require("dotenv").config();

const fs = require("fs");
const path = require("path");

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const API_BASE = "https://api.openai.com/v1";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少 .env 設定：${name}`);
  return value;
}

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".webm": "audio/webm",
    ".mp4": "audio/mp4"
  };
  if (!map[ext]) throw new Error(`不支援的音訊格式：${ext || "(沒有副檔名)"}`);
  return map[ext];
}

function readAudioFile(filePath) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) throw new Error(`找不到音訊檔：${absolute}`);

  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error(`不是檔案：${absolute}`);
  if (stat.size > MAX_FILE_BYTES) throw new Error(`音訊檔超過 10 MiB：${absolute}`);

  return {
    absolute,
    filename: path.basename(absolute),
    mime: guessMimeType(absolute),
    buffer: fs.readFileSync(absolute)
  };
}

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = typeof body === "string"
      ? body
      : body?.error?.message || JSON.stringify(body);
    throw new Error(`OpenAI API ${response.status}：${detail}`);
  }

  return body;
}

async function uploadConsent({ apiKey, consentFile, voiceName, language }) {
  console.log("1/2 📜 正在上傳 Voice Consent...");

  const form = new FormData();
  form.append("name", `${voiceName} consent`);
  form.append("language", language);
  form.append(
    "recording",
    new Blob([consentFile.buffer], { type: consentFile.mime }),
    consentFile.filename
  );

  const result = await apiFetch(`${API_BASE}/audio/voice_consents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });

  if (!result?.id) throw new Error("Voice Consent 建立成功但沒有收到 consent id");
  console.log(`✅ Consent ID：${result.id}`);
  return result;
}

async function createVoice({ apiKey, sampleFile, consentId, voiceName }) {
  console.log("2/2 🎤 正在建立 Custom Voice...");

  const form = new FormData();
  form.append("name", voiceName);
  form.append("consent", consentId);
  form.append(
    "audio_sample",
    new Blob([sampleFile.buffer], { type: sampleFile.mime }),
    sampleFile.filename
  );

  const result = await apiFetch(`${API_BASE}/audio/voices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });

  if (!result?.id) throw new Error("Custom Voice 建立成功但沒有收到 voice id");
  console.log(`✅ Voice ID：${result.id}`);
  return result;
}

async function main() {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const consentPath = requiredEnv("VOICE_CONSENT_FILE");
  const samplePath = requiredEnv("VOICE_SAMPLE_FILE");
  const voiceName = process.env.VOICE_NAME?.trim() || "Virtual Girlfriend";
  const language = process.env.VOICE_LANGUAGE?.trim() || "zh-TW";

  const consentFile = readAudioFile(consentPath);
  const sampleFile = readAudioFile(samplePath);

  console.log(`🎤 Voice Name：${voiceName}`);
  console.log(`🗣️ Language：${language}`);
  console.log(`📜 Consent：${consentFile.absolute}`);
  console.log(`🎧 Sample：${sampleFile.absolute}`);

  const consent = await uploadConsent({
    apiKey,
    consentFile,
    voiceName,
    language
  });

  const voice = await createVoice({
    apiKey,
    sampleFile,
    consentId: consent.id,
    voiceName
  });

  const outputPath = path.resolve(__dirname, "..", "voice", "voice-config.json");
  const config = {
    voiceId: voice.id,
    consentId: consent.id,
    name: voice.name || voiceName,
    language,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2), "utf8");

  console.log("");
  console.log("🎉 Custom Voice 建立完成");
  console.log(`💾 已寫入：${outputPath}`);
  console.log("接下來直接 node index.js，client.js 會自動讀取這個 voiceId。");
}

main().catch((error) => {
  console.error("");
  console.error("❌ Custom Voice 建立失敗：");
  console.error(error?.message || error);
  console.error("");
  console.error("若回傳 403 / not eligible，代表目前這個 OpenAI 組織尚未開放 Custom Voices。");
  process.exitCode = 1;
});
