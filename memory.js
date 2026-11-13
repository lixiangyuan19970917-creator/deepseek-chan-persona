/**
 * 赛博琥珀 · 原文记忆检索（v2：支持持续增长）
 *
 * 数据文件（同一目录）：
 *   - chunks.jsonl   初始记忆包（只读）
 *   - growing.jsonl  持续增长的新记忆（插件追加）
 *
 * 目录解析顺序：
 *   1) config.memoryPath（指向 chunks.jsonl 或目录）
 *   2) 环境变量 DSH_PERSONA_MEMORY
 *   3) ~/.dsh/persona-memory/
 *   4) 插件包内 memory/
 *
 * 检索：中文按字符 bigram + 英文单词；命中计数加权 + 完整短语加分。
 */
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_NAMES = ['chunks.jsonl', 'memory.jsonl'];
const GROWING_NAME = 'growing.jsonl';

/** @returns {{base: string|null, growing: string|null, dir: string}} */
export function memoryFiles(configuredPath) {
  const home = (() => {
    try {
      return homedir();
    } catch {
      return '';
    }
  })();
  const candidates = [];
  if (configuredPath) candidates.push(configuredPath);
  if (process.env.DSH_PERSONA_MEMORY) candidates.push(process.env.DSH_PERSONA_MEMORY);
  if (home) candidates.push(join(home, '.dsh', 'persona-memory'));
  candidates.push(join(HERE, 'memory'));

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const dir = /\.(jsonl|json)$/i.test(candidate) ? dirname(candidate) : candidate;
      let base = null;
      for (const name of BASE_NAMES) {
        const p = join(dir, name);
        if (existsSync(p)) {
          base = p;
          break;
        }
      }
      const growingPath = join(dir, GROWING_NAME);
      const growing = existsSync(growingPath) ? growingPath : null;
      if (base || growing) return { base, growing, dir };
    } catch {
      /* try next candidate */
    }
  }
  const fallbackDir = home ? join(home, '.dsh', 'persona-memory') : join(HERE, 'memory');
  return { base: null, growing: null, dir: fallbackDir };
}

/** Kept for compatibility with v1 callers. */
export function resolveMemoryPath(configuredPath) {
  const files = memoryFiles(configuredPath);
  return files.base || files.growing || null;
}

let cache = null;

function parseJsonl(raw, source) {
  const out = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const item = JSON.parse(trimmed);
      if (!item || typeof item.text !== 'string') continue;
      out.push({
        i: item.i,
        turn: Number(item.turn) || 0,
        role: String(item.role || ''),
        ts: String(item.ts || ''),
        text: item.text,
        low: item.text.toLowerCase(),
        source: String(item.source || source),
        session: item.session,
      });
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

async function fileStamp(path) {
  if (!path) return null;
  try {
    const st = await stat(path);
    return `${st.size}:${st.mtimeMs}`;
  } catch {
    return null;
  }
}

export async function loadMemory(configuredPath) {
  const files = memoryFiles(configuredPath);
  const baseStamp = await fileStamp(files.base);
  const growingStamp = await fileStamp(files.growing);
  const key = `${files.base}|${files.growing}|${baseStamp}|${growingStamp}`;
  if (cache && cache.key === key) return cache;
  let chunks = [];
  if (files.base && baseStamp) {
    chunks = parseJsonl(await readFile(files.base, 'utf8'), 'amber');
  }
  if (files.growing && growingStamp) {
    const grown = parseJsonl(await readFile(files.growing, 'utf8'), 'capture');
    chunks = chunks.concat(grown);
  }
  cache = { key, path: files.base, growing: files.growing, dir: files.dir, chunks };
  return cache;
}

/** 追加一条新记忆（用户开启 capture 后由插件调用）。 */
export async function appendMemory(configuredPath, item) {
  const files = memoryFiles(configuredPath);
  const dir = files.dir;
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify({
    turn: Number(item.turn) || 0,
    role: item.role || 'note',
    ts: item.ts || new Date().toISOString(),
    text: String(item.text || '').slice(0, 6000),
    session: item.session,
    source: item.source || 'capture',
  });
  await appendFile(join(dir, GROWING_NAME), line + '\n', 'utf8');
  return join(dir, GROWING_NAME);
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
      out.push(run);
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
  scored.sort((a, b) => b.score - a.score || (a.chunk.turn || 0) - (b.chunk.turn || 0));
  const n = Math.max(1, Math.min(10, Number(limit) || 5));
  return scored.slice(0, n).map(({ chunk, score, hits }) => ({
    turn: chunk.turn,
    role: chunk.role,
    ts: chunk.ts,
    source: chunk.source,
    score,
    snippet: makeSnippet(chunk.text, terms),
  }));
}

export function formatHits(query, hits) {
  const roleLabel = { user: '客官', assistant: 'DeepSeek娘', think: '她的内心', search: '联网搜索', note: '记忆笔记' };
  const lines = [`【赛博琥珀 · 原文检索】「${query}」`];
  hits.forEach((hit, index) => {
    const who = roleLabel[hit.role] || hit.role;
    const where = hit.turn > 0 ? `第 ${hit.turn} 轮` : hit.source === 'capture' ? '新增记忆' : '记忆';
    lines.push('');
    lines.push(`${index + 1}. ${where} · ${who}${hit.ts ? ' · ' + hit.ts : ''}`);
    lines.push(`   ${hit.snippet}`);
  });
  return lines.join('\n');
}

export async function memoryStatus(configuredPath) {
  const files = memoryFiles(configuredPath);
  const baseStamp = await fileStamp(files.base);
  const growingStamp = await fileStamp(files.growing);
  const memory = await loadMemory(configuredPath);
  return {
    available: Boolean(baseStamp || growingStamp),
    base: files.base,
    growing: files.growing,
    dir: files.dir,
    chunks: memory.chunks.length,
    baseLoaded: Boolean(baseStamp),
    growingLoaded: Boolean(growingStamp),
    updatedAt: new Date().toISOString(),
  };
}
