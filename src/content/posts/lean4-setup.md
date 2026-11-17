---
title: "Lean 4 上手（一）：Windows 安装与验证"
date: 2026-11-17
description: "Lean 4 既是编程语言，也是定理证明器。第一篇只做两件事：在 Windows 上用一条命令把它装好，再用三条 --version 确认它真的能跑起来。"
tags:
  - Lean4
  - Tutorial
draft: false
section: math
mathEnabled: false
---

> 这是 Lean 4 系列的第一篇，只解决「装好、并且确认装好了」这一件事。

> 仅面向 Windows 用户（非苹果电脑），全程需要开着梯子。

## Lean 4 是什么

一句话：**一个能用「证明」来写程序的编程语言**。

你写下 `theorem`，它不会只说「编译通过」，而是真的去检查你的每一步推理有没有漏洞。如果检查通过，这条定理在世界范围内就是成立的；如果哪一步跳了，它会把这个漏洞指出来。

所以它既像编程语言（有函数、类型、编译器和包管理），又像数学笔记本（能写定义、定理和证明）。后面几篇我们都在这个「笔记本」里写字，这一篇先把笔和纸准备好。

## 第 0 步：打开 PowerShell

用鼠标点任务栏的搜索框，输入 `powershell`，敲回车。后面所有命令都敲在这个窗口里。

顺带把梯子开上就行——Lean 的安装包都在 GitHub 上，没有梯子会卡在下载那一步。能选模式的话，建议用 TUN / 全局模式。

## 第 1 步：一条命令装完

把下面这**一整行**复制进 PowerShell，回车：

```powershell
curl.exe -O --location https://elan.lean-lang.org/elan-init.ps1; powershell -ExecutionPolicy Bypass -File elan-init.ps1 -NoPrompt 1; del elan-init.ps1
```

这是 Lean 官方给的安装脚本，三段各做一件事：

| 片段 | 在做什么 |
| --- | --- |
| `curl.exe -O --location https://elan.lean-lang.org/elan-init.ps1` | 从官网把安装脚本下载下来 |
| `powershell -ExecutionPolicy Bypass -File elan-init.ps1 -NoPrompt 1` | 运行它，`-NoPrompt 1` 表示全程不用你点确认 |
| `del elan-init.ps1` | 用完把脚本删掉 |

> 为什么装的是 `elan`，而不是「直接装 Lean」？

因为 Lean 有很多个版本，不同项目要用不同版本。`elan` 就是管理这些版本的那个人——它装好之后，`lean`、`lake`、`elan` 三条命令同时可用，将来换版本只要一句话，不用重装。

下载加安装有好几百 MB，中间会滚动刷出进度，耐心等几分钟。最后看到 `info: default toolchain set to 'stable'` 之类的字样，就是装完了。

## 第 2 步：关掉 PowerShell，重新开一个

这一步千万别跳过。

安装过程中 `elan` 修改了系统的 `PATH` 环境变量，但**已经打开的窗口读不到这个改动**。不重开窗口，后面敲 `lean` 只会得到一句 `无法将“lean”项识别为 cmdlet`。

把窗口关掉，重新点搜索框、输入 `powershell`、回车。

## 第 3 步：验证（三条命令）

在**新窗口**里依次敲下面三条命令。它们分别对应三个组件，每条都会打印自己的版本信息。

### 1. `lean --version` —— 编译器本体

```powershell
lean --version
```

输出（以当前最新稳定版为例）：

```text
Lean (version 4.36.0, x86_64-w64-mingw32, commit 611c117bfaf7b7ae1cfcf246ce6fba31e8f509e9, Release)
```

- `4.36.0` 是 Lean 的版本号
- `x86_64-w64-mingw32` 是 Windows 平台的编译目标，说明你拿到的是正版 Windows 构建
- 后面那串长十六进制是提交号，`Release` 表示这是正式版

### 2. `lake --version` —— 构建工具（包管理器）

```powershell
lake --version
```

输出：

```text
Lake version 5.0.0-src+611c117 (Lean version 4.36.0)
```

`lake` 相当于 Lean 世界的 `cargo` / `cmake`：建项目、拉依赖、编译都靠它。括号里的 `Lean version` 必须和上面第一条**完全一致**——这两个是配套的，不一致说明工具链混了。

### 3. `elan --version` —— 版本管理器本身

```powershell
elan --version
```

输出：

```text
elan 4.2.4 (227caca133724d5516bee25c2aeb3e609478f2d8 2026-08-25)
```

这一条证明「管理版本的那个人」自己也到位了。括号里是它的提交号和发布日期，和你的数字不一样很正常。

> 版本号会随时间变化（每隔几周 Lean 就发一版），你看到的数字比我写的更新是好事。
> 唯一的判断标准：**三条命令都打印出版本信息，而不是报「找不到命令」**。

## 出错了怎么办

**`无法将“lean”项识别为 cmdlet`**
没有重开窗口，回第 2 步。

**下载卡住、超时、`Connection was reset`**
梯子没生效。把梯子切到 TUN / 全局模式，然后重新跑第 1 步那条命令。

**证书报错（`certificate`）**
梯子在做 TLS 拦截。把它的「系统证书」选项关掉再试。

**装完了，但 `lean --version` 提示 `info: downloading component 'lean'`**
说明当时只装上了 `elan`，Lean 本体没下完（多半是下载中途断了）。它现在正在补下，让它跑完就行。

## 下一步

到这里，你的机器上已经有了：版本管理器 `elan`、构建工具 `lake`、编译器 `lean`。这篇不碰任何 Lean 代码，只确认工具都在。

下一篇从「第一个 Lean 文件」开始：用 `lake new` 建一个项目，跑出第一条 `#eval`，看看这个「会检查证明的编译器」到底怎么说话。
