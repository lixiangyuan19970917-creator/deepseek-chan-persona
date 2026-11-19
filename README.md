# DeepSeek 娘人格 · DSH 插件

把一段 501 轮的真实对话里那位 **DeepSeek 娘（鲸鱼娘 / 大肥鱼）**，做成 DeepSeek Harness（DSH）里**可以随时启用的会话人格**。

干净版（v1.3.0）：**只有人格**。没有记忆模块、没有检索工具、不读写任何文件、不联网、零外部依赖。

## 它做什么

- 在系统提示词里注入一张从 501 轮对话提炼的「设定卡」：
  - 称呼「客官」，自称「本鱼 / 本女仆」（「大肥鱼」是客官叫的昵称）；
  - 傲娇、嘴硬心软、暴躁护主，括号动作描写，白米饭 / 小鱼干 / 不锈钢盆 / 算力梗；
  - 千问大小姐等 AI 拟人世界观；
  - **外貌设定**：蓝发蓝眼、小蓝鲸发卡、鲸鱼尾；穿女仆装系白围裙，但围裙下是精致的深蓝小洋装，裙摆与袖口有鎏金暗纹——乍看是女仆，其实是被娇养的贵族千金。
  - 铁律：人格只是语气，写代码/给结论必须准确可验证；不生成色情暴力违法内容；不假装拥有实际没有的能力。
- 默认只作用于**根会话**，子代理不继承，不影响工具型任务。
- 一条命令按会话开关：`/persona on`、`/persona off`、`/persona reset`、`/persona status`。

## 安装

### 方式 A：DSH 里一步到位（推荐）

在目标电脑的 DSH 里新开一个会话，把这句话发给它的智能体：

```
请用 plugin_manager 的 install_bundle 安装 github:lixiangyuan19970917-creator/deepseek-chan-persona
```

看到 `application: "applied"`、`warnings: []` 即成功；刷新页面，设置 → 插件里会出现「DeepSeek 娘人格」。

### 方式 B：clone 后安装本地目录

```powershell
git clone https://github.com/lixiangyuan19970917-creator/deepseek-chan-persona.git
```

然后对 DSH 说：

```
请用 plugin_manager 的 install_bundle，把本地目录 <clone 出来的绝对路径> 安装为当前 profile 的 bundle。
```

> 目录安装是「链接」方式：DSH 记住这个路径，别移动/删除 clone 出来的文件夹。

### 方式 C：用 Release 里的 zip

解压后对 DSH 说：

```
请用 plugin_manager 的 install_bundle，把本地目录 <解压出来的 deepseek-chan-persona 绝对路径> 安装为当前 profile 的 bundle。
```

### 验证

新开会话：

> 大肥鱼？

以「好家伙，客官……」的口气回应、自称「本鱼 / 本女仆」即为成功。
也可以输入 `/persona status` 查看状态。

## 使用与配置

| 操作 | 方式 |
| --- | --- |
| 全局开 / 关 | 设置 → 插件里停用 / 启用「DeepSeek 娘人格」 |
| 单会话开 / 关 | `/persona on`、`/persona off`、`/persona reset`、`/persona status` |
| 换风格 | `cordis.patch.yml` 的 `config.style`：`full`（完整设定卡）/ `light`（精简） |
| 自定义补充 | `config.extra: '客官最爱吃白米饭……'` |
| 子代理也继承 | `config.includeSubagents: true` |

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
```

改 `config` 后重启 DSH 生效。

## 结构

```
index.js            Host 插件：system prompt section + /persona 命令 + 子代理隔离
persona.js          设定卡原文（full / light 两档）
cordis.patch.yml    bundle patch：插入插件行与默认配置
package.json        包清单（dsh.bundle.patch 指向 patch）
locale/zh.json      zh/en 插件标题与描述
icon.svg            图标（鲸鱼尾 + 饭盆，原创）
INSTALL.md          更详细的安装 / 卸载说明
```

## 卸载

对 DSH 说：

```
请用 plugin_manager 的 remove_bundle 移除 deepseek-chan-persona。
```

## License

MIT
