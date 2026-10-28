const {
  readUserFile,
  writeUserFile,
  withUserLock,
} = require("./store");

const { clamp, nowIso, hoursBetween } = require("./util");
const { zonedParts } = require("./time");

function defaultState() {
  return {
    version: 2,
    updatedAt: nowIso(),

    emotion: {
      mood: 52,
      fatigue: 35,
      socialEnergy: 52,
      stress: 18,
      irritation: 6,
      warmth: 44,
      curiosity: 55,
    },

    relationship: {
      trust: 40,
      liking: 42,
      security: 38,
      respect: 48,
      romanticAttraction: 6,
      sexualAttraction: 4,
      intimacyWillingness: 18,
    },
  };
}

function circadianFatigue(hour) {
  if (hour < 5) return 84;
  if (hour < 7) return 68;
  if (hour < 9) return 48;
  if (hour < 12) return 30;
  if (hour < 15) return 43;
  if (hour < 19) return 34;
  if (hour < 22) return 43;
  return 62;
}

function moveToward(value, target, fraction) {
  return value + (target - value) * fraction;
}

function decayState(state) {
  const now = new Date();
  const elapsed = hoursBetween(state.updatedAt, now);

  if (elapsed === null || elapsed <= 0) return state;

  const emotionalBlend = 1 - Math.exp(-elapsed / 16);
  const irritationBlend = 1 - Math.exp(-elapsed / 5);
  const fatigueBlend = 1 - Math.exp(-elapsed / 3);

  state.emotion.mood = moveToward(state.emotion.mood, 52, emotionalBlend);
  state.emotion.socialEnergy = moveToward(state.emotion.socialEnergy, 52, emotionalBlend);
  state.emotion.stress = moveToward(state.emotion.stress, 16, emotionalBlend);
  state.emotion.irritation = moveToward(state.emotion.irritation, 5, irritationBlend);
  state.emotion.warmth = moveToward(state.emotion.warmth, 44, emotionalBlend * 0.35);
  state.emotion.curiosity = moveToward(state.emotion.curiosity, 52, emotionalBlend * 0.5);

  const hour = zonedParts(now).hour;
  state.emotion.fatigue = moveToward(
    state.emotion.fatigue,
    circadianFatigue(hour),
    fatigueBlend
  );

  for (const key of Object.keys(state.emotion)) {
    state.emotion[key] = Math.round(clamp(state.emotion[key], 0, 100));
  }

  for (const key of Object.keys(state.relationship)) {
    state.relationship[key] = Math.round(clamp(state.relationship[key], 0, 100));
  }

  state.updatedAt = nowIso();
  return state;
}

async function getState(userId) {
  return withUserLock(userId, async () => {
    const state = decayState(
      readUserFile(userId, "state.json", defaultState())
    );

    writeUserFile(userId, "state.json", state);
    return state;
  });
}

async function applyDeltas(userId, emotionDelta = {}, relationshipDelta = {}) {
  return withUserLock(userId, async () => {
    const state = decayState(
      readUserFile(userId, "state.json", defaultState())
    );

    for (const [key, raw] of Object.entries(emotionDelta || {})) {
      if (!(key in state.emotion)) continue;

      const delta = clamp(raw, -10, 10);
      state.emotion[key] = Math.round(
        clamp(state.emotion[key] + delta, 0, 100)
      );
    }

    for (const [key, raw] of Object.entries(relationshipDelta || {})) {
      if (!(key in state.relationship)) continue;

      const delta = clamp(raw, -3, 3);
      state.relationship[key] = Math.round(
        clamp(state.relationship[key] + delta, 0, 100)
      );
    }

    state.updatedAt = nowIso();
    writeUserFile(userId, "state.json", state);

    return state;
  });
}

function statePrompt(state) {
  return [
    "【隱藏角色狀態｜只能影響表現，不可直接向使用者報數值】",
    `情緒：mood=${state.emotion.mood}, fatigue=${state.emotion.fatigue}, socialEnergy=${state.emotion.socialEnergy}, stress=${state.emotion.stress}, irritation=${state.emotion.irritation}, warmth=${state.emotion.warmth}, curiosity=${state.emotion.curiosity}`,
    `關係：trust=${state.relationship.trust}, liking=${state.relationship.liking}, security=${state.relationship.security}, respect=${state.relationship.respect}, romanticAttraction=${state.relationship.romanticAttraction}, sexualAttraction=${state.relationship.sexualAttraction}, intimacyWillingness=${state.relationship.intimacyWillingness}`,
    "規則：這些是角色內部模擬狀態，不要逐項說出；不要因單一普通互動突然大幅改變感情或關係。",
  ].join("\n");
}

module.exports = {
  defaultState,
  getState,
  applyDeltas,
  statePrompt,
};
