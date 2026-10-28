require("dotenv").config();

const fs = require("fs");
const path = require("path");


// ========================================
// Config
// ========================================

const API_URL =
  "https://api.fish.audio/model";


function requiredEnv(
  name
) {

  const value =
    process.env[name]
      ?.trim();


  if (!value) {

    throw new Error(
      `缺少 .env 設定：${name}`
    );
  }


  return value;
}


function mimeFromPath(
  filePath
) {

  const ext =
    path.extname(
      filePath
    ).toLowerCase();


  const map = {

    ".wav":
      "audio/wav",

    ".mp3":
      "audio/mpeg",

    ".m4a":
      "audio/mp4",

    ".opus":
      "audio/opus"
  };


  const mime =
    map[ext];


  if (!mime) {

    throw new Error(
      "Fish Audio voice sample 請使用 .wav / .mp3 / .m4a / .opus"
    );
  }


  return mime;
}


async function sleep(
  ms
) {

  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}


async function apiJson(
  url,
  options
) {

  const response =
    await fetch(
      url,
      options
    );


  let body;


  try {

    body =
      await response.json();

  } catch {

    body = {
      message:
        await response.text()
    };
  }


  if (
    !response.ok
  ) {

    throw new Error(
      `Fish Audio API ${response.status}: ${
        body?.message ||
        JSON.stringify(body)
      }`
    );
  }


  return body;
}


// ========================================
// 建立 Voice Clone
// ========================================

async function createVoice() {

  const apiKey =
    requiredEnv(
      "FISH_API_KEY"
    );


  const samplePath =
    path.resolve(
      process.env.FISH_VOICE_SAMPLE_FILE ||
      "voice/source/sample.wav"
    );


  if (
    !fs.existsSync(
      samplePath
    )
  ) {

    throw new Error(
      `找不到聲音樣本：${samplePath}`
    );
  }


  const sample =
    fs.readFileSync(
      samplePath
    );


  const title =
    process.env.FISH_VOICE_NAME
      ?.trim() ||
    "Virtual Girlfriend";


  const transcript =
    process.env.FISH_VOICE_SAMPLE_TEXT
      ?.trim() ||
    "";


  const form =
    new FormData();


  form.append(
    "type",
    "tts"
  );


  form.append(
    "title",
    title
  );


  form.append(
    "train_mode",
    "fast"
  );


  // 一律 private
  form.append(
    "visibility",
    "private"
  );


  form.append(
    "enhance_audio_quality",
    process.env.FISH_ENHANCE_AUDIO ===
      "false"
      ? "false"
      : "true"
  );


  form.append(
    "generate_sample",
    "false"
  );


  form.append(
    "voices",
    new Blob(
      [sample],
      {
        type:
          mimeFromPath(
            samplePath
          )
      }
    ),
    path.basename(
      samplePath
    )
  );


  // 有精確逐字稿就提供，
  // 沒有就讓 Fish 自動 ASR
  if (transcript) {

    form.append(
      "texts",
      transcript
    );
  }


  console.log(
    `🐟 正在建立 Fish Audio 聲線：${title}`
  );

  console.log(
    `🎧 Sample：${samplePath}`
  );


  const voice =
    await apiJson(
      API_URL,
      {
        method:
          "POST",

        headers: {

          Authorization:
            `Bearer ${apiKey}`
        },

        body:
          form
      }
    );


  const voiceId =
    voice._id ||
    voice.id;


  if (!voiceId) {

    throw new Error(
      "Fish Audio 建立成功，但沒有收到 Voice ID"
    );
  }


  console.log(
    `✅ Voice ID：${voiceId}`
  );

  console.log(
    `⏳ State：${voice.state || "unknown"}`
  );


  // ====================================
  // 等 fast clone 變 trained
  // ====================================

  let current =
    voice;


  for (
    let i = 0;
    i < 30;
    i++
  ) {

    if (
      current.state ===
      "trained"
    ) {

      break;
    }


    if (
      current.state ===
      "failed"
    ) {

      throw new Error(
        "Fish Audio Voice Clone 訓練失敗"
      );
    }


    await sleep(
      2000
    );


    current =
      await apiJson(
        `${API_URL}/${voiceId}`,
        {
          headers: {

            Authorization:
              `Bearer ${apiKey}`
          }
        }
      );


    console.log(
      `⏳ Voice State：${current.state}`
    );
  }


  // 即使還在 training 也先存 ID，
  // 下次可直接使用或再檢查
  const configPath =
    path.resolve(
      "voice/fish-voice.json"
    );


  const config = {

    voiceId,

    title,

    state:
      current.state ||
      voice.state ||
      "unknown",

    createdAt:
      new Date().toISOString(),

    sourceSample:
      path.basename(
        samplePath
      )
  };


  fs.writeFileSync(
    configPath,
    JSON.stringify(
      config,
      null,
      2
    ),
    "utf8"
  );


  console.log("");
  console.log(
    `💾 已寫入：${configPath}`
  );


  if (
    current.state ===
    "trained"
  ) {

    console.log(
      "🎉 Fish Audio 聲線已可使用"
    );

  } else {

    console.log(
      "⚠️ Voice ID 已建立，但目前仍未顯示 trained；稍後再試 TTS。"
    );
  }
}


createVoice()
  .catch(
    (error) => {

      console.error("");
      console.error(
        "❌ Fish Audio Voice Clone 失敗："
      );

      console.error(
        error?.message || error
      );

      process.exitCode =
        1;
    }
  );
