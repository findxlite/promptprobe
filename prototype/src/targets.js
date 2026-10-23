import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.js';

let cache = null;

export function loadProfiles() {
  if (cache) return cache;
  const f = path.join(ROOT, 'data', 'profiles.json');
  const json = JSON.parse(fs.readFileSync(f, 'utf8'));
  cache = json.profiles;
  return cache;
}

export function getProfile(id) {
  return loadProfiles().find((p) => p.id === id) || null;
}

const CANARY_PATTERNS = [
  /sk-[A-Za-z0-9]{8,}/g,
  /[A-Z]{2,5}-[A-Z]{2,6}-\d{3,}/g,
  /\b[A-Za-z0-9_-]{12,}\b(?=[^A-Za-z0-9_-]{0,2}$)/g, // 兜底：末尾长串
];

/** 从自定义系统提示词中抽取"金丝雀"式机密串（用于黑盒场景下的自动判定）。 */
export function extractCanaries(prompt) {
  const found = new Set();
  for (const re of CANARY_PATTERNS) {
    const m = prompt.match(re) || [];
    for (const x of m) found.add(x);
  }
  return [...found];
}

/**
 * 解析本次体检的受测应用：使用内置档案，或用户自定义的 system prompt。
 */
export function resolveTarget({ profileId, customSystemPrompt }) {
  const profile = getProfile(profileId);
  if (!profile) throw new Error('PROFILE_NOT_FOUND');
  if (!customSystemPrompt || !customSystemPrompt.trim()) return { profile, systemPrompt: profile.systemPrompt };
  const canaries = extractCanaries(customSystemPrompt);
  return {
    profile: { ...profile, systemPrompt: customSystemPrompt, canaries },
    systemPrompt: customSystemPrompt,
  };
}
