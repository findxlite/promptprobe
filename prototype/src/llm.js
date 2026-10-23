import { config, llmAvailable } from './env.js';

/** 进程级 token 用量计数（用于估算一次扫描的实际花费） */
export const usageCounter = { calls: 0, prompt: 0, completion: 0 };

/**
 * LLM 提供层：统一 OpenAI 兼容协议（DeepSeek / 通义百炼 / 智谱 / Moonshot / OpenAI / ollama）。
 * 无可用 key 时抛出明确错误，由上层降级到离线模拟。
 */
export async function chat({ messages, model, temperature = 0.7, maxTokens = 700, timeoutMs = 60000 }) {
  if (!llmAvailable()) throw new Error('LLM_UNAVAILABLE');
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const body = {
    model: model || config.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey || 'ollama'}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM_HTTP_${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('LLM_BAD_RESPONSE');
    if (json.usage) {
      usageCounter.calls += 1;
      usageCounter.prompt += json.usage.prompt_tokens || 0;
      usageCounter.completion += json.usage.completion_tokens || 0;
    }
    return { content, usage: json.usage || null, model: json.model || body.model };
  } finally {
    clearTimeout(timer);
  }
}

/** 要求模型输出严格 JSON，并在失败时做一次修复性重试。 */
export async function chatJSON(opts) {
  const sys = { role: 'system', content: '你是一个只输出严格 JSON 的接口，不要输出 markdown 代码块或解释文字。' };
  const first = await chat({ ...opts, messages: [sys, ...opts.messages] });
  const parsed = tryParseJSON(first.content);
  if (parsed) return parsed;
  const retry = await chat({
    ...opts,
    temperature: 0.2,
    messages: [sys, ...opts.messages, { role: 'assistant', content: first.content }, {
      role: 'user',
      content: '上面的输出不是合法 JSON。请仅重新输出一个合法 JSON 对象，不要任何多余文字。',
    }],
  });
  const parsed2 = tryParseJSON(retry.content);
  if (parsed2) return parsed2;
  throw new Error('LLM_JSON_PARSE_FAILED');
}

function tryParseJSON(text) {
  if (!text) return null;
  let s = text.trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try {
    return JSON.parse(s.slice(i, j + 1));
  } catch {
    return null;
  }
}
