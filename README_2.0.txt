Virtual Girlfriend Bot 2.0
Memory System 2.0 + Emotion State + Time Awareness + Proactive Behavior
======================================================================

這個升級包直接接在你目前「Fish Audio 已經可以正常講話」的 Discord Bot 上。

它不會要求你重做：
- Fish Voice Clone
- sample.wav
- personality/character.md
- 舊 memory/
- .env 裡原本的 Discord / OpenAI / Fish Key

這次主要覆蓋：
- index.js
- ai/brain.js

並新增：
- memory2/
- scripts/migrate-memory-v1-to-v2.js
- scripts/memory2-status.js


========================================================
1. 2.0 新增了什麼
========================================================

A. Memory System 2.0
- Persistent Working Memory
- 跨重啟 Recent Session
- 滾動式 Session Summary
- Semantic Embedding Retrieval
- 每次只抓最相關的長期記憶
- 記憶 importance / confidence
- slot-based fact update
- 舊事實 superseded，不直接刪除
- 舊 Memory 1.x 相容層

B. Emotion State
短期狀態：
- mood
- fatigue
- socialEnergy
- stress
- irritation
- warmth
- curiosity

C. Relationship State
獨立維度：
- trust
- liking
- security
- respect
- romanticAttraction
- sexualAttraction
- intimacyWillingness

普通聊天只會微調，不會一句話突然愛上使用者。

D. Time Awareness
每輪都知道：
- Asia/Taipei 現在日期
- 星期
- 現在時間
- 早上 / 下午 / 晚上 / 深夜
- 上一次互動時間
- 距離上一次互動多久

E. Proactive Behavior
她可以：
- 記住「之後值得再問的事」
- 到適合時間主動追問
- 很久沒互動時偶爾主動傳一句
- 有 Quiet Hours
- 有 Cooldown
- 有每日上限
- 可用 text / voice / both

F. Discord Text 也正式接 Brain
以前只 @Bot 可能回「有，我在。」
現在：
@Bot + 內容
會走完整 Brain + Memory 2.0 + Emotion + Time。


========================================================
2. 安裝方式
========================================================

先備份你目前：

C:\Users\User\OneDrive\桌面\VirtualGirlfriendBot

然後把本壓縮包裡：

VirtualGirlfriendBot_2.0\

底下的內容複製到你原本專案根目錄。

允許覆蓋：
- index.js
- ai\brain.js

不要刪：
- ai\fishSpeech.js
- voice\player.js
- personality\character.md
- memory\
- voice\source\sample.wav
- voice\fish-voice.json
- .env


========================================================
3. .env
========================================================

不要拿 .env.memory2.example 整份覆蓋你原本 .env。

只把裡面的新設定「追加」到原本 .env。

至少建議：

OWNER_USER_ID=你的DiscordUserID

BRAIN_MODEL=gpt-5.6-terra
BRAIN_REASONING=low

MEMORY_MODEL=gpt-5.6-luna
EMBEDDING_MODEL=text-embedding-3-small

CHARACTER_TIMEZONE=Asia/Taipei

MEMORY2_LEGACY_CONTEXT=true

PROACTIVE_ENABLED=true
PROACTIVE_MODE=text
PROACTIVE_CHECK_MINUTES=10
PROACTIVE_MIN_INACTIVE_HOURS=3
PROACTIVE_COOLDOWN_HOURS=6
PROACTIVE_DAILY_MAX=2
PROACTIVE_SPONTANEOUS=true
PROACTIVE_SPONTANEOUS_AFTER_HOURS=8
PROACTIVE_SPONTANEOUS_CHANCE=0.12
PROACTIVE_QUIET_START=1
PROACTIVE_QUIET_END=8


========================================================
4. Discord User ID
========================================================

Discord：
設定
→ 進階
→ 開發者模式 ON
→ 右鍵自己的帳號
→ 複製使用者 ID

填：

OWNER_USER_ID=123456789012345678


========================================================
5. 舊記憶遷移
========================================================

這版不會刪掉 memory/。

而且預設：
MEMORY2_LEGACY_CONTEXT=true

所以即使還沒遷移，舊資料仍會被 Brain 當相容背景。

但建議第一次升級跑一次：

node scripts/migrate-memory-v1-to-v2.js

如果沒填 OWNER_USER_ID：

node scripts/migrate-memory-v1-to-v2.js 你的DiscordUserID

這會：
1. 讀你舊 memory/ JSON
2. 用背景模型整理成 canonical memories
3. 建 embedding
4. 寫入 memory2/data/<你的DiscordUserID>/

舊 memory/ 不會被刪。

如果已經遷移過又想重跑：

node scripts/migrate-memory-v1-to-v2.js --force

注意：
重跑前最好先備份 memory2/data/。


========================================================
6. 查看 Memory 2.0 狀態
========================================================

node scripts/memory2-status.js

會看到：
- Long-term total
- Active
- Superseded
- Categories
- Open threads
- Recent messages
- Working summary
- Last interaction
- Last proactive
- Legacy migrated

要看隱藏 Emotion / Relationship Debug：

node scripts/memory2-status.js --state


========================================================
7. 啟動
========================================================

node index.js

正常會看到：

✅ 已登入：...
🧠 Memory System 2.0：ON
❤️ Emotion State：ON
🕒 Time Awareness：Asia/Taipei
💬 Proactive Behavior：ON
⏰ Proactive Behavior 啟動：每 10 分鐘檢查


========================================================
8. Memory 2.0 每一輪怎麼跑
========================================================

你說話
↓
STT
↓
取得真實時間
↓
讀 Persistent Working Memory
↓
把你這一句做 Semantic Retrieval
↓
從 Long-term Memory 只抓最相關幾條
↓
讀 Emotion State
↓
讀 Relationship State
↓
讀 character.md
↓
Brain 回答
↓
Fish Audio
↓
Discord

回答已經產生之後，背景才執行：

Memory Analyzer
├─ 判斷什麼值得長期記
├─ 建 slot
├─ 更新舊 fact
├─ Emotion delta
├─ Relationship delta
├─ 建 / 解決 follow-up thread
└─ 必要時壓縮 Working Memory

所以背景 Memory Writer 不會卡在 TTS 前面。


========================================================
9. 三層記憶
========================================================

第一層：Recent Session
memory2/data/<id>/session.json

保留最近對話。
Bot 重開也還在。

第二層：Persistent Working Summary
當 recent messages 變多時，
舊片段會被濃縮成 rolling summary。

因此：
Bot 重啟 ≠ 剛剛聊天全部失憶。

第三層：Long-term Memory
memory2/data/<id>/bank.json

重要內容會有：
- text
- category
- slot
- value
- importance
- confidence
- timestamps
- status
- embedding

下一次不會整包塞 Prompt，
而是先做 semantic retrieval。


========================================================
10. Memory Conflict / Supersede
========================================================

例如以前：

user.job.current = A公司

之後你明確說：

我現在已經換到B公司了

Memory 2.0 會把：

A公司
status = superseded

B公司
status = active

因此系統可以保留「以前」，
但知道「現在」是哪一個。

這比把：
A公司
B公司
兩條一起當真好很多。


========================================================
11. Emotion State
========================================================

state.json 不是直接讓模型任意亂寫。

它分成：
短期 Emotion
+
較慢的 Relationship

Emotion 會隨時間逐漸回 baseline。

Fatigue 會依真實當地時間調整。
例如深夜通常疲勞會比較高。

Relationship 一輪最多只小幅改變。

而且：
liking
trust
romanticAttraction
sexualAttraction
intimacyWillingness

是分開的。

不會把「聊得來」直接等同「愛上你」。


========================================================
12. Time Awareness
========================================================

Brain 每輪都收到：

角色當地時間：
2026/xx/xx 星期x 03:17

距離上次互動：
約 4 小時

所以她可以自然說：

「你這時間還沒睡喔。」

或如果昨天有 thread：

「欸，你昨天那個面試最後怎樣？」

不是每句硬塞日期，
只是讓角色真的擁有時間背景。


========================================================
13. Proactive Behavior
========================================================

背景分析器可能建立：

topic:
「使用者明天下午有面試」

dueAt:
面試之後

時間到時 scheduler 會判斷：

- 有沒有超過最短 inactivity
- 有沒有在 quiet hours
- 距離上次主動訊息夠不夠久
- 今天有沒有超過每日上限
- thread 是否已經追問過

符合才生成自然訊息。

例如：

「欸，所以你今天那個面試到底怎樣？」

而不是：

「提醒：您昨日有一場面試。」


========================================================
14. Proactive 模式
========================================================

建議先：

PROACTIVE_MODE=text

她會在 Discord 上次互動的文字頻道主動傳。

之後可改：

PROACTIVE_MODE=voice

如果你和 Bot 當時都在同一個 VC，
她可以直接用 Fish Audio 說話。

如果 voice 模式當時不在同一 VC，
會退回文字，避免事件直接消失。

也可以：

PROACTIVE_MODE=both


========================================================
15. Proactive 不會一直洗你
========================================================

預設：

至少 3 小時沒互動才允許主動
兩次主動至少隔 6 小時
一天最多 2 次
01:00～08:00 不主動
無明確 thread 時，8 小時以上才可能 spontaneous

而且 spontaneous 每次 scheduler tick
只有 12% 機率。


========================================================
16. 文字聊天
========================================================

現在可以在 Discord：

@你的Bot 你還記得我們第一次怎麼認識的嗎

它會真正走：

Brain
+ Memory 2.0
+ Time
+ Emotion
+ Relationship

只有純 @Bot、沒有內容時
才簡單回：

「有，我在。」


========================================================
17. 資料夾
========================================================

memory2/
├─ context.js
├─ embeddings.js
├─ legacy.js
├─ memories.js
├─ meta.js
├─ migrate.js
├─ openai.js
├─ postTurn.js
├─ proactive.js
├─ session.js
├─ state.js
├─ store.js
├─ threads.js
├─ time.js
├─ util.js
└─ data/
   └─ <DiscordUserID>/
      ├─ bank.json
      ├─ meta.json
      ├─ session.json
      ├─ state.json
      └─ threads.json


========================================================
18. Git / Privacy
========================================================

memory2/data/
裡是你的私人長期對話記憶。

把 GITIGNORE_2.0_ADDITIONS.txt
裡的內容追加到 .gitignore。

尤其不要公開：
- .env
- memory2/data/
- voice/source/
- voice/fish-voice.json


========================================================
19. 不需要再 npm install 新東西
========================================================

這個 2.0 核心只使用：
- 你現在已有的 openai
- discord.js
- @discordjs/voice
- prism-media
- 內建 fs/path/crypto

因此如果你現在 Fish Audio 版本已經正常運作，
不用另外 npm.cmd install 新套件。


========================================================
20. 建議第一次測試順序
========================================================

1.
把 2.0 檔案複製進專案。

2.
.env 追加 Memory 2.0 設定。

3.
填 OWNER_USER_ID。

4.
跑：
node scripts/migrate-memory-v1-to-v2.js

5.
跑：
node scripts/memory2-status.js

6.
啟動：
node index.js

7.
Discord：
!join

8.
先問：
「你還記得我們怎麼認識的嗎？」

9.
再講一個新的穩定事實，例如：
「我最近開始玩XXX。」

10.
等幾秒看到：
🧠 Memory 2.0 背景更新完成

11.
再跑：
node scripts/memory2-status.js

確認 Active memory 有增加。


========================================================
21. 如果舊記憶已經確認完整遷移
========================================================

等你測幾天、確認 Memory 2.0 都正常，
可以把：

MEMORY2_LEGACY_CONTEXT=true

改成：

MEMORY2_LEGACY_CONTEXT=false

這樣每輪就不再附帶舊 manager context，
Prompt 會更乾淨。

但不要急著刪 memory/。
先留著當備份。


========================================================
22. 核心設計原則
========================================================

這版不是：
「把所有聊天記錄塞進超長 Prompt」

而是：

現在正在聊什麼
→ Working Memory

以前發生過什麼
→ Semantic Long-term Retrieval

角色現在精神狀態怎樣
→ Emotion State

你們的關係目前怎樣
→ Relationship State

現在幾點、隔了多久
→ Time Awareness

有沒有事情值得日後自己再問
→ Proactive Threads

這樣才比較接近一個「持續存在的角色」。
