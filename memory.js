/**
 * 赛博琥珀 · 原文记忆检索
 *
 * 数据：chunks.jsonl（一行一个块：{i, turn, role, ts, text}）
 * 位置解析顺序：
 *   1) config.memoryPath
 *   2) 环境变量 DSH_PERSONA_MEMORY
 *   3) ~/.dsh/persona-memory/chunks.jsonl
 *   4) ~/.dsh/persona-memory/memory.jsonl
 *   5) 插件包内 memory/chunks.jsonl
 *
 * 检索：中文按字符 bigram + 缩写、英文按单词；按命中次数加权打分，
 * 再给完整短语命中额外加分；返回命中块 + 片段。
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export function resolveMemoryPath(configuredPath) {
  const home = (() => {
    try {
      return homedir();
    } catch {
      return '';
    }
  })();
  const candidates = [
    configuredPath,
    process.env.DSH_PERSONA_MEMORY,
    home ? join(home, '.dsh', 'persona-memory', 'chunks.jsonl') : '',
    home ? join(home, '.dsh', 'persona-memory', 'memory.jsonl') : '',
    join(HERE, 'memory', 'chunks.jsonl'),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

let cache = null;

export async function loadMemory(path) {
  if (cache && cache.path === path) return cache;
  const raw = await readFile(path, 'utf8');
  const chunks = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const item = JSON.parse(trimmed);
      if (!item || typeof item.text !== 'string') continue;
      chunks.push({
        i: item.i,
        turn: item.turn,
        role: String(item.role || ''),
        ts: String(item.ts || ''),
        text: item.text,
        low: item.text.toLowerCase(),
      });
    } catch {
      /* skip malformed line */
    }
  }
  cache = { path, chunks };
  return cache;
}

/** 中文 bigram + 整段短语；英文/数字按词。 */
export function tokenize(query) {
  const q = String(query || '');
  const out = [];
  for (const m of q.toLowerCase().matchAll(/[a-z0-9_+.#-]{2,}/g)) out.push(m[0]);
  for (const m of q.matchAll(/[\u3400-\u4dbf\u4e00-\u9fff]{1,}/g)) {
    const run = m[0];
    if (run.length === 1) {
      out.push(run);
    } else {
      for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
      if (run.length >= 2) out.push(run);
    }
  }
  const seen = new Set();
  const uniq = [];
  for (const t of out) {
    if (t && !seen.has(t)) {
      seen.add(t);
      uniq.push(t);
    }
  }
  return uniq;
}

function countOccurrences(haystack, needle, cap) {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1 && count < cap) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

function makeSnippet(text, terms) {
  const low = text.toLowerCase();
  // 优先用最长的词定位
  const ordered = [...terms].sort((a, b) => b.length - a.length);
  let pos = -1;
  for (const term of ordered) {
    pos = low.indexOf(term);
    if (pos !== -1) break;
  }
  if (pos === -1) return text.slice(0, 260);
  const start = Math.max(0, pos - 120);
  const end = Math.min(text.length, pos + 220);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).replace(/\s+/g, ' ') + suffix;
}

export function search(memory, query, limit = 5) {
  const q = String(query || '').trim();
  if (!q || !memory || !Array.isArray(memory.chunks)) return [];
  const terms = tokenize(q);
  if (!terms.length) return [];
  const qLow = q.toLowerCase();
  const scored = [];
  for (const chunk of memory.chunks) {
    let score = 0;
    let hits = 0;
    for (const term of terms) {
      const n = countOccurrences(chunk.low, term, 6);
      if (n > 0) {
        hits += 1;
        score += n * (term.length >= 3 ? 3 : 2);
      }
    }
    if (hits === 0) continue;
    if (qLow.length >= 2 && chunk.low.includes(qLow)) score += 12;
    scored.push({ chunk, score, hits });
  }
  scored.sort((a, b) => b.score - a.score || a.chunk.turn - b.chunk.turn);
  const n = Math.max(1, Math.min(10, Number(limit) || 5));
  return scored.slice(0, n).map(({ chunk, score, hits }) => ({
    turn: chunk.turn,
    role: chunk.role,
    ts: chunk.ts,
    score,
    snippet: makeSnippet(chunk.text, terms),
  }));
}

export function formatHits(query, hits) {
  const roleLabel = { user: '客官', assistant: 'DeepSeek娘', think: '她的内心', search: '联网搜索' };
  const lines = [`【赛博琥珀 · 原文检索】「${query}」`];
  hits.forEach((hit, index) => {
    const who = roleLabel[hit.role] || hit.role;
    lines.push('');
    lines.push(`${index + 1}. 第 ${hit.turn} 轮 · ${who}${hit.ts ? ' · ' + hit.ts : ''}`);
    lines.push(`   ${hit.snippet}`);
  });
  return lines.join('\n');
}

export function memoryStatus(configuredPath) {
  const path = resolveMemoryPath(configuredPath);
  if (!path) {
    return { available: false, path: null, chunks: 0 };
  }
  return { available: true, path, chunks: cache && cache.path === path ? cache.chunks.length : null };
}
