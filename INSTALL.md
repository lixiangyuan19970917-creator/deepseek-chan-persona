# 安装说明（DeepSeek 娘人格 · DSH 插件 v1.1.0）

两步：**装插件**（代码）+ **放记忆包**（数据，可选但推荐）。装完都要**新开一个会话**才能生效。

---

## 第一步：装插件

### 方式 A：在 DSH 里一步到位（GitHub spec）

在目标电脑的 DSH 里新开一个会话，把这句话发给它的智能体：

```
请用 plugin_manager 的 install_bundle 安装 github:lixiangyuan19970917-creator/deepseek-chan-persona
```

判断成功：

- 返回里 `application: "applied"`、`warnings: []`
- 刷新页面 → 设置 → 插件 里出现「DeepSeek 娘人格」

### 方式 B：clone 后安装本地目录

```powershell
git clone https://github.com/lixiangyuan19970917-creator/deepseek-chan-persona.git
```

然后对 DSH 说：

```
请用 plugin_manager 的 install_bundle，把本地目录 <clone 的绝对路径> 安装为当前 profile 的 bundle。
```

> 目录安装是「链接」方式：DSH 记住这个路径，**之后不要移动/删除这个文件夹**。

### 方式 C：用 Release 里的 zip

解压后对 DSH 说：

```
请用 plugin_manager 的 install_bundle，把本地目录 <解压出来的 deepseek-chan-persona 绝对路径> 安装为当前 profile 的 bundle。
```

---

## 第二步：放记忆包（可选，「完全体」必需）

把拿到的 `chunks.jsonl` 放到下面这个位置（不存在就新建文件夹）：

```
C:\Users\<你的用户名>\.dsh\persona-memory\chunks.jsonl
```

方式二选一即可：

- 环境变量 `DSH_PERSONA_MEMORY` = 该文件的绝对路径；
- 或插件 patch 里 `config.memoryPath` 写死路径。

放好后**不用重启**：第一次调用 `persona_recall` 或 `/persona recall` 时自动加载（1554 块，约 3.1 MB）。

> ⚠️ `chunks.jsonl` 含个人对话原文，**不要上传到公开仓库/网盘公开链接**。

---

## 验证

新开会话，先问：

> 大肥鱼？

再试一句检索：

> /persona recall 千问大小姐 红包

能翻出「第 200 轮」的原文片段，就说明人格 + 记忆都到位了。

## 使用

| 操作 | 方式 |
| --- | --- |
| 全局开 / 关 | 设置 → 插件里停用 / 启用「DeepSeek 娘人格」 |
| 单会话开 / 关 | `/persona on`、`/persona off`、`/persona reset`、`/persona status` |
| 原文检索 | 直接问细节（她会调 `persona_recall`），或 `/persona recall <关键词>` |
| 换风格 | `cordis.patch.yml` 的 `config.style`：`full` / `light` |
| 自定义补充 | `config.extra: '……'` |
| 子代理也继承 | `config.includeSubagents: true` |
| 关闭记忆 | `config.memory: false` |

## 卸载

对 DSH 说：

```
请用 plugin_manager 的 remove_bundle 移除 deepseek-chan-persona。
```

方式 B / C 卸载后再删掉 clone / 解压出来的文件夹；记忆包可保留，不占多少空间。

## 注意

- 纯 ESM、零外部依赖、不需要管理员权限。
- 默认只作用于**根会话**，子代理不继承。
- 仅注册一个系统提示词 section、一条 `/persona` 命令和一个 `persona_recall` 工具；不联网、不写你的文件。
