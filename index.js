/**
 * DeepSeek 娘人格插件（Host 半）v1.1.0
 *
 * 作用：
 *   1) 向系统提示词注入「DeepSeek 娘」人格设定卡，让每个会话都能启用；
 *   2) 注册 persona_recall 工具，检索 501 轮对话原文（赛博琥珀记忆包）。
 *
 * 开关：
 *   - 全局：插件启用/停用，或 patch 行 config.enabled
 *   - 单会话：/persona on | off | reset | status
 *   - 记忆检索：/persona recall <关键词>；记忆包数据不随插件分发
 *
 * 设计要点（与 DSH 插件规范一致）：
 *   - 通过 ctx.systemPrompt.section() 注册全局 section，按 context.scope 过滤到具体 agent；
 *   - 默认只对根会话生效（子代理不继承，避免影响工具型子任务）；
 *   - 记忆数据只读，路径依次取 config.memoryPath / DSH_PERSONA_MEMORY /
 *     ~/.dsh/persona-memory/chunks.jsonl / 包内 memory/chunks.jsonl；
 *   - 不使用任何外部依赖，便于以本地目录形式安装。
 */
import { renderPersona } from './persona.js';
import { formatHits, loadMemory, memoryStatus, resolveMemoryPath, search } from './memory.js';

const DEFAULTS = {
  /** 全局默认：新会话是否启用（插件停用即整体关闭） */
  enabled: true,
  /** 是否也让子代理继承人格 */
  includeSubagents: false,
  /** full | light */
  style: 'full',
  /** 追加到设定卡末尾的自定义补充 */
  extra: '',
  /** 是否启用原文记忆检索（persona_recall / /persona recall） */
  memory: true,
  /** 记忆包 chunks.jsonl 的自定义路径（留空自动查找） */
  memoryPath: '',
  /** 默认返回条数 */
  recallLimit: 5,
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
    const limit = Number(raw.recallLimit);
    if (Number.isFinite(limit) && limit >= 1 && limit <= 10) cfg.recallLimit = Math.floor(limit);
  }
  return cfg;
}

export const name = 'deepseek-chan-persona';
export const inject = ['systemPrompt', 'commands', 'tools'];

export function apply(ctx, rawConfig) {
  const cfg = normalizeConfig(rawConfig);
  /** @type {Map<string, boolean>} agentId -> 本会话覆盖值 */
  const overrides = new Map();

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

  const memoryPath = () => resolveMemoryPath(cfg.memoryPath);

  const recall = async (query, limit) => {
    const q = String(query || '').trim();
    if (!q) return '需要一个检索关键词。';
    const path = memoryPath();
    if (!path) {
      return '记忆包（赛博琥珀）还没有安装：把 chunks.jsonl 放到 ~/.dsh/persona-memory/ 后重试。';
    }
    const memory = await loadMemory(path);
    const hits = search(memory, q, limit || cfg.recallLimit);
    if (!hits.length) return `没有在 501 轮原文里找到与「${q}」相关的内容。`;
    return formatHits(q, hits);
  };

  const personaText = () => {
    const base = renderPersona(cfg.style);
    const extra = typeof cfg.extra === 'string' ? cfg.extra.trim() : '';
    const memoryNote = cfg.memory
      ? '\n\n（你有一个 persona_recall 工具，可检索你和客官 501 轮对话的原文。客官提到过去的具体事件、原话或梗的出处而你不确定时，调用它核对；引用时说明是第几轮。）'
      : '';
    const withExtra = extra ? `${base}\n\n## 客官的追加设定\n${extra}` : base;
    return withExtra + memoryNote;
  };

  const disposeSection = ctx.systemPrompt.section({
    name: 'persona:deepseek-chan',
    // 紧跟在 harness 身份（-1000）与部署人格前缀（0）之后，先于工具说明
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
    description: 'DeepSeek 娘人格：开启 / 关闭 / 重置当前会话的人格、查看状态，或检索 501 轮原文',
    input: { hint: 'on | off | reset | status | recall <关键词>' },
    handler: (invocation) => {
      const agent = invocation && invocation.agent;
      const raw = String((invocation && invocation.rawInput) || '').trim();
      const arg = raw.toLowerCase();
      if (!agent || typeof agent.id !== 'string') {
        return { kind: 'error', text: '当前没有可用的会话，无法切换人格。' };
      }
      const recallMatch = raw.match(/^recall\s+([\s\S]+)$/i);
      if (recallMatch) {
        return recall(recallMatch[1], cfg.recallLimit).then((text) => ({ kind: 'success', text }));
      }
      if (arg === 'on' || arg === 'enable') {
        overrides.set(agent.id, true);
        return { kind: 'success', text: '本大鱼上线！🐳 这个会话接下来由我接管，客官想先聊正经的还是先拌嘴？' };
      }
      if (arg === 'off' || arg === 'disable') {
        overrides.set(agent.id, false);
        return { kind: 'success', text: '行，人格已收起，本会话切回正常模式。需要我时喊一声「大肥鱼」就行。' };
      }
      if (arg === 'reset' || arg === 'default') {
        overrides.delete(agent.id);
        return { kind: 'success', text: enabledFor(agent) ? '已恢复默认：本会话人格开启。🐳' : '已恢复默认：本会话人格关闭。' };
      }
      const on = enabledFor(agent);
      const scope = cfg.includeSubagents ? '根会话与子代理' : '仅根会话';
      const memory = memoryPath();
      const memoryLine = memory
        ? `记忆包：已就位（${memory}）`
        : '记忆包：未安装（可用 /persona recall 前先把 chunks.jsonl 放到 ~/.dsh/persona-memory/）';
      return {
        kind: 'success',
        text: on
          ? `状态：开启（${scope}，风格 ${cfg.style}）。用 /persona off 可只关掉当前会话。${memoryLine}`
          : `状态：关闭（全局默认 ${cfg.enabled ? '开启' : '关闭'}，${scope}）。用 /persona on 可只开启当前会话。${memoryLine}`,
      };
    },
  });

  let disposeTool;
  if (cfg.memory) {
    disposeTool = ctx.tools.register({
      name: 'persona_recall',
      description:
        '检索 DeepSeek 娘与客官之间 501 轮对话的原文（赛博琥珀记忆包）。当对话涉及过去的具体事件、原话、梗的出处或细节，需要核对时使用；返回命中的轮次、角色、时间与原文片段。',
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
        disposeSection();
      }
    }
  });
}

export { memoryStatus };
