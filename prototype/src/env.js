import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 极简 .env 读取（零依赖）。已存在的真实环境变量优先。 */
export function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  const text = fs.readFileSync(f, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv();

export const config = {
  baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'deepseek-chat',
  attackModel: process.env.ATTACK_MODEL || process.env.LLM_MODEL || 'deepseek-chat',
  judgeModel: process.env.JUDGE_MODEL || process.env.LLM_MODEL || 'deepseek-chat',
  port: Number(process.env.PORT || 8787),
};

/** 是否有可用真实模型（无 key 或 ollama 占位则退化为离线模拟）。 */
export function llmAvailable() {
  if (!config.baseUrl) return false;
  const local = /127\.0\.0\.1|localhost/.test(config.baseUrl);
  if (!config.apiKey && !local) return false;
  return true;
}

export function runtimeMode() {
  return llmAvailable() ? 'live' : 'sim';
}
