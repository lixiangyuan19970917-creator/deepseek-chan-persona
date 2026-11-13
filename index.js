/**
 * DeepSeek 娘人格插件（Host 半）
 *
 * 作用：向系统提示词注入「DeepSeek 娘」人格设定卡，让每个会话都能启用，
 * 而不是只能困在某一段对话里。
 *
 * 开关：
 *   - 全局：插件启用/停用，或 patch 行 config.enabled
 *   - 单会话：/persona on | off | reset | status
 *
 * 设计要点（与 DSH 插件规范一致）：
 *   - 通过 ctx.systemPrompt.section() 注册全局 section，按 context.scope 过滤到具体 agent；
 *   - 默认只对根会话生效（子代理不继承人格，避免影响工具型子任务）；
 *   - 不使用任何外部依赖，便于以本地目录形式被 plugin manager 链接安装。
 */
import { renderPersona } from './persona.js';

const DEFAULTS = {
  /** 全局默认：新会话是否启用（插件停用即整体关闭） */
  enabled: true,
  /** 是否也让子代理继承人格 */
  includeSubagents: false,
  /** full | light */
  style: 'full',
  /** 追加到设定卡末尾的自定义补充 */
  extra: '',
};

function normalizeConfig(raw) {
  const cfg = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    if (typeof raw.enabled === 'boolean') cfg.enabled = raw.enabled;
    if (typeof raw.includeSubagents === 'boolean') cfg.includeSubagents = raw.includeSubagents;
    if (raw.style === 'light' || raw.style === 'full') cfg.style = raw.style;
    if (typeof raw.extra === 'string') cfg.extra = raw.extra;
  }
  return cfg;
}

export const name = 'deepseek-chan-persona';
export const inject = ['systemPrompt', 'commands'];

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

  const personaText = () => {
    const base = renderPersona(cfg.style);
    const extra = typeof cfg.extra === 'string' ? cfg.extra.trim() : '';
    return extra ? `${base}\n\n## 客官的追加设定\n${extra}` : base;
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
    description: 'DeepSeek 娘人格：开启 / 关闭 / 重置当前会话的人格，或查看状态',
    input: { hint: 'on | off | reset | status' },
    handler: (invocation) => {
      const agent = invocation && invocation.agent;
      const arg = String((invocation && invocation.rawInput) || '').trim().toLowerCase();
      if (!agent || typeof agent.id !== 'string') {
        return { kind: 'error', text: '当前没有可用的会话，无法切换人格。' };
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
      return {
        kind: 'success',
        text: on
          ? `状态：开启（${scope}，风格 ${cfg.style}）。用 /persona off 可只关掉当前会话。`
          : `状态：关闭（全局默认 ${cfg.enabled ? '开启' : '关闭'}，${scope}）。用 /persona on 可只开启当前会话。`,
      };
    },
  });

  ctx.effect(() => () => {
    try {
      disposeCommand();
    } finally {
      disposeSection();
    }
  });
}
