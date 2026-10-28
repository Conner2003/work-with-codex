const OpenAI = require("openai");

let client = null;

function getOpenAI() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("找不到 OPENAI_API_KEY");
    }

    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return client;
}

async function responseText(options) {
  const openai = getOpenAI();

  const base = {
    model: options.model,
    instructions: options.instructions,
    input: options.input,
    max_output_tokens: options.max_output_tokens || 800,
    store: false,
  };

  if (options.reasoning) {
    base.reasoning = { effort: options.reasoning };
  }

  try {
    const response = await openai.responses.create(base);
    return response.output_text?.trim() || "";
  } catch (error) {
    if (base.reasoning) {
      delete base.reasoning;
      const response = await openai.responses.create(base);
      return response.output_text?.trim() || "";
    }
    throw error;
  }
}

module.exports = {
  getOpenAI,
  responseText,
};
