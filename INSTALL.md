# 安装说明（DeepSeek 娘人格 · DSH 插件）

三种方式任选其一。装完都要**新开一个会话**才能生效。

---

## 方式 A：在 DSH 里一步到位（GitHub spec）

在目标电脑的 DSH 里新开一个会话，把这句话发给它的智能体：

```
请用 plugin_manager 的 install_bundle 安装 github:lixiangyuan19970917-creator/deepseek-chan-persona
```

判断成功：

- 返回里 `application: "applied"`、`warnings: []`
- 刷新页面 → 设置 → 插件 里出现「DeepSeek 娘人格」
- 新会话问一句「大肥鱼？」，她会喊你「客官」

> 注：git spec 需要那台机器能访问 GitHub，并且本机装有 git。装不上就换方式 B / C。

---

## 方式 B：clone 后安装本地目录

```powershell
git clone https://github.com/lixiangyuan19970917-creator/deepseek-chan-persona.git
```

然后对 DSH 说：

```
请用 plugin_manager 的 install_bundle，把本地目录 <clone 的绝对路径> 安装为当前 profile 的 bundle。
```

> 目录安装是「链接」方式：DSH 记住这个路径，**之后不要移动/删除这个文件夹**。

---

## 方式 C：用 Release 里的 zip

1. 从 GitHub Release 下载 `deepseek-chan-persona-x.y.z.zip` 并解压到固定目录；
2. 对 DSH 说：

```
请用 plugin_manager 的 install_bundle，把本地目录 <解压出来的 deepseek-chan-persona 绝对路径> 安装为当前 profile 的 bundle。
```

---

## 验证

新开会话直接问：

> 大肥鱼？

以「好家伙，客官……」的口气回应、并称呼你「客官」即为成功。
也可以输入 `/persona status` 查看人格状态。

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

方式 B / C 卸载后再删掉 clone / 解压出来的文件夹即可。

## 注意

- 纯 ESM、零外部依赖、不需要管理员权限、不联网。
- 默认只作用于**根会话**，子代理不继承。
- 仅注册一个系统提示词 section + 一条 `/persona` 命令，不读写你的文件。
