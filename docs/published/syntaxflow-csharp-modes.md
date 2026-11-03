---
title: SyntaxFlow 最近的升级：三种检测模式、分阶段报告与完整的 C#/.NET 支持
date: '2026-10-10T06:06:06.000Z'
permalink: /writing/syntaxflow-csharp-modes/
categories:
  - SyntaxFlow
tags:
  - SyntaxFlow
  - 技术文章
source: 'https://feishu-4dogs.feishu.cn/wiki/DF4hw9UniigYkzktzuJcGNdEnXd'
sourceName: 飞书源文档
sourceCreatedAt: '2026-10-10T06:06:06.000Z'
sourceUpdatedAt: '2026-10-10T06:21:14.000Z'
dateBasis: source-created
originalPublishedAt: null
publicationDateVerified: false
publicationStatus: author-confirmed
importedAt: '2026-10-30'
---
# SyntaxFlow 最近的升级：三种检测模式、分阶段报告与完整的 C#/.NET 支持



最近 SyntaxFlow 做了一次比较大的升级。扫描方式、阶段信息、规则覆盖、大项目表现都有明显变化。这篇文章把这些变化讲清楚，并在中间穿插真实项目的扫描片段作为例子。



## 一、一次扫描，三种互补的检测模式



过去提到 SyntaxFlow，默认的理解是：编译 SSA，然后做数据流分析。现在引擎里跑的是三种互补的检测模式。

![图片展示了SyntaxFlow三种扫描模式的分析深度与理解能力。source模式（源码检测）分析速度快，适合硬编码密钥、危险配置等；struct模式（结构检测）分析中等速度，可理解代码结构和包内代码数据流；ssa模式（语义检测）分析速度较慢，可理解完整代码仓库数据流。三种模式互补，可按需组合，分析越深耗时越长。该图与上文介绍的三种检测模式相呼应，直观呈现了各模式的特点。](/media/articles/74ca891a6463e497.webp)

**source 模式（源码检测）**：直接在源码文本上匹配，不需要编译。适合"看代码形态就能判断"的问题——硬编码密钥、危险配置、不安全的写法。因为不依赖编译，收集完代码立刻就能出结果。



**struct 模式（结构检测）**：在每个编译单元编译骨架之后执行。每个包的骨架编译出来，先把包内的语义结构检查掉，再继续下一个单元，不用等整个项目编译完。适合"包内就能定性"的问题——危险 API 调用、不安全的语言结构。



**ssa 模式（语义检测）**：全项目 SSA 编译完成后执行，做跨函数、跨包的数据流和污点分析。适合必须追踪数据来源的问题——SQL 注入、SSRF、完整的 XSS 污点链。



三种模式不是三选一，而是互补。`yak code-scan` 默认把三种都跑一遍，也可以用 `--mode` 指定只跑其中一种或两种。



用一个真实的小项目看效果会很直观。下面是对一个 PHP 靶场项目（169 个 PHP 文件、9 个 JS 文件，约 6.3 MB）只跑源码检测的输出：



```Plain Text
$ yak code-scan -t ./target --mode source

[INFO] [code-scan] 代码检测 (inspect) stage=100% overall=30%
[INFO] [Task e63d106d-309d-461c-a413-ddfccd41c8b1]
[INFO]   status=done progress=30.00%
[INFO]   Failed=0 Skipped=0 Success=595 Finished=595 Total=595 Risk=125

===============================================
 Scan Summary
===============================================
| Failed Rules         |                    0 |
| Risk Count           |                  125 |
| Success Rules        |                  595 |
| Total Rules          |                  595 |
| Total Scan Time      |           1.1037101s |
===============================================
```



595 条规则、1.1 秒、125 条风险。这就是"不编译也能出结果"的实际体感。



源码检测这一轮还有几处能力增强，可以理解为原有文本匹配能力的增强版本——以前也能匹配，现在匹配得更准、表达力更强：



- **上下文感知的正则**：支持"只有出现在某个代码块内部的匹配才算命中"、"出现在这段配置里的不算"、"多个正则同时命中才算"这类组合条件。规则语法上新增了 `inside` / `not_inside` 两个操作符，`&` 和 `-` 在源码命中值上改为区间重叠语义。
- **在文件中继续搜索**：支持 `$hit.pattern_regex(...)` 这类链式写法——拿到一个命中之后，在它所在的文件里继续搜索下一个模式（默认 `scope=file`，也可切到 `scope=region`），用来表达"先定位到某个块，再看块里有没有危险写法"。
- **命中位置带完整上下文**：以前告警只有一段匹配片段，没有文件路径和行号，遇到多字节字符（比如中文注释）时行列还会错位。现在每个命中都锚定到完整文件，位置计算统一为字节语义，告警带上真实文件路径、行号和代码片段；每条风险还新增了 `scan_mode` 字段，标记它来自源码检测还是语义分析。
- **与编译解耦**：对本地目录、Git 仓库、zip/jar 包这些输入，源码检测先收集源码直接扫描，不再为了拿到源码目录而先编译一遍 SSA；如果这次扫描同时包含语义分析，收集好的源码目录会被复用。

## 二、扫描过程会输出四个阶段的信息



SyntaxFlow 现在会在扫描过程中汇报四个产品阶段：**收集代码 → 代码检测 → 语义检测 → 深度分析**。



![图片展示了SyntaxFlow扫描过程的四个阶段。1. 收集代码，统计文件数、代码行数、体积；2. 代码检测，进行源码模式规则匹配，文本级、密钥、危险配置、不安全写法等；3. 语义检测，编译期struct检查，包内危险调用、不安全语言结构；4. 深度分析，SSA语义分析，跨函数、跨文件污点链、复杂数据流。每个阶段独立汇报规则数、风险数与耗时，未执行的阶段标记为跳过，阶段状态有succeeded和skipped，规则数与风险数随扫描结果持久化。](/media/articles/ab897c5a9587c60d.webp)

每个阶段独立汇报自己的执行信息：跑了多少条规则、命中多少条风险、实际消耗的规则耗时。这些信息跟随扫描结果一起返回并持久化，所以即使扫描进程的事件流已经过期，事后仍然能查到本次扫描在收集阶段处理了多少文件、多少代码行、多少体积，以及每个阶段的规则执行情况。



对只请求了部分阶段的扫描（比如只跑代码检测），没有执行的阶段会被明确标记为跳过，而不是留下含义不明的空状态。



上面那个小项目跑完整三模式时，四个阶段的日志是这样的：



```Plain Text
[INFO] [code-scan] 收集代码 (collect) stage=0%   overall=0%
[INFO] [code-scan] 收集代码 (collect) stage=100% overall=10%
[INFO] [code-scan] 代码检测 (inspect) stage=0%   overall=10%
[INFO] [manager:403] rulecount 595 ; total query: 595
[INFO] [code-scan] 语义检测 (review) stage=0%    overall=30%
[INFO] [code-scan] 深度分析 (analyze) stage=100% overall=100%

[INFO] [code-scan] stage 收集代码 (collect) status=succeeded duration_ms=0    rules=0   risks=0
[INFO] [code-scan] stage 代码检测 (inspect) status=succeeded duration_ms=1118 rules=595 risks=125
[INFO] [code-scan] stage 语义检测 (review)  status=succeeded duration_ms=9568 rules=151 risks=1510
[INFO] [code-scan] stage 深度分析 (analyze) status=succeeded duration_ms=342  rules=348 risks=0
```



深度分析阶段有个细节值得说明：348 条规则里有 347 条因为语言不匹配被跳过。内置 SSA 规则覆盖 Java、C#、Go 等多种语言，而这个小项目是 PHP/JS，引擎会自动跳过不适用的规则，不在无关语言上浪费分析开销。日志里逐条标注了原因：



```Plain Text
- [DONE] [100.00%]: 检测 Java 路径遍历漏洞        status=skipped: language mismatch
- [DONE] [100.00%]: 检测 Java EE 的 XSS 漏洞      status=skipped: language mismatch
- [DONE] [100.00%]: 检测 C 语言缓冲区溢出漏洞      status=skipped: language mismatch
```



另外，每个阶段的 `risks` 是该阶段**流式上报的计数**。同一个问题如果同时被前一阶段和后一阶段命中，最终报告只保留后一阶段（更精确）的那条。所以阶段计数相加不等于最终报告条数——上面这次扫描最终报告是 150 条（125 条源码检测 + 25 条结构检测）。



这些阶段信息同时暴露给 CLI 和平台侧使用，客户端界面会逐步呈现。



## 三、规则库：规模、速度与精度分级



目前内置规则文件近 1200 个。其中显式声明了扫描模式的有 759 条：source 584 条、struct 151 条、ssa 24 条；其余是不带模式声明的历史规则。



三种模式的预期速度和理解能力，本质上是分析深度不同：source 只看文本，所以快；struct 在一个包的结构内做判断，所以中等；ssa 要追踪数据在整个代码仓库里的流动，所以慢。三种模式可以按需组合——想快速摸底只跑 source，想做完整检测三种全开。



### 规则分布

![图片展示了SyntaxFlow规则分布的三种扫描模式情况。横线长度代表该模式显式声明扫描模式的规则数量，线内色块表示语言构成。source模式下，规则数量为584条，其中general占584条；struct模式下，规则数量为151条，包含Java、Python、Cil、PHP、ECMAScript、Go、C等语言；ssa模式下，规则数量为24条，同样包含多种语言。该图与上下文介绍的三种模式的规则数量及语言构成相呼应。](/media/articles/d170682b78f1e3a7.webp)

（图：三条横向长条对应三种扫描模式，**条的长度代表该模式的规则数量**；条内色块代表语言构成，颜色与底部图例一一对应。source 规则最多（584 条），struct 151 条，ssa 规则最少（24 条）。数据截至 2026-10-10。）



从语言构成看，source 规则中语言无关的通用规则（general）有 345 条，其余以 Java（56）、Python（45）、PHP（41）、C#（39）为主；struct 规则集中在 Java（44）、Python（28）、C#（25）、PHP（24）；ssa 规则最少（24 条），覆盖 Java（6）、C#（5）、Python（4）、PHP（4）等语言。



### 组织方式与质量



**按 CWE 和代码模式组织，而不是按 CVE 指纹。** 以 Java Spring 系列为例，新增的 41 条规则是按通用漏洞类型写的——SQL 注入、命令注入、路径穿越、XSS、CSRF、开放重定向、SSRF、XXE、反序列化、弱加密等——而不是针对某个 CVE 的特定代码形状。同一个漏洞类型出现在其他项目、其他框架里同样能命中。



**按扫描模式拆分规则。** 同一条检测目标会按"用什么方式判定最合适"落到不同模式：字面量和配置类问题放 source，能靠调用本身定性的放 struct，需要追踪数据流的放 ssa。



**每条规则都有可读的说明和修复建议。** 全部 source 规则都带完整描述，写清楚漏洞原理、触发场景、影响分析和修复方式。



**误报经过专门治理。** 有一批改动专门针对高频误报，改完在真实项目上重扫对比。可量化的例子：某个 PHP 项目里反引号相关的误报从 11 条降到 0；70 个 shell 文件的变量展开误报从 611 条降到 147。



**规则自带正反例校验。** 内置规则内嵌正例和反例用例，规则改动后必须做到正例命中、反例保持干净，否则内置校验不通过。实际跑一次校验的输出：



```Plain Text
$ yak verify-builtin-risk
[INFO] inspected 1196 rules (102 libraries), 1317 alerts, 112 risk types
```



### 规则命中的样子



还是用那个 PHP 靶场项目做例子，源码检测命中的风险按规则聚合，前几名是这些：



| 规则 | 命中数 | 说明 |
|-|-|-|
| `source-php-shell-exec` | 24 | PHP shell 命令执行 |
| `source-php-md5` | 21 | PHP `md5` 弱哈希 |
| `source-php-header-call` | 12 | 响应头写入外部数据 |
| `source-php-mt-rand` | 12 | `mt_rand` 弱随机数 |
| `source-php-backticks` | 10 | PHP 反引号执行命令 |
| `source-js-innerhtml` | 6 | JS `innerHTML` 赋值 |
| `source-php-xpath-query` | 6 | XPath 查询注入 |
| `source-php-allow-url-include` | 6 | 危险的 URL include |
| `source-js-eval` | 4 | JS `eval` |
| `source-secrets-username-password-uri` | 4 | 代码中硬编码的账号密码 |



报告里每条风险都带文件路径、行号、列号：



```Plain Text
source-php-shell-exec              vulnerabilities/exec/source/low.php          line 10
source-php-md5                     vulnerabilities/captcha/source/low.php       line 57
source-php-backticks               vulnerabilities/captcha/source/low.php       line 60
source-php-allow-url-include       includes/page.inc.php                        line 672
source-php-header-location         vulnerabilities/fi/index.php                line 38
source-js-eval                     vulnerabilities/javascript/source/high.js    line 83
source-secret-password-assignment  vulnerabilities/sqli/test.php               line 4
```



## 四、C#/.NET：完整补上的新语言



C#/.NET 是这一轮重点补齐的方向。以前做 .NET 项目可用的安全规则有限，现在 C# 有了成体系的覆盖。



**规则规模与覆盖面。** C# 内置规则 90 条，分布在 29 个 CWE 类别中，另有 7 条 `lib` 规则用于描述 source/sink 等基础语义。



| 类别 | 覆盖内容 |
|-|-|
| 注入类 | SQL 注入（`SqlCommand`、`CommandText`、字符串拼接与插值）、命令注入（`Process.Start`）、LDAP 注入（`DirectorySearcher.Filter`）、XPath 注入、XML 注入 |
| 反序列化 | `BinaryFormatter`、Newtonsoft `TypeNameHandling` 不安全配置、`SoapFormatter` / `LosFormatter` |
| 危险数据流 | 路径穿越、SSRF（`HttpClient`）、XXE（`LoadXml`）、XSS（`Response.Write`、`Html.Raw`）、开放重定向 |
| 加密与配置 | 弱加密算法（含 ECB 模式）、弱随机数（`System.Random`）、证书校验回调、明文传输、未签名 Token、Cookie 安全与 `SameSite` |
| 其他 | 代码注入、不安全反射、Mass Assignment、CORS 配置、堆栈信息泄露、正则 DoS、日志伪造、响应头注入 |



**C# 现在和其他语言一样得到完整支持。** 语言前端、SSA 构建、规则描述、正反例校验、三种扫描模式，C# 都齐了。按模式统计，C# 规则里 source 39 条、struct 25 条、ssa 5 条，分工是：



- 危险调用本身就能定性（`BinaryFormatter.Deserialize`、`System.Random`、`DirectorySearcher`）→ struct 模式，编译期查掉
- 需要追踪数据来源（SQL 注入、XSS、路径穿越）→ SSA 数据流
- 纯字面量和配置类判断 → source 规则

**规则描述完整可读。** 每条规则都带漏洞原理、触发场景、影响分析和修复建议。以 SQL 注入规则为例，描述里会给出有问题的 C# 代码，说明攻击者把输入改成 `name' OR 'a'='a` 之后 WHERE 条件为什么会恒为真、带分号时如何变成多条语句删除整表，最后给出参数化查询的修复方式。



**背后是独立语言前端。** C# 不是靠文本匹配实现的，引擎里有完整的 `csharp2ssa` 语言前端，包含 ANTLR 语法定义和 48 个测试文件，能解析 C# 语法并构建 SSA 与类型信息。这是 struct 和 ssa 模式规则能真正生效的前提——构造函数分发、继承体系、`global using`、顶层局部函数、数据库重载后的语义一致性，都有对应的测试覆盖。



**规则经过校准收紧。** 弱随机数规则从只认 `new Random()` 扩展到 `Random.Next`；SQL 注入覆盖 `CommandText` 和参数拼接，同时避免全图展开撞上分析预算上限、反而漏掉真正的注入点；信噪比差的写法（比如 `Path.Combine`、泛化的反序列化调用）被主动移除。



## 五、在大型项目上的实际效果



前面用的是小项目。用一个大型 Java 项目（约 7800 个 Java 源文件、源码体积约 1.9 GB）做完整扫描，更能看出这套引擎在大项目上的表现。



这个项目已经编译完成，SSA 数据库里有约 343 万条 IR。直接对它跑语义分析：



```Plain Text
$ yak code-scan -p <program> --database ./ssadb.db --mode ssa

[INFO] [code-scan] 深度分析 (analyze) stage=100% overall=100%

===============================================
 Scan Summary
===============================================
| Failed Rules         |                    1 |
| Risk Count           |                11229 |
| Success Rules        |                  168 |
| Total Rules          |                  348 |
| Total Scan Time      |      8m28.400868927s |
===============================================

[INFO] [code-scan] stage 深度分析 (analyze) status=succeeded duration_ms=661982 rules=348 risks=11229
[INFO] [pprof] runtime stats saved: host_cpu=33.3% host_mem=24021MiB task_rss=15187MiB
```



约 343 万条 IR、348 条规则、命中 11229 条风险，总耗时 8 分 28 秒。其中 179 条规则因语言不匹配跳过，168 条成功执行；1 条规则因超出单规则时间预算被中断，带部分结果结束——这正是工作量预算机制在起作用：宁可让一条病态规则带着部分结果退出，也不让它拖住整次扫描。



命中的风险按规则聚合，排在前面的几类是这样：



| 规则 | 命中数 |
|-|-|
| 数据流：Java MongoDB 查询拼接 | 8030 |
| 数据流：Java 会话写入请求参数 | 1164 |
| Check Java java.security 使用不安全哈希算法 | 291 |
| Check Java Hibernate Session 未释放资源 | 271 |
| Check Java IO 未检查返回值 | 210 |
| Check Java System.setProperty 接受外部值 | 168 |
| Check Java java.sql Connection 未释放资源 | 163 |
| Check Java java.sql Statement 未释放资源 | 152 |
| Check Java Hibernate Connection 未释放资源 | 137 |



报告里的每条风险同样带完整定位信息：



```Plain Text
Java InetAddress DNS 查询用于安全决策   src/main/java/.../cluster/business/ServerAPIImpl.java      line 72
Java 不安全的 Process WaitFor          src/main/java/.../util/DbExporterUtil.java                 line 12
Java 打印堆栈导致信息泄露              src/enterprise/java/.../dao/ACheckerDAO.java               line 88
数据流：Java System.setProperty         src/main/java/.../workflows/actionlet/Archive.java         line 41
Java XStream 不安全反序列化            src/main/java/.../publishing/BundlerUtil.java              line 33
Java 路径遍历漏洞                      src/main/java/.../publisher/pusher/PushPublisher.java      line 57
Java 不安全反射 Class.forName          src/main/java/.../util/ClassUtils.java                     line 26
```



这就是"能理解完整代码仓库数据流"的含义：像 MongoDB 查询拼接这类问题，需要从 HTTP 请求入口一路追踪参数到数据库查询，跨越多个包和调用层。8 分钟跑完近 7800 个文件的语义分析，这是过去很难做到的规模。



整个过程还会生成性能采样文件，随时可以查看资源占用：



```Plain Text
[INFO] [pprof] heap profile saved:      .../memory-pprof/...-final.mem.prof
[INFO] [pprof] goroutine profile saved: .../goroutine-pprof/...-final.goroutine.prof
[INFO] [pprof] db stats saved:          ... total=847672 query=847672
[INFO] [pprof] runtime stats saved:     ... host_cpu=33.3% task_rss=15187MiB
```



### 大项目上的几项工程能力



**结果可复现。** 成员展开顺序以前依赖不确定的遍历顺序，同样的分析预算可能消耗在不同地方，导致同一份数据两次扫描结果不一致。现在成员按稳定的 key 与 member id 顺序遍历，每个成员仍然只访问一次。



**分析效率明显提升。** 对象成员遍历以前会把类的方法成员也当作数据槽展开，读一次 `obj.m()` 可能顺着整个类型的方法面全部跟进，这是分析预算被快速耗尽的主要原因之一。优化后的实测数据：



| 指标 | 优化前 | 优化后 |
|-|-|-|
| 平均展开对象数 | 189.5 | 14.4 |
| 平均枚举成员数 | 315.2 | 19.7 |
| 最终输出风险数 | 137 | 137 |



风险位置一个都没少。



**规则有工作量预算。**



| 参数 | 默认值 | 说明 |
|-|-|-|
| `--rule-work-limit` | 50000 | 单条规则可处理的最大扇出节点数；超预算的重规则带部分结果结束。设为 0 关闭 |
| `--rule-timeout` | 4h | 单条规则的墙钟时间上限，超时的规则被中断而不是挂住整个扫描 |



**扫描过程可观测。** `--debug` 指定一个目录，扫描会产出结构化调试产物：



```Plain Text
<debug-dir>/
├── ssadb.db              # SSA 数据库
├── log                   # 扫描日志
├── report.sarif          # 扫描报告
├── cmd.txt               # 本次执行的命令
├── cpu-pprof/            # CPU 性能采样
├── memory-pprof/         # 内存采样
├── goroutine-pprof/      # goroutine 采样
├── db-stats/             # 数据库统计
└── runtime-stats/        # 运行时统计
```



**扫描可以只出报告不写库。** `--no-save-risk` 让风险结果只保留在内存和报告输出中（`--output` 与回调照常），扫描任务状态仍然记录。



## 六、和 CI、平台集成



- **SARIF 输出支持 GitHub Code Scanning。** 扫描结果可以直接输出为 SARIF 格式并上传到 GitHub 代码扫描页面。告警身份按类别和 ruleId 组合保持稳定，重复扫描不会把同一条问题变成两条；规则说明会渲染成 Markdown。
- **规则包可以由调用方提供。** 除了内置规则，自定义的 `.sf` 规则文件、规则目录（包括嵌套目录）都可以驱动三种模式的扫描。
- **规则快照可校验。** 节点侧会校验收到的规则快照与原始传输项是否一致，避免规则分发过程中出现不一致。
- **CI 的 diff 检查更聪明。** 改动内容里没有 Go 文件时会标记为合法跳过；如果确实包含 Go 文件而编译失败，仍然如实报错。

## 七、CLI 现在已经可用，客户端随后跟上



上面提到的能力，现在在命令行上都已经可用：



```Bash
# 三种检测模式全部执行（默认行为）
yak code-scan -t ./your-project

# 只做源码检测，不进行编译
yak code-scan -t ./your-project --mode source

# 指定要执行的检测模式
yak code-scan -t ./your-project --mode source --mode struct

# 使用自定义规则（文件、目录或内联写法）
yak code-scan -t ./your-project --syntaxflow ./my-rules/

# 扫描已有的分析库，但不写入风险结果
yak code-scan -p my-program --no-save-risk

# 保留调试产物与性能数据
yak code-scan -t ./your-project --debug /path/to/debug-output

# 校验内置规则的正例命中与反例干净
yak verify-builtin-risk
```



几种常见场景的用法：



| 场景 | 建议命令 |
|-|-|
| 快速摸底，不编译 | `--mode source` |
| 结构问题为主 | `--mode struct` |
| 完整检测 | 默认（三种模式） |
| 只需重跑自定义规则 | `--syntaxflow <路径>` 搭配已有 program |



**客户端这部分会在下一步补齐。** 目前客户端界面上还没有把三种模式的分工和四个阶段的信息完整呈现出来，后续会把 CLI 上已经稳定的这套能力接入客户端，让习惯图形界面的用户也能直接用上。



## 写在最后



这次升级的主线可以概括为三件事：



1. 检测从单一的数据流分析扩展为三种互补模式：快速分析文本、理解代码结构与包内数据流、理解完整代码仓库的数据流
2. 扫描过程输出结构化的四阶段信息与规模统计
3. 规则库按模式重新组织，补齐了 C#/.NET

CLI 上已经可以完整体验；客户端会紧随其后。
