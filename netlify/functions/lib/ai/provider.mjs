import { validateRecommendation } from './schema.mjs';

function extractJson(text) {
  if (typeof text !== 'string') return text;
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(trimmed);
}

export async function callCompatibleProvider({ systemPrompt, input, fetchImpl = fetch, env = process.env }) {
  if (!env.AI_API_KEY) throw new Error('AI_API_KEY is missing');
  if (!env.AI_MODEL) throw new Error('AI_MODEL is missing');

  const baseUrl = (env.AI_BASE_URL || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('AI_BASE_URL is missing');
  const timeoutMs = Number(env.AI_TIMEOUT_MS || 12000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.AI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(input) }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AI provider returned ${response.status}: ${body.slice(0, 240)}`);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    return validateRecommendation(extractJson(content));
  } finally {
    clearTimeout(timeout);
  }
}

export function getProvider(env = process.env) {
  const provider = env.AI_PROVIDER || 'compatible';
  if (provider !== 'compatible') throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  return { name: provider, generate: (args) => callCompatibleProvider({ ...args, env }) };
}
