require("dotenv").config();

const fs = require("fs");
const os = require("os");
const path = require("path");
const prism = require("prism-media");
const OpenAI = require("openai");

const {
  Client,
  Events,
  GatewayIntentBits,
} = require("discord.js");

const {
  joinVoiceChannel,
  getVoiceConnection,
  EndBehaviorType,
  entersState,
  VoiceConnectionStatus,
} = require("@discordjs/voice");

const {
  think,
  generateProactive,
} = require("./ai/brain");

const {
  openFishSpeechStream,
} = require("./ai/fishSpeech");

const {
  playFishStream,
  stopFishPlayback,
  isFishPlaying,
} = require("./voice/player");

const {
  rememberLocation,
} = require("./memory2/meta");

const {
  startProactiveEngine,
} = require("./memory2/proactive");


// ========================================
// OpenAI STT
// ========================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// ========================================
// Discord
// ========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});


// ========================================
// State
// ========================================

const recordingUsers = new Set();
const userQueues = new Map();

// guildId -> { userId, channelId, username }
const activeVoiceContexts = new Map();

// guildId -> AbortController
const pendingFishControllers = new Map();


// ========================================
// Queue
// ========================================

function enqueueUserTask(key, task) {
  const previous = userQueues.get(key) || Promise.resolve();

  const next = previous
    .catch(() => {})
    .then(task);

  userQueues.set(key, next);

  next.finally(() => {
    if (userQueues.get(key) === next) {
      userQueues.delete(key);
    }
  });

  return next;
}


// ========================================
// PCM -> WAV
// ========================================

function createWavBuffer(
  pcmData,
  sampleRate = 48000,
  channels = 2
) {
  const bitsPerSample = 16;
  const byteRate =
    sampleRate *
    channels *
    bitsPerSample /
    8;

  const blockAlign =
    channels *
    bitsPerSample /
    8;

  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([
    header,
    pcmData,
  ]);
}


// ========================================
// STT
// ========================================

async function transcribeWav(tempFile) {
  const transcription =
    await openai.audio.transcriptions.create({
      file:
        fs.createReadStream(
          tempFile
        ),

      model:
        process.env.STT_MODEL ||
        "gpt-4o-mini-transcribe",

      language:
        "zh",
    });

  return transcription.text?.trim() || "";
}


// ========================================
// Fish interrupt
// ========================================

function interruptCurrentSpeech(guildId) {
  const pending =
    pendingFishControllers.get(guildId);

  if (pending) {
    try {
      pending.abort();
    } catch {}

    pendingFishControllers.delete(guildId);
  }

  stopFishPlayback(guildId);
}


// ========================================
// 文字 -> Fish -> Discord
// ========================================

async function speakText({
  connection,
  guildId,
  text,
}) {
  const controller =
    new AbortController();

  pendingFishControllers.set(
    guildId,
    controller
  );

  try {
    const fishStream =
      await openFishSpeechStream(
        text,
        {
          signal:
            controller.signal,
        }
      );

    if (controller.signal.aborted) {
      return false;
    }

    await playFishStream({
      connection,
      guildId,
      webStream:
        fishStream,

      inputSampleRate:
        Number(
          process.env.FISH_SAMPLE_RATE ||
          44100
        ),

      abortController:
        controller,
    });

    return true;

  } catch (error) {
    if (
      error?.name === "AbortError" ||
      controller.signal.aborted
    ) {
      return false;
    }

    throw error;

  } finally {
    if (
      pendingFishControllers.get(guildId) ===
      controller
    ) {
      pendingFishControllers.delete(guildId);
    }
  }
}


// ========================================
// Voice turn
// ========================================

async function processRecordedAudio({
  connection,
  guildId,
  userId,
  username,
  channelId,
  pcmData,
}) {
  if (!pcmData || pcmData.length < 10000) {
    console.log("🔇 音訊太短，忽略");
    return;
  }

  const wavBuffer =
    createWavBuffer(
      pcmData,
      48000,
      2
    );

  const tempFile =
    path.join(
      os.tmpdir(),
      `vg-${userId}-${Date.now()}.wav`
    );

  fs.writeFileSync(
    tempFile,
    wavBuffer
  );

  try {
    console.log("🧠 正在辨識...");

    const text =
      await transcribeWav(
        tempFile
      );

    if (!text) {
      console.log("🤔 沒辨識到內容");
      return;
    }

    console.log(
      `🗣️ ${username}：${text}`
    );

    console.log(
      "💭 她正在想..."
    );

    const reply =
      await think({
        userId,
        username,
        text,
        guildId,
        channelId,
      });

    console.log(
      `❤️ 她：${reply}`
    );

    console.log(
      "🐟 Fish Audio 正在產生語音..."
    );

    await speakText({
      connection,
      guildId,
      text: reply,
    });

    console.log(
      "✅ 語音播放完成"
    );

  } catch (error) {
    console.error(
      "❌ 語音對話流程失敗：",
      error?.message || error
    );

  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch {}
  }
}


// ========================================
// Discord 收音
// ========================================

async function recordUserSpeech(
  connection,
  guildId,
  userId
) {
  const recordingKey =
    `${guildId}:${userId}`;

  if (
    recordingUsers.has(
      recordingKey
    )
  ) {
    return;
  }

  recordingUsers.add(
    recordingKey
  );

  try {
    const user =
      await client.users.fetch(
        userId
      );

    if (
      isFishPlaying(guildId) ||
      pendingFishControllers.has(guildId)
    ) {
      interruptCurrentSpeech(
        guildId
      );
    }

    console.log(
      `🎙️ 開始接收：${user.username}`
    );

    const opusStream =
      connection.receiver.subscribe(
        userId,
        {
          end: {
            behavior:
              EndBehaviorType.AfterSilence,

            duration:
              Number(
                process.env.VOICE_END_SILENCE_MS ||
                700
              ),
          },
        }
      );

    const decoder =
      new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });

    const pcmChunks = [];
    const pcmStream =
      opusStream.pipe(
        decoder
      );

    pcmStream.on(
      "data",
      (chunk) => {
        pcmChunks.push(chunk);
      }
    );

    pcmStream.on(
      "end",
      () => {
        recordingUsers.delete(
          recordingKey
        );

        if (!pcmChunks.length) {
          return;
        }

        const pcmData =
          Buffer.concat(
            pcmChunks
          );

        const context =
          activeVoiceContexts.get(
            guildId
          ) || {};

        enqueueUserTask(
          recordingKey,
          async () => {
            await processRecordedAudio({
              connection,
              guildId,
              userId,
              username: user.username,
              channelId: context.channelId || null,
              pcmData,
            });
          }
        );
      }
    );

    pcmStream.on(
      "error",
      (error) => {
        recordingUsers.delete(
          recordingKey
        );

        console.error(
          "❌ PCM 解碼錯誤：",
          error?.message || error
        );
      }
    );

    opusStream.on(
      "error",
      (error) => {
        recordingUsers.delete(
          recordingKey
        );

        console.error(
          "❌ Discord Opus Stream：",
          error?.message || error
        );
      }
    );

  } catch (error) {
    recordingUsers.delete(
      recordingKey
    );

    console.error(
      "❌ Discord 收音錯誤：",
      error?.message || error
    );
  }
}


// ========================================
// Proactive Voice callback
// ========================================

async function speakProactive({
  guildId,
  userId,
  text,
}) {
  if (!guildId) return false;

  const connection =
    getVoiceConnection(
      guildId
    );

  if (!connection) return false;

  const guild =
    client.guilds.cache.get(
      guildId
    );

  if (!guild) return false;

  let member;

  try {
    member =
      await guild.members.fetch(
        userId
      );
  } catch {
    return false;
  }

  const botChannel =
    connection.joinConfig?.channelId;

  if (
    !member.voice?.channelId ||
    member.voice.channelId !== botChannel
  ) {
    return false;
  }

  interruptCurrentSpeech(
    guildId
  );

  return speakText({
    connection,
    guildId,
    text,
  });
}


// ========================================
// Ready
// ========================================

client.once(
  Events.ClientReady,
  (readyClient) => {
    console.log(
      `✅ 已登入：${readyClient.user.tag}`
    );

    console.log(
      "🧠 Memory System 2.0：ON"
    );

    console.log(
      "❤️ Emotion State：ON"
    );

    console.log(
      `🕒 Time Awareness：${process.env.CHARACTER_TIMEZONE || "Asia/Taipei"}`
    );

    console.log(
      "💬 Proactive Behavior：ON"
    );

    startProactiveEngine({
      client,
      generateProactive,
      speakProactive,
    });
  }
);


// ========================================
// Discord Message
// ========================================

client.on(
  Events.MessageCreate,
  async (message) => {
    if (
      message.author.bot ||
      !message.guild
    ) {
      return;
    }

    const content =
      message.content.trim();

    // ====================================
    // !join
    // ====================================

    if (content === "!join") {
      const voiceChannel =
        message.member
          ?.voice
          ?.channel;

      if (!voiceChannel) {
        await message.reply(
          "你自己都還沒進語音頻道，我要去哪啦。"
        );
        return;
      }

      const guildId =
        message.guild.id;

      interruptCurrentSpeech(
        guildId
      );

      const oldConnection =
        getVoiceConnection(
          guildId
        );

      if (oldConnection) {
        oldConnection.destroy();
      }

      const connection =
        joinVoiceChannel({
          channelId:
            voiceChannel.id,

          guildId,

          adapterCreator:
            voiceChannel.guild
              .voiceAdapterCreator,

          selfDeaf: false,
          selfMute: false,
        });

      try {
        await entersState(
          connection,
          VoiceConnectionStatus.Ready,
          15000
        );
      } catch (error) {
        connection.destroy();

        console.error(
          "❌ Discord VC Ready 失敗：",
          error?.message || error
        );

        await message.reply(
          "我進語音失敗了。"
        );

        return;
      }

      activeVoiceContexts.set(
        guildId,
        {
          userId:
            message.author.id,

          channelId:
            message.channel.id,

          username:
            message.author.username,
        }
      );

      await rememberLocation(
        message.author.id,
        {
          displayName:
            message.author.username,

          guildId,

          channelId:
            message.channel.id,
        }
      );

      connection.receiver
        .speaking
        .on(
          "start",
          (userId) => {
            if (
              userId ===
              client.user.id
            ) {
              return;
            }

            const active =
              activeVoiceContexts.get(
                guildId
              );

            if (
              !active ||
              userId !== active.userId
            ) {
              return;
            }

            recordUserSpeech(
              connection,
              guildId,
              userId
            );
          }
        );

      console.log(
        `🎧 已加入語音頻道：${voiceChannel.name}`
      );

      await message.reply(
        "進來了。"
      );

      return;
    }

    // ====================================
    // !leave
    // ====================================

    if (content === "!leave") {
      const guildId =
        message.guild.id;

      interruptCurrentSpeech(
        guildId
      );

      activeVoiceContexts.delete(
        guildId
      );

      const connection =
        getVoiceConnection(
          guildId
        );

      if (connection) {
        connection.destroy();
      }

      await message.reply(
        "走啦。"
      );

      return;
    }

    // ====================================
    // @ Bot：Brain + Memory 2.0
    // ====================================

    if (
      message.mentions.has(
        client.user
      )
    ) {
      const mentionA =
        `<@${client.user.id}>`;

      const mentionB =
        `<@!${client.user.id}>`;

      const text =
        content
          .replaceAll(mentionA, "")
          .replaceAll(mentionB, "")
          .trim();

      if (!text) {
        await message.reply(
          "有，我在。"
        );
        return;
      }

      try {
        const reply =
          await think({
            userId:
              message.author.id,

            username:
              message.author.username,

            text,

            guildId:
              message.guild.id,

            channelId:
              message.channel.id,
          });

        await message.reply(
          reply
        );

      } catch (error) {
        console.error(
          "❌ 文字 Brain 失敗：",
          error?.message || error
        );

        await message.reply(
          "等一下，我剛剛卡了一下。"
        );
      }

      return;
    }
  }
);


// ========================================
// Errors
// ========================================

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "❌ Unhandled Promise Rejection：",
      error
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "❌ Uncaught Exception：",
      error
    );
  }
);


// ========================================
// Login
// ========================================

client.login(
  process.env.DISCORD_TOKEN
);
