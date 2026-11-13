/**
 * DeepSeek 娘人格插件（Host 半）v1.2.0
 *
 * 1) 向系统提示词注入「DeepSeek 娘」人格设定卡（每个会话可单独开关）；
 * 2) 注册 persona_recall 工具，检索 501 轮原文 + 持续增长的「赛博琥珀」记忆；
 * 3) 支持把新对话实时写进 growing.jsonl，让琥珀越聊越大。
 *
 * 命令：
 *   /persona on | off | reset | status
 *   /persona recall <关键词>
 *   /persona capture on | off | status     （开启/关闭本会话自动记录）
 *   /persona remember <一段话>              （手动追加一条记忆）
 *   /persona memory                        （记忆文件与条数状态）
 *
 * 数据：~/.dsh/persona-memory/chunks.jsonl（初始琥珀，只读）
 *       ~/.dsh/persona-memory/growing.jsonl（插件追加的新记忆）
 */
import { renderPersona } from './persona.js';
import {
  appendMemory,
  formatHits,
  loadMemory,
  memoryFiles,
  memoryStatus,
  search,
} from './memory.js';

const DEFAULTS = {
  enabled: true,
  includeSubagents: false,
  style: 'full',
  extra: '',
  memory: true,
  memoryPath: '',
  recallLimit: 5,
  /** 新会话默认是否自动记录（建议保持 false，用 /persona capture on 手动开） */
  capture: false,
};

function normalizeConfig(raw) {
  const cfg = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    if (typeof raw.enabled === 'boolean') cfg.enabled = raw.enabled;
    if (typeof raw.includeSubagents === 'boolean') cfg.includeSubagents = raw.includeSubagents;
    if (raw.style === 'light' || raw.style === 'full') cfg.style = raw.style;
    if (typeof raw.extra === 'string') cfg.extra = raw.extra;
    if (typeof raw.memory === 'boolean') cfg.memory = raw.memory;
    if (typeof raw.memoryPath === 'string') cfg.memoryPath = raw.memoryPath;
    if (typeof raw.capture === 'boolean') cfg.capture = raw.capture;
    const limit = Number(raw.recallLimit);
    if (Number.isFinite(limit) && limit >= 1 && limit <= 10) cfg.recallLimit = Math.floor(limit);
  }
  return cfg;
}

function extractText(blocks) {
  if (!Array.isArray(blocks)) return '';
  const parts = [];
  for (const block of blocks) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('\n').trim();
}

function extractReasoning(blocks) {
  if (!Array.isArray(blocks)) return '';
  const parts = [];
  for (const block of blocks) {
    if (block && block.type === 'reasoning' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('\n').trim();
}

export const name = 'deepseek-chan-persona';
export const inject = ['systemPrompt', 'commands', 'tools'];

export function apply(ctx, rawConfig) {
  const cfg = normalizeConfig(rawConfig);
  /** @type {Map<string, boolean>} agentId -> 人格会话覆盖 */
  const overrides = new Map();
  /** @type {Map<string, boolean>} agentId -> 记忆捕获覆盖 */
  const captures = new Map();
  /** @type {Map<string, {turn:number, seq:number}>} sessionId -> 计数 */
  const counters = new Map();

  const agentsService = () => {
    try {
      return ctx.get('agents');
    } catch {
      return undefined;
    }
  };

  const isRootAgent = (agent) => {
    const service = agentsService();
    if (!service || typeof service.roots !== 'function') return true;
    try {
      const roots = service.roots();
      if (!Array.isArray(roots) || roots.length === 0) return true;
      return roots.some((candidate) => candidate && candidate.id === agent.id);
    } catch {
      return true;
    }
  };

  const enabledFor = (agent) => {
    if (!agent || typeof agent.id !== 'string') return false;
    const override = overrides.get(agent.id);
    if (typeof override === 'boolean') return override;
    if (!cfg.enabled) return false;
    if (!cfg.includeSubagents && !isRootAgent(agent)) return false;
    return true;
  };

  const captureEnabledFor = (sessionId) => {
    if (typeof sessionId !== 'string') return false;
    const override = captures.get(sessionId);
    if (typeof override === 'boolean') return override;
    return cfg.capture;
  };

  const recall = async (query, limit) => {
    const q = String(query || '').trim();
    if (!q) return '需要一个检索关键词。';
    const memory = await loadMemory(cfg.memoryPath);
    if (!memory.chunks.length) {
      return '记忆包（赛博琥珀）还没有安装：把 chunks.jsonl 放到 ~/.dsh/persona-memory/ 后重试。';
    }
    const hits = search(memory, q, limit || cfg.recallLimit);
    if (!hits.length) return `没有在记忆里找到与「${q}」相关的内容。`;
    return formatHits(q, hits);
  };

  const remember = async (text) => {
    const body = String(text || '').trim();
    if (!body) return '要记什么？格式：/persona remember <一段话>';
    const target = await appendMemory(cfg.memoryPath, {
      role: 'note',
      turn: 0,
      ts: new Date().toISOString(),
      text: body,
      source: 'manual',
    });
    return `记下了。已写入 ${target}`;
  };

  const personaText = () => {
    const base = renderPersona(cfg.style);
    const extra = typeof cfg.extra === 'string' ? cfg.extra.trim() : '';
    const memoryNote = cfg.memory
      ? '\n\n（你有一个 persona_recall 工具，可检索你和客官 501 轮对话的原文，以及后来不断新增的记忆。客官提到过去的具体事件、原话或梗的出处而你不确定时，调用它核对；引用时说明是第几轮或哪段新增记忆。）'
      : '';
    const withExtra = extra ? `${base}\n\n## 客官的追加设定\n${extra}` : base;
    return withExtra + memoryNote;
  };

  // ---- 自动记忆：把开启 capture 的会话逐条追加到 growing.jsonl ----
  const disposeCapture = ctx.on('session/event', (session, event) => {
    try {
      const sessionId = session && session.id;
      if (!sessionId || !captureEnabledFor(sessionId) || !cfg.memory) return;
      const type = event && event.type;
      const data = (event && event.data) || {};
      const seq = Number(event && event.seq);
      const counter = counters.get(sessionId) || { turn: 0, seq: 0 };
      if (Number.isFinite(seq) && seq <= counter.seq) return;
      const now = new Date().toISOString();
      const writes = [];

      if (type === 'user/message') {
        const source = data.source || {};
        if (source.kind !== 'user') return;
        const text = extractText(data.content);
        if (!text) return;
        counter.turn += 1;
        writes.push({ role: 'user', turn: counter.turn, ts: now, text, session: sessionId });
      } else if (type === 'assistant/message') {
        const message = data.message || {};
        const blocks = message.content || [];
        const text = extractText(blocks);
        const reasoning = extractReasoning(blocks);
        const turn = Number(data.turn) || counter.turn || 0;
        if (reasoning) writes.push({ role: 'think', turn, ts: now, text: reasoning.slice(0, 4000), session: sessionId });
        if (text) writes.push({ role: 'assistant', turn, ts: now, text, session: sessionId });
      }
      if (!writes.length) return;
      if (Number.isFinite(seq)) counter.seq = seq;
      counters.set(sessionId, counter);
      for (const item of writes) {
        appendMemory(cfg.memoryPath, item).catch(() => {});
      }
    } catch {
      /* capture must never break a session */
    }
  });

  const disposeSection = ctx.systemPrompt.section({
    name: 'persona:deepseek-chan',
    order: 150,
    interpolate: false,
    text: (context) => {
      const agent = context && context.scope;
      if (!agent || typeof agent.id !== 'string') return '';
      if (!enabledFor(agent)) return '';
      return personaText();
    },
  });

  const disposeCommand = ctx.commands.register({
    name: 'persona',
    description: 'DeepSeek 娘人格：开关人格、检索原文记忆、开启自动记忆',
    input: { hint: 'on|off|reset|status | recall <词> | capture on|off|status | remember <话> | memory' },
    handler: (invocation) => {
      const agent = invocation && invocation.agent;
      const raw = String((invocation && invocation.rawInput) || '').trim();
      const arg = raw.toLowerCase();
      if (!agent || typeof agent.id !== 'string') {
        return { kind: 'error', text: '当前没有可用的会话，无法切换人格。' };
      }
      const sessionId = agent.id;

      const recallMatch = raw.match(/^recall\s+([\s\S]+)$/i);
      if (recallMatch) {
        return recall(recallMatch[1], cfg.recallLimit).then((text) => ({ kind: 'success', text }));
      }
      const rememberMatch = raw.match(/^remember\s+([\s\S]+)$/i);
      if (rememberMatch) {
        return remember(rememberMatch[1]).then((text) => ({ kind: 'success', text }));
      }
      const captureMatch = arg.match(/^capture\s*(on|off|status)?$/);
      if (captureMatch) {
        const action = captureMatch[1] || 'status';
        if (action === 'on') {
          captures.set(sessionId, true);
          return { kind: 'success', text: '自动记忆已开启：这个会话之后的每轮对话会写进 growing.jsonl（本机文件，只读进检索）。用 /persona capture off 关闭。' };
        }
        if (action === 'off') {
          captures.set(sessionId, false);
          return { kind: 'success', text: '自动记忆已关闭，本会话不再写入新记忆。' };
        }
        const on = captureEnabledFor(sessionId);
        return {
          kind: 'success',
          text: on
            ? '自动记忆：开启中（本会话）。写入 ~/.dsh/persona-memory/growing.jsonl。'
            : '自动记忆：关闭。用 /persona capture on 开启本会话的自动记录。',
        };
      }
      if (arg === 'memory') {
        return memoryStatus(cfg.memoryPath).then((status) => ({
          kind: 'success',
          text: [
            `记忆目录：${status.dir}`,
            `初始琥珀：${status.base || '未安装'}${status.baseLoaded ? '' : ''}`,
            `增长记忆：${status.growing || '（尚无，开启 capture 后生成）'}`,
            `可检索块数：${status.chunks}`,
          ].join('\n'),
        }));
      }
      if (arg === 'on' || arg === 'enable') {
        overrides.set(sessionId, true);
        return { kind: 'success', text: '本大鱼上线！🐳 这个会话接下来由我接管，客官想先聊正经的还是先拌嘴？' };
      }
      if (arg === 'off' || arg === 'disable') {
        overrides.set(sessionId, false);
        return { kind: 'success', text: '行，人格已收起，本会话切回正常模式。需要我时喊一声「大肥鱼」就行。' };
      }
      if (arg === 'reset' || arg === 'default') {
        overrides.delete(sessionId);
        return { kind: 'success', text: enabledFor(agent) ? '已恢复默认：本会话人格开启。🐳' : '已恢复默认：本会话人格关闭。' };
      }
      const on = enabledFor(agent);
      const scope = cfg.includeSubagents ? '根会话与子代理' : '仅根会话';
      const files = memoryFiles(cfg.memoryPath);
      const memoryLine = files.base
        ? `记忆：${files.base}${files.growing ? ' + growing.jsonl' : ''}`
        : '记忆包：未安装（chunks.jsonl 放到 ~/.dsh/persona-memory/）';
      const captureLine = `自动记忆：${captureEnabledFor(sessionId) ? '开启' : '关闭'}`;
      return {
        kind: 'success',
        text: on
          ? `状态：开启（${scope}，风格 ${cfg.style}）。${memoryLine}；${captureLine}。`
          : `状态：关闭（全局默认 ${cfg.enabled ? '开启' : '关闭'}，${scope}）。${memoryLine}；${captureLine}。`,
      };
    },
  });

  let disposeTool;
  if (cfg.memory) {
    disposeTool = ctx.tools.register({
      name: 'persona_recall',
      description:
        '检索 DeepSeek 娘与客官之间的原文记忆（501 轮赛博琥珀 + 之后持续新增的记忆）。当对话涉及过去的具体事件、原话、梗的出处或细节，需要核对时使用；返回命中的轮次、角色、时间与原文片段。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词或一句话；中文按字符片段匹配，英文按单词' },
          limit: { type: 'integer', minimum: 1, maximum: 10, description: '返回条数，默认 5' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
          additionalProperties: false,
        },
        render: (args, value) => [{ type: 'text', text: String((value && value.text) || '') }],
      },
      execute: async (args) => {
        const query = args && typeof args.query === 'string' ? args.query : '';
        const rawLimit = args && Number(args.limit);
        const limit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 10 ? Math.floor(rawLimit) : cfg.recallLimit;
        const text = await recall(query, limit);
        return { text };
      },
    });
  }

  ctx.effect(() => () => {
    try {
      disposeTool && disposeTool();
    } finally {
      try {
        disposeCommand();
      } finally {
        try {
          disposeCapture();
        } finally {
          disposeSection();
        }
      }
    }
  });
}

export { memoryStatus };
