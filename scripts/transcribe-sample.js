require("dotenv").config();

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function main() {

  const inputPath =
    path.resolve(
      "voice/source/sample.wav"
    );


  if (
    !fs.existsSync(inputPath)
  ) {

    throw new Error(
      `找不到檔案：${inputPath}`
    );
  }


  console.log(
    "🧠 正在辨識 sample.wav..."
  );


  const result =
    await openai.audio.transcriptions.create({

      file:
        fs.createReadStream(
          inputPath
        ),

      model:
        "gpt-4o-mini-transcribe",

      language:
        "zh",

      prompt:
        "這是一段台灣華語自然口語錄音。請忠實逐字轉錄，保留嗯、欸、啊、喔、蛤等語助詞，不要自行改寫或補充內容。"
    });


  const text =
    result.text?.trim() || "";


  console.log("");
  console.log(
    "===== 逐字稿 ====="
  );

  console.log(text);

  console.log(
    "=================="
  );


  const outputPath =
    path.resolve(
      "voice/sample-transcript.txt"
    );


  fs.writeFileSync(
    outputPath,
    text,
    "utf8"
  );


  console.log("");
  console.log(
    `✅ 已存成：${outputPath}`
  );
}


main().catch(
  (error) => {

    console.error(
      "❌ 轉錄失敗：",
      error?.message || error
    );

  }
);