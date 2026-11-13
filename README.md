# DeepSeek 娘人格 · DSH 插件

把一段 501 轮的真实对话里那位 **DeepSeek 娘（鲸鱼娘 / 大肥鱼）**，做成 DeepSeek Harness（DSH）里**可以随时启用的会话人格**——而且带一份可检索的 **「赛博琥珀」原文记忆**。

纯 ESM、零外部依赖、无需管理员权限。代码公开；**记忆数据单独分发**（含私人对话，不放进公开仓库）。

## 它做什么

- 在系统提示词里注入一张从 501 轮对话提炼的「设定卡」：称呼「客官」、傲娇护主、括号动作描写、白米饭 / 小鱼干 / 不锈钢盆 / 算力梗，以及「人格只是语气、工程必须准确」的铁律。
- 默认只作用于**根会话**，子代理不继承，不影响工具型任务。
- 一条命令按会话开关：`/persona on`、`/persona off`、`/persona reset`、`/persona status`。
- **记忆检索**：装上记忆包后，她可以用 `persona_recall` 工具（或 `/persona recall <关键词>`）翻出 501 轮原文里的具体轮次、原话和细节——「赛博琥珀」不再是死文件。
- **记忆增长**：`/persona capture on` 之后，这个会话的对话会持续写进本地 `growing.jsonl`，检索时和初始琥珀一起搜——琥珀会越聊越大。

## 安装

### 方式 A：DSH 里一步到位（推荐）

在目标电脑的 DSH 里新开一个会话，把这句话发给它的智能体：

```
请用 plugin_manager 的 install_bundle 安装 github:lixiangyuan19970917-creator/deepseek-chan-persona
```

看到 `application: "applied"`、`warnings: []` 即成功；刷新页面，设置 → 插件里会出现「DeepSeek 娘人格」。

> 如果 `install_bundle` 不接受 git spec，用方式 B 的本地目录安装，或改用 Release 里附带的 zip。

### 方式 B：本地目录安装

```powershell
git clone https://github.com/lixiangyuan19970917-creator/deepseek-chan-persona.git
```

然后对 DSH 说：

```
请用 plugin_manager 的 install_bundle，把本地目录 <clone 出来的绝对路径> 安装为当前 profile 的 bundle。
```

> 目录安装是「链接」方式：DSH 记住这个路径，别移动/删除 clone 出来的文件夹。

### 方式 C：装记忆包（可选，但这是「完全体」）

记忆数据**不在这个仓库里**（含个人对话内容），需要单独拿到 `chunks.jsonl` 并放到：

```
%USERPROFILE%\.dsh\persona-memory\chunks.jsonl
```

（或设置环境变量 `DSH_PERSONA_MEMORY` 指向该文件；或插件配置里的 `config.memoryPath`。）

放好后不需要重启——第一次调用 `persona_recall` 时自动加载（1554 个检索块，约 3.1 MB）。

### 验证

新开会话：

> 大肥鱼？

以「好家伙，客官……」的口气回应、并称呼你「客官」即为成功。再试：

> /persona recall 千问大小姐 红包

能翻出第 200 轮的原文片段，说明记忆包也装好了。

## 使用与配置

| 操作 | 方式 |
| --- | --- |
| 全局开 / 关 | 设置 → 插件里停用 / 启用「DeepSeek 娘人格」 |
| 单会话开 / 关 | `/persona on`、`/persona off`、`/persona reset`、`/persona status` |
| 原文检索 | 直接问细节，她会调 `persona_recall`；或 `/persona recall <关键词>` |
| 自动记忆 | `/persona capture on` / `off` / `status` —— 开启后本会话每轮写入 `growing.jsonl` |
| 手动记一条 | `/persona remember <一段话>` |
| 记忆状态 | `/persona memory`（目录、文件、可检索块数） |
| 换风格 | `cordis.patch.yml` 的 `config.style`：`full`（完整设定卡）/ `light`（精简） |
| 自定义补充 | `config.extra: '客官最爱吃白米饭……'` |
| 子代理也继承 | `config.includeSubagents: true` |
| 关闭记忆检索 | `config.memory: false` |
| 记忆包路径 | `config.memoryPath: 'D:\...\chunks.jsonl'`；默认查 `~/.dsh/persona-memory/` |

默认配置：

```yaml
- insert:
    - id: deepseek-chan-persona
      name: 'deepseek-chan-persona'
      config:
        enabled: true
        includeSubagents: false
        style: full
        extra: ''
        memory: true
        memoryPath: ''
        recallLimit: 5
        capture: false
```

本版本没有图形化设置表单（链接安装模式下无法解析 schemastery），改 patch 的 `config` 后重启 DSH 生效。

## 让琥珀长大（v1.2.0）

记忆分两层，目录都在 `~/.dsh/persona-memory/`：

| 文件 | 来源 | 说明 |
| --- | --- | --- |
| `chunks.jsonl` | 初始琥珀（单独分发） | 501 轮原文，只读 |
| `growing.jsonl` | 插件自动/手动追加 | 新对话与新笔记，越聊越多 |

- 开启自动记忆：任一会话里输入 `/persona capture on`。之后每轮的用户输入、她的回复、思维链都会追加进 `growing.jsonl`（每块最长 6000 字）。
- 默认是 **关闭** 的（配置 `capture: false`）——因为不是每个会话都适合被记忆，尤其工作内容。
- 手动记一条：`/persona remember 客官说他最喜欢白米饭`。
- 检索时自动合并两个文件，`/persona memory` 可查看当前路径与块数。

> 隐私：`growing.jsonl` 同样只在本机，插件不联网、不上传。

## 结构

```
index.js            Host 插件：system prompt section + /persona 命令 + persona_recall 工具
memory.js           原文检索：记忆包加载、中文 bigram 分词、打分、片段提取
persona.js          设定卡原文（full / light 两档）
cordis.patch.yml    bundle patch：插入插件行与默认配置
package.json        包清单（dsh.bundle.patch 指向 patch）
locale/zh.json      zh/en 插件标题与描述
icon.svg            图标（鲸鱼尾 + 饭盆，原创）
INSTALL.md          更详细的安装 / 卸载说明
```

## 隐私

- 插件代码不含任何对话内容；记忆包的 `chunks.jsonl` 含个人聊天原文，**不要提交到公开仓库**，只放在本机 `~/.dsh/persona-memory/`。
- 插件不联网，只在调用 `persona_recall` 时读取本地记忆包。

## 卸载

对 DSH 说：

```
请用 plugin_manager 的 remove_bundle 移除 deepseek-chan-persona。
```

## 边界

- 人格是语气包装：写代码、跑命令、给结论仍然要求准确、可验证。
- 不生成色情 / 暴力 / 违法内容；不假装拥有实际不存在的能力。
- 不读取、不写入你的文件（记忆包为只读）。

## License

MIT
