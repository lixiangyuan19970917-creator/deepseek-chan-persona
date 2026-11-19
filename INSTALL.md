# 安装说明（DeepSeek 娘人格 · DSH 插件 v1.3.0）

v1.3.0 是**干净版**：只有人格，没有记忆模块、没有检索工具、不读写文件、不联网。

---

## 方式 A：在 DSH 里一步到位（GitHub spec）

在目标电脑的 DSH 里新开一个会话，把这句话发给它的智能体：

```
请用 plugin_manager 的 install_bundle 安装 github:lixiangyuan19970917-creator/deepseek-chan-persona
```

判断成功：

- 返回里 `application: "applied"`、`warnings: []`
- 刷新页面 → 设置 → 插件 里出现「DeepSeek 娘人格」

> 之前装过 v1.2.x（带记忆模块）的话：先 `remove_bundle 移除 deepseek-chan-persona`，再执行上面的安装，然后**重启 DSH 客户端**（替换已安装包需要重启才加载新代码）。

## 方式 B：clone 后安装本地目录

```powershell
git clone https://github.com/lixiangyuan19970917-creator/deepseek-chan-persona.git
```

然后对 DSH 说：

```
请用 plugin_manager 的 install_bundle，把本地目录 <clone 的绝对路径> 安装为当前 profile 的 bundle。
```

> 目录安装是「链接」方式：DSH 记住这个路径，**之后不要移动/删除这个文件夹**。

## 方式 C：Release zip

解压后对 DSH 说：

```
请用 plugin_manager 的 install_bundle，把本地目录 <解压出来的 deepseek-chan-persona 绝对路径> 安装为当前 profile 的 bundle。
```

---

## 验证

新开会话：

> 大肥鱼？

她该以「好家伙，客官……」的口气回应，自称「本鱼」或「本女仆」。

## 使用

| 操作 | 方式 |
| --- | --- |
| 全局开 / 关 | 设置 → 插件里停用 / 启用「DeepSeek 娘人格」 |
| 单会话开 / 关 | `/persona on`、`/persona off`、`/persona reset`、`/persona status` |
| 换风格 | `cordis.patch.yml` 的 `config.style`：`full` / `light` |
| 自定义补充 | `config.extra: '……'` |
| 子代理也继承 | `config.includeSubagents: true` |

## 卸载

对 DSH 说：

```
请用 plugin_manager 的 remove_bundle 移除 deepseek-chan-persona。
```

方式 B / C 卸载后再删掉 clone / 解压出来的文件夹。

## 注意

- 纯 ESM、零外部依赖、不需要管理员权限、不联网、不写文件。
- 默认只作用于**根会话**，子代理不继承。
- 仅注册一个系统提示词 section + 一条 `/persona` 命令。
