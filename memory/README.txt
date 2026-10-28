Virtual Girlfriend Memory Pack

這份資料包由目前的 ChatGPT「虛擬女友」Project 記憶快照拆分而成。

檔案用途：
- profile.json：角色核心設定、互動後形成的人物資料、尚未確立的身份欄位
- relationship.json：目前關係階段與關係相關未解決事項
- user_memory.json：角色已知的使用者資料
- npcs.json：已建立 NPC 與 NPC 狀態
- timeline.json：共同事件時間線
- memory_index.json：依 importance / confidence 保存的重要記憶
- unresolved_threads.json：尚未確認、尚未延續或不應擅自補造的資訊
- recent_context.json：最近一段互動的銜接摘要
- archive/snapshot.json：原始完整快照，作為不可丟失的來源檔

建議 Bot 載入策略：
1. 每次回覆固定載入 profile.json + relationship.json + recent_context.json。
2. user_memory.json 視需要載入。
3. timeline.json / memory_index.json 只取高 importance 或與當前話題相關項目。
4. unresolved_threads.json 用來防止模型擅自補造角色名字、年齡、性取向等尚未確立資料。
5. archive/snapshot.json 不要每次整份送進 API；保留作為查證與回溯來源。

重要：
目前快照明確指出角色名字、確切年齡、生日、性取向、工作/學業等仍不可確認，
所以 Discord 版不應自行重建或擅自補造這些欄位。
