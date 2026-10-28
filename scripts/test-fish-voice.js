require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  getVoiceId
} = require("../ai/fishSpeech");


async function main() {

  const apiKey =
    process.env.FISH_API_KEY
      ?.trim();


  if (!apiKey) {

    throw new Error(
      "找不到 FISH_API_KEY"
    );
  }


  const voiceId =
    getVoiceId();


  const text =
    process.argv
      .slice(2)
      .join(" ")
      .trim() ||
    "欸，你還在喔？我剛剛還以為你跑掉了。";


  console.log(
    `🐟 Voice ID：${voiceId}`
  );

  console.log(
    `🗣️ Test：${text}`
  );


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

          model:
            process.env.FISH_TTS_MODEL ||
            "s2.1-pro-free"
        },

        body:
          JSON.stringify({
            text,
            reference_id:
              voiceId,

            format:
              "wav",

            sample_rate:
              44100,

            latency:
              "normal",

            normalize:
              true,

            condition_on_previous_chunks:
              true,

            temperature:
              0.7,

            top_p:
              0.7
          })
      }
    );


  if (!response.ok) {

    throw new Error(
      `Fish Audio API ${response.status}: ${await response.text()}`
    );
  }


  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    );


  const out =
    path.resolve(
      "voice/fish-test.wav"
    );


  fs.writeFileSync(
    out,
    buffer
  );


  console.log(
    `✅ 測試音訊：${out}`
  );
}


main().catch(
  (error) => {

    console.error(
      "❌ Fish 測試失敗：",
      error?.message || error
    );

    process.exitCode =
      1;
  }
);
