const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


// ========================================
// 清理文字，讓 TTS 更像口語
// ========================================

function prepareSpeechText(text) {

  if (!text) {
    return "";
  }

  return text
    // 換行變停頓
    .replace(/\n+/g, "，")

    // 避免 markdown 影響朗讀
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#/g, "")

    // 多重標點不要唸得太怪
    .replace(/！{2,}/g, "！")
    .replace(/？{2,}/g, "？")
    .replace(/，{2,}/g, "，")

    // 去掉前後空白
    .trim();
}


// ========================================
// 文字 -> OpenAI TTS PCM
// ========================================

async function synthesizeSpeech(text) {

  const speechText =
    prepareSpeechText(text);


  if (!speechText) {

    throw new Error(
      "TTS 收到空文字"
    );
  }


  const response =
    await openai.audio.speech.create({

      model:
        process.env.TTS_MODEL ||
        "gpt-4o-mini-tts",

      // 先用 sage 測試
      voice:
        process.env.TTS_VOICE ||
        "sage",

      input:
        speechText,

      response_format:
        "pcm",

      speed:
        0.96,

      instructions: `
Speak in natural conversational Mandarin Chinese as used in Taiwan.

The speaker is a young adult woman with a low-to-mid female register and a slightly androgynous tone.

The voice should still clearly sound female, but not feminine in a sweet or cute way.

Use a relaxed, understated, slightly lazy Discord-call delivery.

Avoid:
- announcer voice
- audiobook narration
- customer-service tone
- language-learning-demo tone
- Google Translate-like rhythm
- overly clear word-by-word articulation
- exaggerated emotions
- cute or high-pitched female delivery

Do not pronounce every syllable with equal force.

Use natural Taiwanese Mandarin prosody:
some syllables should be lighter,
some phrases should connect,
sentence endings can soften,
and short filler words may be casual.

Read it like you are casually talking to someone you already know on voice chat.

For casual replies:
use subtle pauses,
small changes in pacing,
and natural sentence-final intonation.

Do not sound polished.
Do not sound like you are reading a script.

If the sentence contains things like:
嗯、欸、蛤、喔、啊、靠、幹、哈哈

say them casually and naturally,
not as formal vocabulary items.

Keep the overall vibe:
calm,
slightly cool,
slightly lazy,
androgynous,
young adult female,
natural,
not sweet.
`
    });


  const arrayBuffer =
    await response.arrayBuffer();


  return Buffer.from(
    arrayBuffer
  );
}


module.exports = {
  synthesizeSpeech
};