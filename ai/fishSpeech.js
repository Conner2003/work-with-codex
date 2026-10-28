const fs = require("fs");
const path = require("path");


// ========================================
// Fish Voice Config
// ========================================

const voiceConfigPath =
  path.join(
    __dirname,
    "..",
    "voice",
    "fish-voice.json"
  );


function loadSavedVoiceId() {

  try {

    if (
      !fs.existsSync(
        voiceConfigPath
      )
    ) {

      return "";
    }


    const config =
      JSON.parse(
        fs.readFileSync(
          voiceConfigPath,
          "utf8"
        )
      );


    return (
      config.voiceId ||
      config._id ||
      config.id ||
      ""
    );

  } catch (error) {

    console.error(
      "⚠️ fish-voice.json 讀取失敗：",
      error?.message || error
    );

    return "";
  }
}


function getVoiceId() {

  const id =
    process.env.FISH_VOICE_ID
      ?.trim() ||
    loadSavedVoiceId();


  if (!id) {

    throw new Error(
      "找不到 Fish Audio Voice ID。先執行 node scripts/create-fish-voice.js"
    );
  }


  return id;
}


// ========================================
// Fish TTS Streaming
// ========================================

async function openFishSpeechStream(
  text,
  {
    signal
  } = {}
) {

  const apiKey =
    process.env.FISH_API_KEY
      ?.trim();


  if (!apiKey) {

    throw new Error(
      "找不到 FISH_API_KEY"
    );
  }


  if (
    !text ||
    !text.trim()
  ) {

    throw new Error(
      "Fish Audio 收到空文字"
    );
  }


  const voiceId =
    getVoiceId();


  const model =
    process.env.FISH_TTS_MODEL
      ?.trim() ||
    "s2.1-pro-free";


  const sampleRate =
    Number(
      process.env.FISH_SAMPLE_RATE ||
      44100
    );


  const latency =
    process.env.FISH_LATENCY
      ?.trim() ||
    "balanced";


  const body = {

    text:
      text.trim(),

    reference_id:
      voiceId,

    format:
      "pcm",

    sample_rate:
      sampleRate,

    latency,

    // Fish 官方支援中文文字正規化
    normalize:
      true,

    // 保留前一 chunk 的聲音上下文，
    // 對同一句的聲線一致性比較好
    condition_on_previous_chunks:
      true,

    chunk_length:
      Number(
        process.env.FISH_CHUNK_LENGTH ||
        200
      ),

    min_chunk_length:
      Number(
        process.env.FISH_MIN_CHUNK_LENGTH ||
        50
      ),

    temperature:
      Number(
        process.env.FISH_TEMPERATURE ||
        0.7
      ),

    top_p:
      Number(
        process.env.FISH_TOP_P ||
        0.7
      ),

    repetition_penalty:
      1.2
  };


  const response =
    await fetch(
      "https://api.fish.audio/v1/tts",
      {
        method:
          "POST",

        headers: {

          Authorization:
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",

          model
        },

        body:
          JSON.stringify(
            body
          ),

        signal
      }
    );


  if (
    !response.ok
  ) {

    let detail = "";

    try {

      detail =
        await response.text();

    } catch {}


    throw new Error(
      `Fish Audio API ${response.status}: ${detail || response.statusText}`
    );
  }


  if (
    !response.body
  ) {

    throw new Error(
      "Fish Audio 沒有回傳音訊 stream"
    );
  }


  return response.body;
}


module.exports = {
  openFishSpeechStream,
  getVoiceId
};
