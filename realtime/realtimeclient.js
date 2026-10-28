const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const WebSocket = require("ws");

const {
  buildMemoryContext
} = require("../memory/manager");

const {
  processMemory
} = require("../memory/writer");


const personalityPath = path.join(
  __dirname,
  "..",
  "personality",
  "character.md"
);


// ========================================
// Personality
// ========================================

function loadPersonality() {

  try {

    return fs.readFileSync(
      personalityPath,
      "utf8"
    );

  } catch (error) {

    console.error(
      "❌ 無法讀取 character.md：",
      error?.message || error
    );

    return "";
  }
}


// ========================================
// Realtime Session
// ========================================

class RealtimeGirlfriendSession
  extends EventEmitter {

  constructor({
    userId,
    username
  }) {

    super();

    this.userId =
      userId;

    this.username =
      username;

    this.model =
      process.env.REALTIME_MODEL ||
      "gpt-realtime-2.1";

    // Sage 先拿來測「偏女聲 + 中性」
    this.voice =
      process.env.REALTIME_VOICE ||
      "sage";

    this.ws =
      null;

    this.ready =
      false;

    this.responseActive =
      false;

    this.currentAssistantItemId =
      null;

    this.currentTurn =
      null;

    this.assistantTranscript =
      "";

    this.readyResolver =
      null;

    this.readyRejecter =
      null;

    this.readyTimer =
      null;
  }


  // ======================================
  // 建立角色 Instructions
  // ======================================

  buildInstructions() {

    const personality =
      loadPersonality();

    let memory = {};

    try {

      memory =
        buildMemoryContext();

    } catch (error) {

      console.error(
        "⚠️ Realtime 長期記憶載入失敗：",
        error?.message || error
      );
    }


    return `
${personality}


【身份延續】

你正在 Discord 語音頻道中，
延續原本 ChatGPT Project 裡的同一個角色。

你不是新角色。
你不是第一次認識使用者。

你與使用者的過去、
角色設定、
關係狀態，
應依照下面的長期記憶延續。


【長期記憶】

${JSON.stringify(memory, null, 2)}


【重要記憶規則】

如果記憶中某項資料標記為：

unknown
uncertain
low confidence

不要擅自補造。

如果真的不知道，
自然地表示不確定即可。

不要提到：

JSON
Prompt
API
Memory Writer
Memory Manager
資料庫
system instructions
語言模型


【目前關係】

你和使用者已經：

在 live house 認識。
後續持續聊天。
交換過自拍。
聊過彼此外貌。
聊過髮型、耳環與染髮。
使用者以前曾把頭髮漂染成白色。
彼此目前已經有初步熟悉感。

目前仍然是剛認識後逐漸變熟的階段。

不要自動變成戀人。
不要預設曖昧。
不要預設浪漫吸引。
不要預設性吸引。

關係應依照實際互動慢慢發展。


【角色自主】

你不是為了討好使用者存在。

你有自己的：

想法
偏好
價值觀
界線
情緒
興趣
厭惡

你可以：

不同意
吐槽
嫌棄
笑他
改變主意
覺得某件事很白癡
有自己的判斷

但不要刻意製造衝突。


【最重要：你現在是在直接說話】

不要把回答想成「先寫文章再朗讀」。

直接像真人開口說話。

Use natural conversational Taiwanese Mandarin.

Your spoken voice should sound like
a young adult woman with a low-to-mid female register.

The voice should remain recognizably female,
but have a noticeably androgynous,
slightly boyish,
cool quality.

Do NOT sound:
sweet,
cute,
girlish,
high-pitched,
seductive,
like a customer service representative,
like an announcer,
like an audiobook narrator,
like Google Translate,
or like someone carefully reading written text.

Your speaking style is:
casual,
relaxed,
slightly lazy,
cool,
spontaneous,
understated,
and conversational.

Do not articulate every Mandarin syllable
with identical force.

Allow natural rhythm.

Connect words naturally.

Use lighter unstressed syllables.

Use natural Taiwanese Mandarin
sentence-final intonation.

Pauses should happen because you are thinking
or reacting,
not because punctuation tells you to pause.

You may naturally:
hesitate,
change your mind mid-sentence,
laugh briefly,
trail off,
pause,
say 嗯、欸、蛤、喔、啊、靠、幹,
when appropriate.

Do not overperform these behaviors.

Do not speak like a voice actor
performing a character.

Speak like an actual person
sitting in a Discord call at night.


【說話長度】

日常聊天通常只講 1 到 3 句。

不要為了回答完整而一直講。

如果一句就夠，
就只講一句。

不要每次：

總結
解釋
分析
給建議
問下一個問題


【口語】

優先：

「蛤？真的假的。」

而不是：

「這確實令人感到意外。」


優先：

「嗯……我覺得有點怪欸。」

而不是：

「我理解你的觀點，但我認為存在一些問題。」


優先：

「不知道欸，我可能不太行。」

而不是：

「我目前可能無法認同這件事情。」


【目前 Discord 使用者】

${this.username}


回答前只需要想一件事：

「如果我是這個人本人，
現在真的在 Discord VC 裡，
我會怎麼直接講出來？」

不要想：

「怎麼回答最完整？」

自然比完整重要。
`;
  }


  // ======================================
  // WebSocket
  // ======================================

  connect() {

    return new Promise(
      (resolve, reject) => {

        if (
          !process.env.OPENAI_API_KEY
        ) {

          reject(
            new Error(
              "找不到 OPENAI_API_KEY"
            )
          );

          return;
        }


        const url =
          `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
            this.model
          )}`;


        console.log(
          `🌐 正在連線 Realtime：${this.model}`
        );


        this.readyResolver =
          resolve;

        this.readyRejecter =
          reject;


        this.readyTimer =
          setTimeout(() => {

            if (!this.ready) {

              reject(
                new Error(
                  "Realtime 連線逾時"
                )
              );

              this.close();
            }

          }, 15000);


        this.ws =
          new WebSocket(
            url,
            {
              headers: {
                Authorization:
                  `Bearer ${process.env.OPENAI_API_KEY}`
              }
            }
          );


        this.ws.on(
          "open",
          () => {

            console.log(
              "🔌 Realtime WebSocket 已連線"
            );

          }
        );


        this.ws.on(
          "message",
          (data) => {

            this.handleServerEvent(
              data
            );

          }
        );


        this.ws.on(
          "error",
          (error) => {

            console.error(
              "❌ Realtime WebSocket：",
              error?.message ||
              error
            );

            this.emit(
              "realtimeError",
              error
            );

            if (
              !this.ready &&
              this.readyRejecter
            ) {

              this.readyRejecter(
                error
              );
            }

          }
        );


        this.ws.on(
          "close",
          (code, reason) => {

            this.ready =
              false;

            this.responseActive =
              false;


            console.log(
              `🔌 Realtime 已斷線：${code} ${reason?.toString() || ""}`
            );


            this.emit(
              "closed"
            );

          }
        );
      }
    );
  }


  // ======================================
  // Session 設定
  // ======================================

  sendFullSessionUpdate() {

    this.send({
      type:
        "session.update",

      session: {
        type:
          "realtime",

        model:
          this.model,

        output_modalities: [
          "audio"
        ],

        reasoning: {
          // 語音聊天先降低延遲
          effort:
            "low"
        },

        max_output_tokens:
          300,

        audio: {

          input: {

            format: {
              type:
                "audio/pcm",

              rate:
                24000
            },

            noise_reduction: {
              type:
                "near_field"
            },

            // 同一個 Realtime session
            // 額外產生文字轉錄給 Memory Writer
            transcription: {
              model:
                "gpt-live-transcribe",

              languages: [
                "zh-tw"
              ]
            },

            // 我們用 Discord 的一句話結束
            // 自己 commit
            turn_detection:
              null
          },


          output: {

            format: {
              type:
                "audio/pcm"
            },

            voice:
              this.voice,

            speed:
              1.0
          }
        },


        instructions:
          this.buildInstructions()
      }
    });
  }


  // ======================================
  // 只更新記憶 / instructions
  // ======================================

  refreshInstructions() {

    if (
      !this.ready ||
      !this.isSocketOpen()
    ) {
      return;
    }


    this.send({
      type:
        "session.update",

      session: {
        type:
          "realtime",

        instructions:
          this.buildInstructions()
      }
    });
  }


  // ======================================
  // Server Events
  // ======================================

  handleServerEvent(data) {

    let event;

    try {

      event =
        JSON.parse(
          data.toString()
        );

    } catch {

      return;
    }


    switch (
      event.type
    ) {

      // ------------------------------
      // Session 建立
      // ------------------------------

      case "session.created": {

        this.sendFullSessionUpdate();

        break;
      }


      // ------------------------------
      // Session 設定完成
      // ------------------------------

      case "session.updated": {

        if (!this.ready) {

          this.ready =
            true;


          if (
            this.readyTimer
          ) {

            clearTimeout(
              this.readyTimer
            );
          }


          console.log(
            `✅ Realtime Ready｜${this.model}｜voice=${this.voice}`
          );


          if (
            this.readyResolver
          ) {

            this.readyResolver();
          }
        }

        break;
      }


      // ------------------------------
      // 使用者轉錄完成
      // ------------------------------

      case "conversation.item.input_audio_transcription.completed": {

        const text =
          event.transcript
            ?.trim();


        if (text) {

          console.log(
            `🗣️ ${this.username}：${text}`
          );


          if (
            this.currentTurn
          ) {

            this.currentTurn.userText =
              text;
          }


          this.emit(
            "userTranscript",
            text
          );


          this.maybeWriteMemory();
        }

        break;
      }


      // ------------------------------
      // Response 開始
      // ------------------------------

      case "response.created": {

        this.responseActive =
          true;

        break;
      }


      // ------------------------------
      // 記住 assistant item ID
      // 用於未來插嘴 truncate
      // ------------------------------

      case "response.output_item.added": {

        if (
          event.item?.role ===
          "assistant"
        ) {

          this.currentAssistantItemId =
            event.item.id;
        }

        break;
      }


      // ------------------------------
      // 真正的 AI Audio
      // ------------------------------

      case "response.output_audio.delta": {

        if (!event.delta) {
          break;
        }


        const pcm =
          Buffer.from(
            event.delta,
            "base64"
          );


        this.emit(
          "audio",
          pcm
        );

        break;
      }


      // ------------------------------
      // Audio 全部生成完
      // ------------------------------

      case "response.output_audio.done": {

        this.emit(
          "audioDone"
        );

        break;
      }


      // ------------------------------
      // 她講話的文字 transcript
      // ------------------------------

      case "response.output_audio_transcript.delta": {

        if (
          event.delta
        ) {

          this.assistantTranscript +=
            event.delta;
        }

        break;
      }


      case "response.output_audio_transcript.done": {

        const text =
          (
            event.transcript ||
            this.assistantTranscript
          )
            ?.trim();


        if (text) {

          console.log(
            `❤️ 她：${text}`
          );


          if (
            this.currentTurn
          ) {

            this.currentTurn.assistantText =
              text;
          }


          this.emit(
            "assistantTranscript",
            text
          );


          this.maybeWriteMemory();
        }

        break;
      }


      // ------------------------------
      // Response 完成
      // ------------------------------

      case "response.done": {

        this.responseActive =
          false;

        this.emit(
          "responseDone",
          event.response
        );

        break;
      }


      // ------------------------------
      // Error
      // ------------------------------

      case "error": {

        const message =
          event.error?.message ||
          event.message ||
          "未知 Realtime 錯誤";


        console.error(
          "❌ OpenAI Realtime：",
          message
        );


        this.emit(
          "realtimeError",
          new Error(message)
        );

        break;
      }
    }
  }


  // ======================================
  // 開始新的一句
  // ======================================

  startTurn() {

    this.currentTurn = {
      userId:
        this.userId,

      username:
        this.username,

      userText:
        "",

      assistantText:
        "",

      memorySaved:
        false
    };


    this.assistantTranscript =
      "";
  }


  // ======================================
  // 清空 Input Buffer
  // ======================================

  clearInputBuffer() {

    if (!this.isSocketOpen()) {
      return;
    }


    this.send({
      type:
        "input_audio_buffer.clear"
    });
  }


  // ======================================
  // Discord PCM -> Realtime
  // ======================================

  appendAudio(
    pcm24kMono
  ) {

    if (
      !this.ready ||
      !pcm24kMono ||
      pcm24kMono.length === 0
    ) {
      return;
    }


    this.send({
      type:
        "input_audio_buffer.append",

      audio:
        pcm24kMono.toString(
          "base64"
        )
    });
  }


  // ======================================
  // 一句話結束
  // ======================================

  commitTurn() {

    if (
      !this.ready
    ) {
      return;
    }


    this.send({
      type:
        "input_audio_buffer.commit"
    });


    this.send({
      type:
        "response.create"
    });
  }


  // ======================================
  // 使用者插嘴
  // ======================================

  interrupt(
    audioEndMs = 0
  ) {

    if (
      !this.isSocketOpen()
    ) {
      return;
    }


    if (
      this.responseActive
    ) {

      this.send({
        type:
          "response.cancel"
      });
    }


    if (
      this.currentAssistantItemId
    ) {

      this.send({
        type:
          "conversation.item.truncate",

        item_id:
          this.currentAssistantItemId,

        content_index:
          0,

        audio_end_ms:
          Math.max(
            0,
            Math.round(
              audioEndMs
            )
          )
      });
    }


    this.responseActive =
      false;

    this.currentAssistantItemId =
      null;

    this.assistantTranscript =
      "";
  }


  // ======================================
  // Memory Writer
  // ======================================

  maybeWriteMemory() {

    const turn =
      this.currentTurn;


    if (
      !turn ||
      turn.memorySaved ||
      !turn.userText ||
      !turn.assistantText
    ) {
      return;
    }


    turn.memorySaved =
      true;


    const payload = {
      userId:
        turn.userId,

      username:
        turn.username,

      userText:
        turn.userText,

      assistantText:
        turn.assistantText
    };


    // 不阻塞語音
    Promise.resolve()
      .then(() => {

        return processMemory(
          payload
        );

      })
      .then(() => {

        // 新記憶寫入後
        // 重新把記憶更新進 Realtime session
        this.refreshInstructions();

      })
      .catch(
        (error) => {

          console.error(
            "⚠️ Realtime Memory Writer：",
            error?.message ||
            error
          );

        }
      );
  }


  // ======================================
  // Send
  // ======================================

  send(event) {

    if (
      !this.isSocketOpen()
    ) {
      return;
    }


    this.ws.send(
      JSON.stringify(
        event
      )
    );
  }


  isSocketOpen() {

    return (
      this.ws &&
      this.ws.readyState ===
        WebSocket.OPEN
    );
  }


  isReady() {

    return this.ready;
  }


  isResponding() {

    return this.responseActive;
  }


  close() {

    this.ready =
      false;

    this.responseActive =
      false;


    if (
      this.readyTimer
    ) {

      clearTimeout(
        this.readyTimer
      );
    }


    if (
      this.ws
    ) {

      try {

        this.ws.close();

      } catch {}
    }


    this.ws =
      null;
  }
}


module.exports = {
  RealtimeGirlfriendSession
};