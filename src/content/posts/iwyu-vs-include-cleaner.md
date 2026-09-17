---
title: "IWYU vs clang-include-cleaner：两个 C++ include 清理工具的深度对比"
date: 2026-09-16
description: "基于两个工具的源码注释与实现，对比 IWYU 与 clang-include-cleaner 的设计理念、架构、核心算法与能力边界，并给出选型建议。"
tags:
  - C++
  - 工具链
  - 源码分析
draft: false
mathEnabled: false
---

> 本文基于两个仓库的**源码注释与实现**整理，不依赖二手资料。所有结论都标注了出处（文件:行号或注释原文），便于回溯核对。
>
> - **IWYU**：`include-what-you-use/`（`iwyu.cc` 单文件 6000+ 行）
> - **clang-include-cleaner**：`llvm-project/clang-tools-extra/include-cleaner/`（`lib/` + `include/` + `tool/` 约 2600 行）
>
> 对比的目标是回答一个问题：**「我想清理 C/C++ 工程的 include 依赖」时，应该选哪个？**

## 一句话结论

| 维度 | IWYU | clang-include-cleaner |
|---|---|---|
| 定位 | **强规则的依赖重构工具**，为工程建立"自洽的 include 图" | **弱假设的 include 体检库**，报告"疑似无用/缺失的 include" |
| 输出 | 完整的 add/remove 清单 + 前向声明建议 + "why" 注释 | Unused/Missing 列表，可自动修复（clang-format 排序） |
| 哲学 | **一次做对**：要求 include 集合 = 符号使用集合的忠实投影 | **可解释**：只报告有证据支撑的结论，其余留白 |
| 成熟度 | 实验性、bug 多但功能深（模板、宏、前向声明） | 生产级、稳健但功能浅（不做前向声明、不判 full use） |
| 集成 | 独立可执行文件 + 两个 Python 驱动脚本 | 同时是 **clang-tidy 检查**、**clangd 实时诊断**、**独立命令行工具** |
| 规模 | 约 3 万行 C++ + 映射表生成脚本 | 约 2600 行 C++ |

最精炼的一句话：

> **IWYU 试图回答"这个文件应该 `#include` 什么"，clang-include-cleaner 只回答"这个文件写着的 `#include` 哪些没被用到、哪些用到的没写"。前者是重构，后者是体检。**

## 设计理念的分野

### IWYU：规则先行，逼近完备

IWYU 在其核心文件 `iwyu.cc` 开头（第 10–88 行）用整整 79 行注释定义了它的规则：

> The analysis enforces the following rule:
> - For every symbol (variable, function, constant, type, and macro)
>   X in C++ file CU.cc, X must be declared in CU.cc or in a header
>   file directly included by itself, CU.h, or CU-inl.h.

这条规则的关键词是 **directly**。IWYU 认为传递性依赖是工程质量问题，必须被消除。为此它定义了三种 include 分类（`iwyu.cc:64-88`）：

- **necessary**：删掉它编译器或 IWYU 会报错；
- **optional**：删掉也能编译，但保留不算错（例如 `bar.h` 是 `foo.h` 的必需 include，`foo.cc` 用了 `bar.h` 的符号，则 `foo.cc` 对 `bar.h` 的 include 是 optional）；
- **undesired**：保留它就是 IWYU 违规。

> Therefore, when we say a #include is *desired*, we mean that it's
> either necessary or optional.

这套三分法带来一个**三值逻辑**的输出：IWYU 不只是说"删/加"，它还需要判断一个 include 是"应该保留"还是"可保留可不保留"。这正是它能做到"最小集合"（minimal set cover）的基础，也是它复杂度爆炸的根源。

### clang-include-cleaner：证据先行，宁缺毋滥

include-cleaner 的设计哲学写在 `Types.h:85-93` 的 `RefType` 定义里：

```cpp
/// Indicates the relation between the reference and the target.
enum class RefType {
  /// Target is named by the reference, e.g. function call.
  Explicit,
  /// Target isn't spelled, e.g. default constructor call in `Foo f;`
  Implicit,
  /// Target's use can't be proven, e.g. a candidate for an unresolved overload.
  Ambiguous,
};
```

而 `Analysis.cpp:119-121` 明确了它的行动准则：

```cpp
// Bail out if we can't (or need not) insert an include.
if (Satisfied || Providers.empty() || Ref.RT != RefType::Explicit)
  return;
```

**只有 `Explicit` 引用才会触发"补 include"建议。** Implicit / Ambiguous 一律不生成建议——因为无法证明。

工具的官方边界声明在 `tool/IncludeCleaner.cpp` 的 `Overview` 中：

> The tool operates on *working* source code. This means it can suggest
> including headers that are only indirectly included, but cannot suggest
> those that are missing entirely. (clang-include-fixer can do this).

注意这句话的微妙之处：它说"不能建议完全缺失的头文件"。原因是它只做**映射推理**（symbol → header），不做**符号查找**（我用了 `Foo`，哪里定义 `Foo`？）。如果代码能编译，说明符号至少间接可见，于是能算出"应该直接 include 谁"；如果编译不过，它无能为力。

### 分野的本质

| | IWYU | include-cleaner |
|---|---|---|
| 知识来源 | **硬编码的标准库映射表**（`.imp` / `.inc`，数千条）+ 源码 pragma | **运行时识别**：`tooling::stdlib::Recognizer` + IWYU pragma + 头文件搜索 |
| 判断依据 | "按规则应该怎样" | "现有 include 图能证明什么" |
| 未知情形 | 用启发式猜（并承担误报） | 不报告（并承担漏报） |
| 用户心智 | 你需要理解并接受 IWYU 的风格 | 你看到的就是有证据的 |

这个分野直接导致了后面所有具体差异。

## 架构对比

### IWYU：单体式 Clang FrontendAction

```text
iwyu_main.cc
  └─ ExecuteAction (iwyu_driver.cc)       ← 借用 Clang Driver 构建编译作业
       └─ IwyuAction : ASTFrontendAction
            ├─ IwyuPreprocessorInfo        ← 预处理器回调，记录 include/宏
            └─ IwyuAstConsumer
                 ├─ HandleTranslationUnit  ← 全树遍历入口
                 ├─ IwyuBaseAstVisitor<Derived>  (CRTP, 约 1149-3779 行)
                 └─ InstantiatedTemplateVisitor  (约 3813-4811 行)
                      ↓
              IwyuFileInfo（每文件一份 use 列表）
                      ↓
              CalculateAndReportIwyuViolations  ← 后处理
```

关键点：

- **CRTP 继承体系**（`iwyu.cc:318-340`）：`BaseAstVisitor` 负责与 IWYU 无关的基础功能（维护 AST 链、位置计算、verbose 打印），`IwyuBaseAstVisitor` 承载全部 use 判定逻辑。
- **主动实例化模板**：`HandleTranslationUnit` 中调用 `InstantiateImplicitMethods()` 强制 Clang 生成隐式构造/析构。源码注释解释了理由（见下文"设计理念"一节）。
- **两遍遍历**：主遍历用 `IwyuAstConsumer`，模板深入分析用 `InstantiatedTemplateVisitor`，通过纯虚钩子分工（`iwyu.cc:3579-3596`）。

### include-cleaner：管道式库

```text
       一次编译
          │
  ┌───────┴────────┐
  │ Record 阶段     │  Record.cpp / Record.h
  │  RecordedAST    │  → Roots（主文件顶层声明）
  │  RecordedPP     │  → MacroReferences / Includes
  │  PragmaIncludes │  → IWYU pragma 解析结果
  └───────┬────────┘
          │
  ┌───────┴────────┐
  │ Analysis  阶段  │  Analysis.cpp / AnalysisInternal.h
  │   walkUsed     │  → walkAST → headersForSymbol
  │   analyze      │  → AnalysisResults{Unused, Missing}
  └───────┬────────┘
          │
  ┌───────┴────────┐
  │ fixIncludes    │  clang-format cleanupAroundReplacements
  └────────────────┘
```

推理链条在 `AnalysisInternal.h` 开头被一句话概括：

```text
AST => AST node => Symbol => Location => Header
                   /
Macro expansion =>
```

四个阶段各有独立文件，可被单独复用：

| 阶段 | 文件 | 可复用性 |
|---|---|---|
| 录制 | `Record.cpp` | clangd 可以自己录制（`Record.h:12-13` 明确说 "other ways are possible"） |
| 遍历 | `WalkAST.cpp` | 纯回调 API，`walkAST(Decl&, DeclCallback)` |
| 定位 | `LocateSymbol.cpp` | `locateSymbol(Symbol, LangOptions)` |
| 找头 | `FindHeaders.cpp` | `headersForSymbol(Symbol, Preprocessor&, PragmaIncludes*)` |

`headerForSymbol` 和 `walkUsed` 都是**公开 API**（`Analysis.h`），这意味着 clangd 可以在不跑完整分析的情况下，对单次悬停请求回答"这个符号来自哪个头"。

### 架构对比结论

| | IWYU | include-cleaner |
|---|---|---|
| 耦合度 | 与 Clang 内部 API 强耦合（`clang/AST/Sema`），升级易断 | 使用相对稳定的 Tooling/`RecursiveASTVisitor` API |
| 复用粒度 | 整体工具，难以部分复用 | **按阶段拆分的库**，clangd/clang-tidy 各自取所需 |
| 状态管理 | 大量全局状态（`IWYU_GLOBALS`） | 显式传参（`PragmaIncludes*`、`Preprocessor&`） |
| 测试方式 | 端到端测试 + `tests/bugs/<issue>` 目录 | 每阶段独立 `unittests/`（7 个测试文件）+ lit 测试 |

## 核心算法对比

### use 判定的粒度

**IWYU** 的 use 记录在 `OneUse` 中（`iwyu_output.h:53`），带两个正交维度：

| 维度 | 取值 | 作用 |
|---|---|---|
| use_kind | Direct / ForwardDeclare / Full | 决定是"加 include"还是"加前向声明" |
| use_flags | `UF_InCxxMethodBody` 等 5 个位标志 | 上下文修正 |

其中 **full use** 是 IWYU 的核心概念：表示"必须看到完整定义"。区分 `T* p;`（非 full，前向声明即可）与 `T obj;`（full，需要定义）的能力，是靠 `CanForwardDeclareType()`（`iwyu.cc:3386-3439`）遍历 AST 父节点上下文实现的。

**include-cleaner** 没有 full/non-full 的区分，也没有前向声明概念。它只记录 `SymbolReference{Symbol, SourceLocation, RefType}`（`Types.h:97-104`）。`Hints::CompleteSymbol` 是一个**排序提示**，不是"必须完整定义"的约束：

```cpp
// LocateSymbol.cpp:28-38
Hints declHints(const Decl *D) {
  // Definition is only needed for classes and templates for completeness.
  if (auto *TD = llvm::dyn_cast<TagDecl>(D))
    return completeIfDefinition(TD);
  ...
}
```

也就是说：`Foo f;` 和 `Foo* p;` 在 include-cleaner 眼里是**同一件事**（都是对 `Foo` 的引用），它不会建议你改用前向声明。

> **结论**：IWYU 的 use 模型严格强于 include-cleaner。前者能区分"需要定义"与"只需声明"，后者不能。

### 符号 → 头文件的映射

**IWYU：静态映射表 + 动态 pragma**

`IncludePicker`（`iwyu_include_picker.cc`）维护三类映射：

| 来源 | 例子 | 维护方式 |
|---|---|---|
| 内置映射 | `std_symbol_map.inc`、`clang_builtin_include_map.inc` | `mapgen/` 下 Python 脚本从系统头文件机械抽取 |
| 外部 `.imp` 文件 | `boost-1.75-all.imp`、`qt5_11.imp`、`python3.8.imp` | 社区维护，随仓库分发 |
| 动态映射 | `IWYU pragma: private, include "x.h"`、doxygen `@headername` | 预处理阶段扫描源码 |

映射的粒度很细，支持 5 种规则类型（`symbol:` / `include:` / `class:` / `typedef:` / `forward_decl:`），且 `symbol:` 支持"带函数参数的精确形式 → 不带参数的普通形式"两级回退。

**include-cleaner：运行时识别 + 排序提示**

`FindHeaders.cpp` 的策略完全不同：

1. `locateSymbol()` 把 Symbol 变成 `SymbolLocation` 列表（`Standard` 或 `Physical`，见 `LocateSymbol.cpp:66-77`）；
2. 对每个 location，`findHeaders()` 收集候选头（`FindHeaders.cpp:185-240`）；
3. 用 `Hints` 位标志排序（`TypesInternal.h`）：

| Hint | 含义 |
|---|---|
| `OriginHeader` | 直接定义符号的头（而非 exporter） |
| `PublicHeader` | 非 private 且 self-contained |
| `PreferredHeader` | 名字匹配符号名，或 stdlib 映射的首选 |
| `CompleteSymbol` | 该 location 是定义而非声明 |

名字匹配逻辑很朴素（`FindHeaders.cpp:64-74`）：比较 basename，大小写不敏感，遇到第一个 `.` 截断。

stdlib 映射来自 LLVM 的 `tooling::stdlib::Recognizer`（`LocateSymbol.cpp:43`），这是 clangd 一直在用的标准库符号识别器，覆盖面远小于 IWYU 的手工映射表。

> **结论**：IWYU 的映射是"穷举式"的，能处理第三方库（Qt/Boost/CPython）；include-cleaner 是"推断式"的，更通用但对特例无能为力——它自己用 `headerForAmbiguousStdSymbol()`（`FindHeaders.cpp:117-145`）硬编码了 `std::move` / `std::remove` 两个特例，这恰恰说明通用机制不够用。

### 最小集合计算

IWYU 的后处理是它最复杂的部分，`iwyu_output.cc` 用 100+ 行注释（第 1090-1160 行）描述了完整的 A/B/C/D/E 五阶段裁剪流水线：

```text
A1-A8) 裁剪前向声明 use    → 不合理的降级为 full use
B1-B8) 裁剪符号 use        → 丢弃同文件定义、builtin、反向 include
C1-C6) 计算 desired includes
D1-D?）由 desired 反推 full use 违规
E1-E3) 反推前向声明违规
```

其中 C3 明确说要做 **minimal set cover**：

> C3) Find the minimal 'set cover' over these sets: find a "add-minimal"
>     collection of files that has overlap with every set from (1).

而 `CalculateMinimalIncludes()` 的注释很坦诚：

> This makes a best-effort attempt to find the smallest set of
> #include files that satisfy all uses.  A more accurate name
> might be "calculate minimal-ish includes". :-)

include-cleaner 的 `analyze()`（`Analysis.cpp:91-164`）则简单得多：

1. 遍历每个引用，用 `Inc.match(H)`（`Types.h:186`）检查该引用是否被现有 include 满足；
2. 没被满足且 `RefType::Explicit` → 加入 `Missing`；
3. 遍历所有 include，没被任何引用用到的 → 加入 `Unused`。

**没有集合覆盖，没有去重优化，没有"哪个 include 更优"的全局决策。** 它是 O(引用数 × 候选头数) 的直线逻辑。

### 输出与修复

| | IWYU | include-cleaner |
|---|---|---|
| 报告格式 | 自定义 diff 文本（"should add these lines" + "why" 注释） | 人类可读文本 / HTML（`HTMLReport.cpp`） |
| 前向声明 | **建议添加**（可用 `--no_fwd_decls` 关闭） | **不支持** |
| 自动修复 | `fix_includes.py`（Python，独立脚本） | `fixIncludes()`（C++ 内联实现） |
| 修复质量 | 手写文本改写，处理 pragma/注释/排序 | 借用 clang-format 的 `cleanupAroundReplacements`，排序与分组最可靠 |
| 退出码 | `--error=N` / `--error_always=N` 可接入 CI | 独立工具无退出码控制；走 clang-tidy 时有 |

`fixIncludes` 的实现很巧妙（`Analysis.cpp:166-180`）：用 `UINT_MAX` 作为伪偏移编码插入/删除，交给 clang-format 的 magic cleanup 落位：

```cpp
for (const Include *I : Results.Unused)
  cantFail(R.add(tooling::Replacement(FileName, UINT_MAX, 1, I->quote())));
for (auto &[Spelled, _] : Results.Missing)
  cantFail(R.add(
      tooling::Replacement(FileName, UINT_MAX, 0, "#include " + Spelled)));
// "cleanup" turns the UINT_MAX replacements into concrete edits.
auto Positioned = cantFail(format::cleanupAroundReplacements(Code, R, Style));
```

> **结论**：include-cleaner 的修复更"干净"（直接复用 clang-format），IWYU 的修复更"全"（含前向声明），但 `fix_includes.py` 是独立的 Python 工具链，与 C++ 分析器之间存在信息往返。

## 源码注释中的「设计理念」汇总

本节把散落在源码里的设计意图集中呈现。每条都给出原文与出处。

### IWYU 的设计理念

**(1) 传递性依赖是必须消灭的**（`iwyu.cc:10-17`）：

> For every symbol ... X must be declared in CU.cc or in a header
> file directly included by itself, CU.h, or CU-inl.h.

**(2) 类型只在"显式出现"时才算 use**——这是 IWYU 最重要的一条豁免规则（`iwyu.cc:38-47`）：

> But what if you call a function that returns a type, e.g.
> 'if (FnReturningSomeSTLType()->empty())'?  Is it an iwyu violation if you
> don't #include the header for that STL type?  We say no: whatever file
> provided the function FnReturningSomeSTLType is also responsible for
> providing whatever the STL type is, so we don't have to.

这条规则的动机是**解法稳定性**：如果函数的返回类型也算使用，那么改一个函数签名的返回类型就会引发全工程 include 变更。IWYU 选择"谁提供的谁负责"。

**(3) 只前向声明类，不声明函数/变量**（`iwyu.cc:29-33`）：

> We only forward-declare classes and structs (possibly templatized).
> We will not try to forward-declare variables or functions.

**(4) 模板参数的前向声明用简单启发式**（`iwyu.cc:49-54`）：

> It can likewise be difficult to say whether a template arg is
> forward-declable: set<Foo*> x does not require the full type info
> for Foo, but remove_pointer<Foo*>::type does. ... For now we do the
> simple heuristic that if the template arg is a pointer, it's ok if
> it's forward-declared, and if not, it's not.

注意 "For now we do the simple heuristic" —— 作者知道这不精确。

**(5) 做「潜在需求分析」而非「实际使用分析」**：`HandleTranslationUnit` 附近调用 `InstantiateImplicitMethods()`。这是 IWYU 最反直觉的设计决策：Clang 默认惰性生成隐式构造/析构，但 IWYU **强制它们全部生成**，因为 IWYU 要回答的是"未来代码可能调用什么"，而不只是"当前 TU 调用了什么"。这解释了为什么 IWYU 的建议往往比"实际需要"更多——它是在为头文件的**未来使用者**负责。

**(6) 尊重作者意图**：`CodeAuthorWantsJustAForwardDeclare()`（`iwyu.cc:1427-1482`）会检测源码作者是否显式只写了前向声明而没有 include 定义文件。如果是，IWYU 尊重作者意图，不强行建议 include。

**(7) provider 分析是避免误报的主要手段**：`GetProvidedTypes` 家族（`iwyu.cc:3446-3537`）实现"如果 A 的使用必然带出 B 的完整定义，则 B 的使用无需单独报告"。这是 IWYU 比"遇到符号就要求 include"朴素方案实用的关键。

### clang-include-cleaner 的设计理念

**(1) 只报告「能证明」的**（`Analysis.cpp:119-121`）：

```cpp
// Bail out if we can't (or need not) insert an include.
if (Satisfied || Providers.empty() || Ref.RT != RefType::Explicit)
  return;
```

**(2) 引用关系有三种，而非两种**：`Types.h:85-93` 的 `RefType` 三值定义（Explicit/Implicit/Ambiguous）是它比"用到了/没用到"二值模型更精细的地方。`Ambiguous` 这个中间态的存在，让工具可以表达"我知道这里涉及这个符号，但我不能证明"。

**(3) 宏在每次定义时都是不同符号**（`Types.h:49-56`）：

```cpp
/// We consider a macro to be a different symbol each time it is defined.
struct Macro {
  const IdentifierInfo *Name;
  /// The location of the Name where the macro is defined.
  SourceLocation Definition;
  bool operator==(const Macro &S) const { return Definition == S.Definition; }
};
```

这避免了 IWYU 中"同名宏在不同文件重定义"的归属难题——直接当作两个符号。

**(4) 领域模型要抽象掉 Clang 的复杂性**（`Types.h:9-19`）：

> Find referenced files is mostly a matter of translating:
>    AST Node => declaration => source location => file
>
> clang has types for these (DynTypedNode, Decl, SourceLocation, FileID), but
> there are special cases: macros are not declarations, the concrete file where
> a standard library symbol was defined doesn't matter, etc.

`Symbol`、`Header`、`Includes` 三个 `std::variant` 包装类就是这一理念的产物。

**(5) 头文件定位可以给出多个候选并排序**：`Header::Kind`（`Types.h:109-118`）区分 `Physical` / `Standard` / `Verbatim`。`Verbatim` 专门用于 `IWYU pragma: private, include "..."` 给出的拼写——这个文件可能根本不存在于本地（`#include_next`、头映射场景），所以只能用字符串表示。

**(6) 库的分层要支持不同集成方**（`Record.h:12-13`）：

> These are the simplest way to connect include-cleaner logic to the parser,
> but other ways are possible (for example clangd records includes separately).

这解释了为什么 `walkUsed` 接受 `MacroRefs` 作为**参数**而不是自己去录制——调用方（clangd）可以自己决定怎么收集宏引用。

**(7) 忽略"自我展开"的宏**（`Analysis.cpp:40-49`）：`stdin`/`stdout`/`stderr` 是实现定义的宏、展开后仍指向自己，用户视角下使用应归因于底层声明而非宏定义本身。这类"实现细节泄漏"用启发式过滤，避免要求用户多 include 一个头。

```cpp
bool shouldIgnoreMacroReference(const Preprocessor &PP, const Macro &M) {
  auto *MI = PP.getMacroInfo(M.Name);
  // Macros that expand to themselves are confusing from user's point of view.
  return MI && MI->getNumTokens() == 1 && MI->isObjectLike() &&
         MI->getReplacementToken(0).getIdentifierInfo() == M.Name;
}
```

## 源码注释中的「缺陷与局限」汇总

一个工具源码里的 "we can't" / "FIXME" 密度，直接反映它的能力边界。本节集中列出两个工具**自己承认的**问题——这是评判成熟度的最硬指标。

### IWYU 自认的缺陷

**(1) 官方定位是实验性软件**（`README.md:24-33`）：

> ### CAVEAT ###
> This is experimental software, as of June 2024. It was originally written to
> work specifically in the Google source tree, and may make assumptions, or
> have gaps, that are immediately and embarrassingly evident in other types of
> code.

注意 "immediately and embarrassingly evident" 这个措辞，以及"暂缓新功能、优先修 bug"的明确表态。

**(2) 模板与宏是重灾区**（`docs/WhyIWYUIsDifficult.md:1-8`）：

> Include-what-you-use has the most problems with templates and macros. If your
> code doesn't use either, IWYU will probably do great. And, you're probably
> not actually programming in C++...

这句话信息量很大：**模板和宏是 IWYU 误差的主要来源**，而现实 C++ 代码几乎必然大量使用这两者。

**(3) 不支持 PCH**（`docs/IWYUFAQ.md:7-29`）：PCH 把预处理器活动折叠成预烘焙的 AST，include 指令的记录随之消失。工具**直接拒绝运行**（拒绝 `-include-pch` / `/Yu`）而非降级——诚实但有代价：大工程通常依赖 PCH。

**(4) 明确承认某些逻辑 "patently wrong"**（`iwyu.cc:1678-1682`）：

> // TODO(csilvers): this is patently wrong; figure out
> //    something better.  We need something that doesn't require
> //    the full type info for creating a scoped_ptr<MyClass>.

**(5) 最小集合只是 "minimal-ish"**：集合覆盖本身是 NP-hard，代码用优先级顺序近似（`iwyu_output.cc:950-1005`）："先选自身 → 再选关联头已选的 → 再选已在 desired 里的 → 最后选规范头"。

**(6) 反向 include 被视为 use 归属错误的信号**（`iwyu_output.cc:1136-1145` 的 B6/B7 规则）：

> B6) Sanity check: Discard 'backwards' #includes. ... This happens when
>     iwyu attributes a use to the wrong file.

作者承认 use 归属会出错，需要用 sanity check 兜底。

**(7) 存在会破坏代码的已知边界情况**（`iwyu_output.cc:1794-1801`）：

> // TODO(csilvers): this could cause breakage for code like this:
> //    x.cc:    class X {};
> //    y.h:     #include "x.cc"
> //    z.cc:    #include "y.h"; X x;
> // iwyu will say 'replace the #include of y.h with an #include of
> // x.cc,' which the code below will then strip. The end result is
> // z.cc will not #include anything, and will fail to compile.

这是**会导致编译失败**的已知缺陷，且注释里没有解决方案。

**(8) 「soft use」尚未实现**：`#ifdef FOO` 这类探测性使用不应强制要求 include 定义 `FOO` 的头文件（可能破坏条件编译语义），理想方案是"有则保留、无则不添加"的软 use，但目前尚未实现。`iwyu_output.cc:1600` 的 TODO 印证了这一点。

**(9) 宏相关的多处 TODO**（`iwyu_preprocessor.cc:925, 1023, 1034`）：归属逻辑多处标记不完整。

**(10) 与 Clang 版本强绑定**：README 用大篇幅讲版本对照表，仓库维护 `clang_<version>` 分支；源码内大量 `TODO(csilvers)` / `TODO(bolshakov)` 横跨多年未解决，维护成本高。

### clang-include-cleaner 自认的缺陷

**(1) 不能建议完全缺失的头文件**（`tool/IncludeCleaner.cpp` 的 `Overview`）——这是**最根本的能力边界**：代码必须能编译。

**(2) 模板成员解析用启发式，且承认会失败**（`WalkAST.cpp:67-77`）：

> // A heuristic: to resolve a template type to **only** its template name.
> // ... There are some exceptions that this heuristic could fail (dependent
> // base, dependent typealias), but we believe these are rare.

**(3) 显式实例化会标记错误的声明——已知并接受**（`WalkAST.cpp:96-99`）：

> // We ignore explicit instantiations. This might imply marking the wrong
> // declaration as used in specific cases, but seems like the right trade-off
> // in general.

典型的"知情取舍"：知道会错，但认为错的代价小于对的代价。

**(4) 宏拼接 token 的位置定位能力缺失**（`Analysis.cpp:62-66`）：拼接产生的 token 落在 scratch space，Clang 没有简单 API 追踪其来源，于是用宏展开位置代替，并**主动降级引用类型为 Ambiguous** 以免误报——"宁缺毋滥"哲学的体现。

**(5) 已知的性能问题**（`Analysis.cpp:76-77`）：

> // FIXME: Most of the work done here is repetitive. It might be useful to
> // have a cache/batching.

源码中没有任何缓存机制（对比 IWYU 有 `iwyu_cache.cc` 的 `FullUseCache`）。

**(6) 不处理 .cc 中定义的符号被头文件使用**（`LocateSymbol.cpp:45-51`）：无法区分"库提供的前向声明"和"偶发的前向声明"，可能对纯前向声明的文件生成 include 建议。

**(7) 多个 FIXME 集中在关键路径**：`Record.h:119`（缺 use_instead pragma）、`Record.cpp:353`（begin/end_exports 不匹配）、`FindHeaders.cpp:178/290`、`Analysis.h:42` 等。

**(8) HTML 报告的逻辑与主分析存在分歧**（`HTMLReport.cpp:508-511`）：自认"仅用于调试，分歧不致命"。

**(9) 内部结构脆弱性——作者自己承认**（`Record.h:99-101`）：

> We don't use RealPathName, as opening the file through a different name
> changes its preferred name. Clearly this is fragile!

**(10) `#include_next` / 符号链接场景靠文本比较**（`Analysis.cpp:150-153`）：符号链接或头映射场景可能出错。

**(11) 无前向声明能力的连锁后果**：由于没有 `CanForwardDeclareType` 的对应物，include-cleaner **无法**告诉用户"这个 include 可以删掉，改成前向声明"。它只能删除 include，而这在有指针/引用成员的头文件中是危险的——这是它保持 "report only" 姿态的原因之一。

**(12) 复用内部头文件的取巧**（`tool/CMakeLists.txt:3`）：

> include_directories("../lib") # FIXME: use public APIs instead.

工具本体在访问库的内部实现，说明库的公开 API 尚不完整。

### 缺陷对比总结

| 缺陷类别 | IWYU | include-cleaner |
|---|---|---|
| 模板 | 深度分析但易错，承认"最容易出问题" | 浅层采样 + 启发式，承认可能失败 |
| 宏 | 复杂归属逻辑，多处 TODO，soft use 未实现 | 有明确降级策略（Ambiguous） |
| 前向声明 | 支持但易误判 | **完全不支持** |
| PCH | **直接拒绝运行** | 无此问题（不依赖预处理完整性） |
| 性能 | 有缓存层，但整体慢 | 有已知重复计算，无缓存 |
| 会破坏代码的 bug | **有**（`iwyu_output.cc:1794`） | 无已知（因为它不改代码，除非显式 fix） |
| 维护状态 | 实验性，修 bug 为主 | LLVM 官方组件，增量开发 |

## 能力矩阵

用 ✔ / ✘ / △（部分支持或需额外配置）标注。

| 能力 | IWYU | include-cleaner | 说明 |
|---|---|---|---|
| 删除无用 include | ✔ | ✔ | 两者核心功能 |
| 补充缺失 include（间接可见） | ✔ | ✔ | 两者核心功能 |
| 补充完全缺失的 include | ✔ | ✘ | IWYU 靠映射表推断；后者需代码可编译 |
| **前向声明建议** | ✔ | ✘ | IWYU 独有，且是其重要价值 |
| **区分 full use / 非 full use** | ✔ | ✘ | IWYU 独有 |
| 模板实例化深度分析 | ✔ | ✘ | `InstantiatedTemplateVisitor` |
| 模板浅层引用识别 | ✔ | ✔ | |
| 宏 use 归属 | ✔（复杂） | ✔（简化） | 后者每次定义视为不同符号 |
| 关联头（foo.h ↔ foo.cc） | ✔（启发式+pragma） | ✔（`Record.cpp:279` 启发式） | 后者**不**继承关联头的 include |
| IWYU pragma: keep/export/private | ✔ | ✔ | include-cleaner 兼容 IWYU pragma |
| `no_include` / `no_forward_declare` | ✔ | △ | 后者部分支持（`Record.h:119` 缺 use_instead） |
| 自定义映射表（.imp） | ✔ | ✘ | 后者无等价机制 |
| 第三方库映射（Qt/Boost/Python） | ✔ | ✘ | 仓库自带 `.imp` |
| stdlib 符号识别 | ✔（手工表，覆盖面大） | ✔（`stdlib::Recognizer`，覆盖面小） | |
| 处理 PCH | ✘（拒绝运行） | ✔ | |
| 自动修复代码 | ✔（`fix_includes.py`） | ✔（`fixIncludes` + clang-format） | 后者排序质量更好 |
| CI 集成（退出码） | ✔（`--error=N`） | △（独立工具无；走 clang-tidy 有） | |
| **clangd 实时诊断** | ✘ | ✔ | include-cleaner 被 clangd 内嵌 |
| **clang-tidy 检查** | ✘ | ✔ | `misc-include-cleaner` |
| 单符号 → 头文件查询 API | ✘ | ✔（`headersForSymbol`） | clangd 悬停/补全用 |
| HTML 可视化报告 | ✘ | ✔（`HTMLReport.cpp`） | 调试用 |
| 增量/缓存 | ✔（`iwyu_cache.cc`） | ✘ | |
| 可作为库嵌入 | ✘ | ✔ | 分阶段 API |

## 各自的优势与劣势

### IWYU 的优势

1. **唯一能给出「前向声明」建议的工具**。头文件中写 `class Foo; void f(Foo*);` 而删掉 `#include "foo.h"`，可以显著缩短编译时间。include-cleaner 和 clang-tidy 都不做这件事——这是 IWYU 最不可替代的能力。
2. **有工程级的映射知识库**。`mapgen/` 脚本 + 仓库自带 `.imp` 文件，构成经过验证的跨平台符号→头文件知识：libstdc++ 的 `bits/stl_vector.h` → `<vector>`、Qt 模块聚合头、Boost、CPython、doxygen `@headername` 指令。include-cleaner 只能靠 `stdlib::Recognizer` 和 pragma，覆盖面小一个量级。
3. **use 判定最精细**。full use / 非 full use、5 个上下文标志、父节点上下文分析，能处理"按值传递 vs 按指针传递"这类细微差别。
4. **主动的「潜在需求分析」**。强制生成隐式构造/析构，对头文件的未来使用者负责，维护公共头文件时价值很高。
5. **尊重作者意图的逃生舱**。`IWYU pragma: keep/export/private/associated`、`CodeAuthorWantsJustAForwardDeclare()`、`--keep` 选项——用户有足够多的手段表达"这里我知道自己在做什么"。
6. **输出自带 "why" 注释**。每行建议都有解释，大规模重构时便于人工复核。

### IWYU 的劣势

| 劣势 | 证据 | 影响 |
|---|---|---|
| **工程可用性差** | README 自称 experimental | 大工程误报率高，需人工逐条复核 |
| **模板/宏场景质量低** | `WhyIWYUIsDifficult.md` 自认 | 现代 C++ 恰好大量使用这两者 |
| **拒绝 PCH** | `IWYUFAQ.md` | 依赖 PCH 的工程无法使用 |
| **会生成破坏编译的修复** | `iwyu_output.cc:1794` | 需要人工验证 |
| **Clang 版本强绑定** | README 版本映射表 | 升级 Clang 需等 IWYU 跟进 |
| **无 IDE 集成** | 架构上寄生在 FrontendAction | 反馈周期长，无法边写边改 |
| **映射表需维护** | 数千条 `.imp` / `.inc` | 新库/新版本需人工补充 |
| **无库化设计** | 全局状态、单体 6000 行文件 | 难以嵌入其他工具 |
| **性能** | 深度模板实例化 + 全树遍历 | 大 TU 上慢 |

### clang-include-cleaner 的优势

1. **深度集成到开发者日常工作流**——它最大的优势，没有之一：
   - **clangd 实时诊断**：编辑器里边写边提示，零额外操作；
   - **clang-tidy `misc-include-cleaner`**：复用现有 CI 流程与 `.clang-tidy` 配置；
   - **独立命令行**：批量处理。
   IWYU 只能"离线批处理"：`iwyu_tool.py` 跑一遍再 `fix_includes.py` 改。
2. **不会破坏代码**。只在有 `Explicit` 证据时才建议，独立工具默认只报告不修改，几乎不可能生成让工程编译失败的修复。
3. **修复质量高**。`fixIncludes` 直接复用 clang-format 的 include 排序与分组逻辑，产出符合项目 `.clang-format` 配置；`fix_includes.py` 是手写文本改写器，需自己实现排序。
4. **作为库的可复用性**。分阶段 API 让 clangd 能以极低成本回答"这个符号来自哪个头文件"。
5. **代码量小、可读、易改**。约 2600 行 vs IWYU 的 3 万行，一个新贡献者一天能读完 `lib/` 全部代码。
6. **与现代 Clang 生态同步演进**。随 LLVM monorepo 一起更新 API、修 bug、发版，没有"追 Clang 版本"的痛苦。
7. **兼容 IWYU 的 pragma 生态**。已为 IWYU 标注过的代码库可以直接迁移，标注投资不浪费。
8. **支持 PCH、C++20 modules 等现代构建特性**（测试目录里有 module 相关用例）。

### clang-include-cleaner 的劣势

| 劣势 | 证据 | 影响 |
|---|---|---|
| **不支持前向声明** | 无对应机制 | 无法完成"IWYU 风格"的依赖最小化 |
| **不做 full/non-full 区分** | `LocateSymbol.cpp:28-38` 只给 Hint | 无法判断"是否真需要定义" |
| **不做模板深度实例化** | 只有 `WalkAST` 浅层采样 | 模板重的代码可能漏报 |
| **无映射表机制** | 无 `.imp` 等价物 | 第三方库的私有头/公有头关系无从得知 |
| **不能建议完全缺失的头** | `Overview` 明说 | 代码必须先能编译 |
| **启发式会失败且知情** | `WalkAST.cpp:67-77` | 依赖模板基类的成员访问可能出错 |
| **无缓存** | `Analysis.cpp:76-77` FIXME | 大文件重复计算开销 |
| **偶发前向声明会误报** | `LocateSymbol.cpp:45-51` FIXME | 可能建议不该加的 include |
| **不支持 `no_forward_declare` 等** | `Record.h:119` | 迁移 IWYU 工程时需注意 |
| **路径判断靠文本比较** | `Analysis.cpp:150-153` | 符号链接/头映射场景可能出错 |
| **关联头 include 不继承** | `Record.cpp:284-286` 明说 | 与 IWYU 行为不同，迁移时需注意 |

关于最后一条，`Record.cpp:284-286` 的原文很重要：

> We consider the associated header as if it had a keep pragma.
> (Unlike IWYU, we don't treat #includes inside the associated header as if
> they were written in the main file.)

这是一个**行为差异**：IWYU 中 `foo.cc` 会"继承" `foo.h` 的 include，因此不会要求 `foo.cc` 重复 include `foo.h` 已经 include 的头；include-cleaner 不这样做，可能建议 `foo.cc` 补上 `foo.h` 已经有的 include。

## 选型建议

### 决策树

```text
你的目标是什么？
│
├─ 在 IDE 里实时提示 include 问题
│   └─→ clang-include-cleaner（clangd）  ← 没有别的选择
│
├─ 接入现有 CI（已有 clang-tidy 流程）
│   └─→ clang-include-cleaner（misc-include-cleaner 检查）
│
├─ 想把巨型工程做「IWYU 风格」的依赖最小化重构
│   └─→ IWYU（接受高误报率 + 人工复核）
│
├─ 想删掉头文件里的 #include 改用前向声明（缩短编译时间）
│   └─→ IWYU  ← 唯一选择
│
├─ 需要处理 Qt / Boost / CPython 等第三方库的私有头映射
│   └─→ IWYU  ← 有现成 .imp
│
├─ 工程依赖 PCH
│   └─→ clang-include-cleaner  ← IWYU 直接拒绝运行
│
└─ 想在自己的工具里嵌入 include 分析能力
    └─→ clang-include-cleaner  ← 提供库 API
```

### 组合使用（推荐）

两者并不互斥，且**共享 IWYU pragma 生态**，可以协同：

**阶段一：日常开发（低成本、零打扰）**——用 clangd + clang-tidy 的 `misc-include-cleaner`。它报的都是有证据的问题，开发者可以放心点"应用修复"。这一步能消除大部分明显的冗余 include。

**阶段二：定期深度清理（高成本、需复核）**——在专门的清理分支上跑 IWYU：

```bash
# 生成 compile_commands.json
cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON ...

# 批量分析
python3 iwyu_tool.py -p build/ source/*.cpp -Xiwyu --verbose=2 > iwyu.log

# 人工复核后应用
python3 fix_includes.py < iwyu.log
```

然后编译验证。IWYU 提供的前向声明建议是这一步的核心收益。

**阶段三：固化规则**——把 `IWYU pragma: keep/export/private` 写进第三方库的包装头，让两个工具都尊重这些标注。标注是**跨工具通用**的，投资不会浪费。

### 迁移注意事项

从 IWYU 迁移到 include-cleaner（或并行使用）时，注意这些**行为差异**：

1. **关联头 include 继承**：include-cleaner 不把 `foo.h` 的 include 当作 `foo.cc` 的（`Record.cpp:284-286`）；
2. **`.cc` 文件保护**：IWYU 用 E1 规则丢弃"建议 include .cc"的结论，include-cleaner 无此逻辑；
3. **`no_forward_declare`**：IWYU 支持，include-cleaner 不支持（`Record.h:119` 的 FIXME）；
4. **前向声明**：include-cleaner 完全不生成，已用 IWYU 改成前向声明的代码不会有问题，但**新的**前向声明机会不会被发现；
5. **异常情况的处置方向相反**：IWYU 倾向"猜并报告"，include-cleaner 倾向"不报告"。所以从 IWYU 切到 include-cleaner 时，**报告数量会减少**——这是正常的，不是配置错误。

## 附录：核心文件对照表

| 职责 | IWYU | clang-include-cleaner |
|---|---|---|
| 入口 | `iwyu_main.cc` | `tool/IncludeCleaner.cpp` |
| Driver 集成 | `iwyu_driver.cc` | 无（用 `ASTFrontendAction`） |
| 领域模型 | `iwyu_output.h`（`OneUse`/`IwyuFileInfo`） | `Types.h`（`Symbol`/`Header`/`Includes`） |
| AST 遍历 | `iwyu.cc`（`IwyuBaseAstVisitor`） | `WalkAST.cpp` |
| 模板分析 | `iwyu.cc`（`InstantiatedTemplateVisitor`） | 无 |
| 预处理器 | `iwyu_preprocessor.cc` | `Record.cpp`（`RecordedPP`） |
| 符号定位 | `iwyu.cc` / `iwyu_include_picker.cc` | `LocateSymbol.cpp` |
| 头文件映射 | `iwyu_include_picker.cc` | `FindHeaders.cpp` |
| pragma 处理 | `iwyu_preprocessor.cc` | `Record.cpp`（`PragmaIncludes`） |
| 主分析入口 | `CalculateAndReportIwyuViolations` | `analyze()` |
| 修复 | `fix_includes.py` | `fixIncludes()`（`Analysis.cpp`） |
| 缓存 | `iwyu_cache.cc` | 无 |
| 路径工具 | `iwyu_path_util.cc` | `IncludeSpeller.cpp` |
| 报告 | `iwyu_output.cc` | `HTMLReport.cpp` |
| 批量驱动 | `iwyu_tool.py` | 无（用 clang-tidy / clangd） |

---

**参考文献**

- IWYU：`README.md`（CAVEAT、Clang 兼容性）；`docs/WhyIWYU.md`、`WhyIWYUIsDifficult.md`、`WhatIsAUse.md`、`IWYUStyle.md`、`IWYUPragmas.md`、`IWYUMappings.md`、`IWYUFAQ.md`；`iwyu.cc:10-88`（三分类规则）、`iwyu.cc:318-340`（visitor 层次）、`iwyu_output.cc:1090-1160`（裁剪流水线）
- clang-include-cleaner：`include/clang-include-cleaner/Types.h`、`Analysis.h`、`Record.h`；`lib/WalkAST.cpp`、`LocateSymbol.cpp`、`FindHeaders.cpp`、`Analysis.cpp`；`tool/IncludeCleaner.cpp`

