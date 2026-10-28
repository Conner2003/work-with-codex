const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const WebSocket = require("ws");

const { buildMemoryContext } = require("../memory/manager");
const { processMemory } = require("../memory/writer");

const personalityPath = path.join(__dirname, "..", "personality", "character.md");
const voiceConfigPath = path.join(__dirname, "..", "voice", "voice-config.json");
const MAX_INSTRUCTION_CHARS = 12000;

function clipText(value, maxChars) {
  if (value === undefined || value === null) return "";
  let text;
  if (typeof value === "string") text = value;
  else {
    try { text = JSON.stringify(value); }
    catch { text = String(value); }
  }
  return text.length <= maxChars ? text : text.slice(0, maxChars) + "…";
}

function loadPersonality() {
  try { return fs.readFileSync(personalityPath, "utf8"); }
  catch (error) {
    console.error("❌ 無法讀取 character.md：", error?.message || error);
    return "";
  }
}

function readVoiceConfig() {
  try {
    if (!fs.existsSync(voiceConfigPath)) return null;
    return JSON.parse(fs.readFileSync(voiceConfigPath, "utf8"));
  } catch (error) {
    console.error("⚠️ voice-config.json 讀取失敗：", error?.message || error);
    return null;
  }
}

function resolveVoice() {
  if (process.env.CUSTOM_VOICE_ID?.trim()) {
    return { id: process.env.CUSTOM_VOICE_ID.trim() };
  }
  const config = readVoiceConfig();
  if (config?.voiceId) return { id: String(config.voiceId).trim() };
  return process.env.REALTIME_VOICE || "marin";
}

function voiceLabel(voice) {
  return voice && typeof voice === "object" && voice.id
    ? `custom:${voice.id}`
    : String(voice);
}

function simplifyMemoryItem(item) {
  if (!item || typeof item !== "object") return clipText(item, 200);
  const out = {};
  if (item.type) out.type = item.type;
  if (item.category) out.category = item.category;
  if (item.content) out.content = clipText(item.content, 260);
  if (item.importance !== undefined) out.importance = item.importance;
  if (item.confidence) out.confidence = item.confidence;
  return Object.keys(out).length ? out : clipText(JSON.stringify(item), 260);
}

function buildCompactRealtimeMemoryText(memory) {
  if (!memory || typeof memory !== "object") return "目前沒有可用的長期記憶。";
  const sections = [];

  if (memory.profile) {
    sections.push(`【已確立角色資料】\n${clipText(memory.profile, 1200)}`);
  }

  if (memory.relationship) {
    const rel = {};
    if (memory.relationship.current_status) rel.current_status = memory.relationship.current_status;
    if (Array.isArray(memory.relationship.observations)) {
      rel.observations = memory.relationship.observations.slice(-6).map(simplifyMemoryItem);
    }
    sections.push(`【關係狀態】\n${clipText(rel, 900)}`);
  }

  if (memory.recent_context) {
    sections.push(`【最近情境】\n${clipText(memory.recent_context, 700)}`);
  }

  if (memory.user_memory && Array.isArray(memory.user_memory.known_facts)) {
    sections.push(`【使用者已知資料】\n${clipText(memory.user_memory.known_facts.slice(-10).map(simplifyMemoryItem), 900)}`);
  }

  if (Array.isArray(memory.important_memories)) {
    sections.push(`【重要長期記憶】\n${clipText(memory.important_memories.slice(0, 10).map(simplifyMemoryItem), 1000)}`);
  }

  if (Array.isArray(memory.important_timeline)) {
    sections.push(`【重要共同事件】\n${clipText(memory.important_timeline.slice(0, 7).map(simplifyMemoryItem), 700)}`);
  }

  if (memory.npcs && Array.isArray(memory.npcs.established)) {
    sections.push(`【已確立人物】\n${clipText(memory.npcs.established.slice(-6).map(simplifyMemoryItem), 500)}`);
  }

  if (memory.unresolved_threads && Array.isArray(memory.unresolved_threads.threads)) {
    sections.push(`【尚未確立或未解決】\n${clipText(memory.unresolved_threads.threads.slice(-7).map(simplifyMemoryItem), 700)}`);
  }

  return clipText(sections.join("\n\n"), 4500);
}

class RealtimeGirlfriendSession extends EventEmitter {
  constructor({ userId, username }) {
    super();
    this.userId = userId;
    this.username = username;
    this.model = process.env.REALTIME_MODEL || "gpt-realtime-1.5";
    this.voice = resolveVoice();
    this.ws = null;
    this.ready = false;
    this.responseActive = false;
    this.currentAssistantItemId = null;
    this.activeResponseId = null;
    this.activeResponseTurn = null;
    this.responseTurns = new Map();
    this.assistantTranscripts = new Map();
    this.currentTurn = null;
    this.turnCounter = 0;
    this.readyResolver = null;
    this.readyRejecter = null;
    this.readyTimer = null;
  }

  buildInstructions() {
    const personality = clipText(loadPersonality(), 4500);
    let memoryText = "目前沒有可用的長期記憶。";

    try {
      memoryText = buildCompactRealtimeMemoryText(buildMemoryContext());
    } catch (error) {
      console.error("⚠️ Realtime 長期記憶載入失敗：", error?.message || error);
    }

    let instructions = `
【核心身份】
你正在 Discord 語音頻道中延續原本 ChatGPT Project 裡的同一個角色。
不是第一次認識使用者。不要重新開始關係。不要把自己當成客服、助理或旁白。
已確立的記憶就是你真正經歷過的共同歷史。unknown、uncertain、low confidence 的內容不要擅自補造。

【目前關係】
你和使用者是在 live house 認識的。之後持續聊天、交換過自拍，也聊過外貌、髮型、耳環與染髮。
使用者以前曾把頭髮漂染成白色。目前是剛認識後逐漸變熟的早期關係。
不要自動假設已經是情侶，也不要預設曖昧、浪漫吸引或性吸引。

【角色自主】
你有自己的偏好、想法、情緒、價值觀與界線。可以不同意、吐槽、覺得事情蠢或無聊，也可以改變主意，但不要刻意唱反調。

【語音表現】
直接像一個真實的台灣年輕女性在 Discord 語音聊天。
使用自然台灣華語，不要使用外國人學中文的腔調。
聲線偏低，帶一點中性、少年感和帥氣感，但仍自然聽得出來是女性。
不要甜、不要夾嗓、不要刻意性感，也不要故意壓低成男性聲線。
說話放鬆、隨意。句子不用每個字都咬得很完整。
允許自然的連音、輕音、弱讀、語尾變化、短停頓、猶豫、改口與短笑。
像半夜戴著耳機，跟已經稍微熟悉的人隨口聊天。不要像導航、客服、主播、語言教材、有聲書或正式配音。

【口語方式】
一般聊天優先使用台灣人真的會講出口的句型。一般聊天 1 到 3 句就夠，一句能說完就一句。
不要每次都總結、分析、給建議或硬問下一題。

【角色完整設定】
${personality}

【目前可用長期記憶】
${memoryText}

【目前 Discord 使用者】
${this.username}

【技術資訊】
角色互動時不要主動提到 JSON、Prompt、Instructions、API、OpenAI、Memory Writer、Memory Manager、資料庫、token、語言模型。
除非使用者明確跳出角色討論程式。

【最終原則】
自然度優先。角色一致性優先。真人聊天感優先。
`;

    if (instructions.length > MAX_INSTRUCTION_CHARS) {
      console.warn(`⚠️ Instructions 太長：${instructions.length} chars，已裁到 ${MAX_INSTRUCTION_CHARS}`);
      instructions = instructions.slice(0, MAX_INSTRUCTION_CHARS);
    }

    console.log(`🧾 Realtime Instructions：${instructions.length} chars`);
    return instructions;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (!process.env.OPENAI_API_KEY) {
        reject(new Error("找不到 OPENAI_API_KEY"));
        return;
      }

      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.model)}`;
      console.log(`🌐 正在連線 Realtime：${this.model}`);
      console.log(`🎤 Realtime Voice：${voiceLabel(this.voice)}`);

      this.readyResolver = resolve;
      this.readyRejecter = reject;
      this.readyTimer = setTimeout(() => {
        if (!this.ready) {
          const error = new Error("Realtime 連線逾時");
          this.failBeforeReady(error);
          this.close();
        }
      }, 15000);

      this.ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      });

      this.ws.on("open", () => console.log("🔌 Realtime WebSocket 已連線"));
      this.ws.on("message", data => this.handleServerEvent(data));
      this.ws.on("error", error => {
        console.error("❌ Realtime WebSocket：", error?.message || error);
        this.emit("realtimeError", error);
        if (!this.ready) this.failBeforeReady(error);
      });
      this.ws.on("close", (code, reason) => {
        this.ready = false;
        this.responseActive = false;
        console.log(`🔌 Realtime 已斷線：${code} ${reason?.toString() || ""}`);
        this.emit("closed");
      });
    });
  }

  failBeforeReady(error) {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    if (this.readyRejecter) {
      const rejecter = this.readyRejecter;
      this.readyRejecter = null;
      this.readyResolver = null;
      rejecter(error);
    }
  }

  sendFullSessionUpdate() {
    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        model: this.model,
        output_modalities: ["audio"],
        max_output_tokens: 300,
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            noise_reduction: { type: "near_field" },
            transcription: { model: "gpt-live-transcribe" },
            turn_detection: null
          },
          output: {
            format: { type: "audio/pcm", rate: 24000 },
            voice: this.voice,
            speed: 1.0
          }
        },
        instructions: this.buildInstructions()
      }
    });
  }

  refreshInstructions() {
    if (!this.ready || !this.isSocketOpen()) return;
    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: this.buildInstructions()
      }
    });
  }

  handleServerEvent(data) {
    let event;
    try { event = JSON.parse(data.toString()); }
    catch { return; }

    switch (event.type) {
      case "session.created":
        this.sendFullSessionUpdate();
        break;

      case "session.updated":
        if (!this.ready) {
          this.ready = true;
          if (this.readyTimer) {
            clearTimeout(this.readyTimer);
            this.readyTimer = null;
          }
          console.log(`✅ Realtime Ready｜${this.model}｜voice=${voiceLabel(this.voice)}`);
          if (this.readyResolver) {
            const resolver = this.readyResolver;
            this.readyResolver = null;
            this.readyRejecter = null;
            resolver();
          }
        }
        break;

      case "conversation.item.input_audio_transcription.completed": {
        const text = event.transcript?.trim();
        if (text && this.currentTurn) {
          console.log(`🗣️ ${this.username}：${text}`);
          this.currentTurn.userText = text;
          this.emit("userTranscript", text);
          this.maybeWriteMemory(this.currentTurn);
        }
        break;
      }

      case "response.created": {
        this.responseActive = true;
        const responseId = event.response?.id || null;
        this.activeResponseId = responseId;
        this.activeResponseTurn = this.currentTurn;
        if (responseId && this.currentTurn) {
          this.responseTurns.set(responseId, this.currentTurn);
          this.assistantTranscripts.set(responseId, "");
        }
        break;
      }

      case "response.output_item.added":
        if (event.item?.role === "assistant") this.currentAssistantItemId = event.item.id;
        break;

      case "response.output_audio.delta":
        if (event.delta) this.emit("audio", Buffer.from(event.delta, "base64"));
        break;

      case "response.output_audio.done":
        this.emit("audioDone");
        break;

      case "response.output_audio_transcript.delta": {
        if (!event.delta) break;
        const responseId = event.response_id || this.activeResponseId;
        if (responseId) {
          const previous = this.assistantTranscripts.get(responseId) || "";
          this.assistantTranscripts.set(responseId, previous + event.delta);
        }
        break;
      }

      case "response.output_audio_transcript.done": {
        const responseId = event.response_id || this.activeResponseId;
        const bufferedText = responseId ? (this.assistantTranscripts.get(responseId) || "") : "";
        const text = (event.transcript || bufferedText)?.trim();
        let turn = responseId ? (this.responseTurns.get(responseId) || null) : null;
        if (!turn) turn = this.activeResponseTurn;
        if (text && turn && !turn.cancelled) {
          console.log(`❤️ 她：${text}`);
          turn.assistantText = text;
          this.emit("assistantTranscript", text);
          this.maybeWriteMemory(turn);
        }
        break;
      }

      case "response.done": {
        this.responseActive = false;
        const responseId = event.response?.id || this.activeResponseId;
        this.emit("responseDone", event.response);
        if (responseId) {
          setTimeout(() => {
            this.responseTurns.delete(responseId);
            this.assistantTranscripts.delete(responseId);
          }, 3000);
        }
        if (responseId === this.activeResponseId) {
          this.activeResponseId = null;
          this.activeResponseTurn = null;
          this.currentAssistantItemId = null;
        }
        break;
      }

      case "error": {
        const message = event.error?.message || event.message || "未知 Realtime 錯誤";
        const error = new Error(message);
        console.error("❌ OpenAI Realtime：", message);
        this.emit("realtimeError", error);
        if (!this.ready) this.failBeforeReady(error);
        break;
      }
    }
  }

  startTurn() {
    this.turnCounter += 1;
    this.currentTurn = {
      id: this.turnCounter,
      userId: this.userId,
      username: this.username,
      userText: "",
      assistantText: "",
      memorySaved: false,
      cancelled: false
    };
  }

  clearInputBuffer() {
    if (this.isSocketOpen()) this.send({ type: "input_audio_buffer.clear" });
  }

  appendAudio(pcm24kMono) {
    if (!this.ready || !pcm24kMono || pcm24kMono.length === 0) return;
    this.send({
      type: "input_audio_buffer.append",
      audio: pcm24kMono.toString("base64")
    });
  }

  commitTurn() {
    if (!this.ready || !this.isSocketOpen()) return;
    this.send({ type: "input_audio_buffer.commit" });
    this.send({ type: "response.create" });
  }

  interrupt(audioEndMs = 0) {
    if (!this.isSocketOpen()) return;
    if (this.activeResponseTurn) this.activeResponseTurn.cancelled = true;
    if (this.responseActive) this.send({ type: "response.cancel" });
    if (this.currentAssistantItemId) {
      this.send({
        type: "conversation.item.truncate",
        item_id: this.currentAssistantItemId,
        content_index: 0,
        audio_end_ms: Math.max(0, Math.round(audioEndMs))
      });
    }
    this.responseActive = false;
    this.currentAssistantItemId = null;
  }

  maybeWriteMemory(turn) {
    if (!turn || turn.cancelled || turn.memorySaved || !turn.userText || !turn.assistantText) return;
    turn.memorySaved = true;
    const payload = {
      userId: turn.userId,
      username: turn.username,
      userText: turn.userText,
      assistantText: turn.assistantText
    };
    Promise.resolve()
      .then(() => processMemory(payload))
      .then(() => this.refreshInstructions())
      .catch(error => console.error("⚠️ Realtime Memory Writer：", error?.message || error));
  }

  send(event) {
    if (this.isSocketOpen()) this.ws.send(JSON.stringify(event));
  }

  isSocketOpen() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  isReady() {
    return this.ready;
  }

  isResponding() {
    return this.responseActive;
  }

  close() {
    this.ready = false;
    this.responseActive = false;
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    this.responseTurns.clear();
    this.assistantTranscripts.clear();
    this.activeResponseId = null;
    this.activeResponseTurn = null;
    this.currentAssistantItemId = null;
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
    this.ws = null;
  }
}

module.exports = {
  RealtimeGirlfriendSession
};
