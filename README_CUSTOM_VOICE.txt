Virtual Girlfriend Bot — Custom Voice Upgrade
=============================================

這份升級包會保留你現在的 Realtime speech-to-speech 架構，
只把內建 marin / sage 換成 OpenAI Custom Voice。

重要：
Custom Voices 目前只對符合資格的 OpenAI 客戶開放。
如果建立 Voice 時收到 403 / not eligible，通常代表 API 組織尚未取得這項功能。

一、覆蓋 / 新增檔案
-------------------
覆蓋：
- index.js
- realtime/client.js
- voice/player.js

新增：
- scripts/create-custom-voice.js

不要刪除：
- .env
- memory/ 內所有 JSON
- memory/manager.js
- memory/writer.js
- personality/character.md
- ai/brain.js

二、準備錄音
------------
建立：
voice/source/

放入：
- voice/source/consent.wav
- voice/source/sample.wav

consent.wav：
由聲音本人親自錄製 OpenAI 要求的同意語句，明確同意建立 Custom Voice。

sample.wav：
同一位聲音本人的乾淨聲音樣本。建議自然台灣華語、平常聊天聲線、無背景音樂、無其他人聲。

API 上傳限制：每個檔案最大 10 MiB。
支援 mp3 / wav / ogg / aac / flac / webm / mp4。

三、把以下設定追加到你原本的 .env
---------------------------------
REALTIME_MODEL=gpt-realtime-1.5
REALTIME_VOICE=marin
VOICE_CONSENT_FILE=voice/source/consent.wav
VOICE_SAMPLE_FILE=voice/source/sample.wav
VOICE_NAME=Virtual Girlfriend
VOICE_LANGUAGE=zh-TW
CUSTOM_VOICE_ID=

不要刪掉原本的 DISCORD_TOKEN 和 OPENAI_API_KEY。

四、建立 Custom Voice
---------------------
在專案根目錄執行：

node scripts/create-custom-voice.js

成功時會出現：
✅ Consent ID：cons_...
✅ Voice ID：voice_...
🎉 Custom Voice 建立完成

程式會自動建立：
voice/voice-config.json

五、啟動 Bot
------------
node index.js

然後 Discord：
!join

成功時 PowerShell 會顯示：
🎤 Realtime Voice：custom:voice_...
✅ Realtime Ready｜gpt-realtime-1.5｜voice=custom:voice_...

六、Voice 優先順序
------------------
client.js 依序使用：
1. .env 的 CUSTOM_VOICE_ID
2. voice/voice-config.json 的 voiceId
3. REALTIME_VOICE
4. marin

七、注意
--------
- 不要把 API Key 或 Discord Token 傳給任何人。
- 不要把 consent.wav / sample.wav 公開上傳到 GitHub。
- Custom Voice 必須使用聲音本人明確同意的素材。
- 如果收到 403 / not eligible，先不用亂改程式，代表很可能是帳號功能資格問題。
