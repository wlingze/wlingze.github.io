import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';

const exec = promisify(execFile);
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const env = token ? { ...process.env, GH_TOKEN: token } : process.env;
const api = async (endpoint) => JSON.parse((await exec('gh', ['api', endpoint], { env, timeout: 30000, maxBuffer: 8 * 1024 * 1024 })).stdout);
const graphql = async (query, fields = {}) => {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(fields)) args.push('-f', `${key}=${value}`);
  const result = JSON.parse((await exec('gh', args, { env, timeout: 30000, maxBuffer: 8 * 1024 * 1024 })).stdout);
  if (result.errors) throw new Error(JSON.stringify(result.errors));
  return result.data;
};

// Curated copy and links live here; dates, languages and stars come from the API.
const definitions = [
  {
    repo: 'wlingze/muxterm', title: 'Muxterm', group: 'personal', role: '个人项目',
    description: '把本地、SSH 与 tmux 工作放进同一个原生终端。',
    detail: '跨平台原生终端：Rust Core 配合 GTK4、SwiftUI、TUI 与 CLI 前端，把本地 shell、SSH 会话和 tmux 工作区收进同一个窗口。',
    site: 'https://wlingze.github.io/muxterm/', siteLabel: 'wlingze.github.io/muxterm',
  },
  {
    repo: 'wlingze/intentflow', title: 'intentflow', group: 'personal', role: '个人项目',
    description: '本地 diff 工作台：逐文件读改动、写评论，把评审复制给 AI。',
    detail: '单文件二进制，运行时只依赖 Git；按文件与 hunk 阅读改动，支持行级与跨行评论、全仓符号引用与全局搜索，导出 Markdown 或 JSON 交给 Claude Code、Codex 或 pi。',
    site: 'https://wlingze.github.io/intentflow/', siteLabel: 'wlingze.github.io/intentflow',
  },
  {
    repo: 'yaklang/yaklang', title: 'Yaklang / YakSSA', group: 'work', role: '参与开发',
    description: '统一 SSA 中间表示、跨过程分析与 SyntaxFlow 代码审计引擎。',
    detail: '参与 YakSSA 的 SSA 前端、跨过程分析与 SyntaxFlow 规则引擎；近期集中在扫描性能、风险分级与 SSA2LLVM 原生编译。',
    site: 'https://yaklang.io/', siteLabel: 'yaklang.io',
  },
  {
    repo: 'yaklang/ssa.to', title: 'SyntaxFlow 文档', group: 'work', role: '参与维护',
    description: '记录 SSA、SyntaxFlow 查询语言与审计流程的公开文档。',
    detail: '整理程序分析引擎的设计说明、SyntaxFlow 语法与数据流查询示例，作为公开文档站点发布。',
    site: 'https://ssa.to/', siteLabel: 'ssa.to',
  },
  {
    repo: 'gojue/ecapture', title: 'eCapture', group: 'contribution', role: '贡献代码',
    description: 'eBPF 驱动的 TLS 明文抓取工具。',
    detail: '为 eCapture 提交 pclntab 解析修复，解决 Go 程序符号地址定位问题（PR #516，已合并）。',
    site: 'https://ecapture.cc/', siteLabel: 'ecapture.cc',
  },
  {
    repo: 'wlingze/icecream-lua', title: 'icecream-lua', group: 'personal', role: '个人仓库',
    description: '给 Lua 调试输出补上表达式与上下文信息。',
    detail: '受 icecream 启发的 Lua 调试输出工具，打印表达式本身、文件名与行号，减少手写 print 的噪音。',
    site: null,
  },
  {
    repo: 'wlingze/golang_rev', title: 'golang_rev', group: 'personal', role: '个人项目',
    description: 'IDA 插件：恢复去符号 Go 二进制里的函数名与字符串。',
    detail: '解析 .gopclntab 恢复函数名并跳到 main.main，支持快速设置字符串与指针重命名，用于 Go 逆向时的符号恢复。',
    site: null,
  },
  {
    repo: 'wlingze/IdaWorkspace', title: 'IdaWorkspace', group: 'personal', role: '早期工具',
    description: '辅助逆向分析的 IDA 结构体构建插件。',
    detail: '在 IDA 中批量构建、导入与整理结构体定义的辅助插件，用于逆向分析时的类型恢复。',
    site: null,
  },
  {
    repo: 'wlingze/TinySTL', title: 'TinySTL', group: 'personal', role: '学习项目',
    description: '用 C++11 学习和实现 STL 容器与基础组件。',
    detail: '按 STL 的组织方式实现 vector、list、allocator、iterator 与 traits，用于理解标准库的设计取舍。',
    site: null,
  },
];

const staticEntries = [
  {
    id: 'irify', title: 'IRify', group: 'work', role: '参与开发',
    description: 'Yaklang 的代码审计平台。',
    detail: '把 SyntaxFlow 规则、检测模式与误报分级做成可用的审计产品；参与规则覆盖、扫描性能与结果解释。',
    site: 'https://ssa.to/', siteLabel: 'ssa.to',
    url: null, repository: null, language: null, updatedAt: null, stars: null,
  },
];

const projects = [];
for (const definition of definitions) {
  const r = await api(`repos/${definition.repo}`);
  if (r.private) throw new Error(`Refusing private repository: ${definition.repo}`);
  projects.push({
    id: definition.repo.split('/')[1],
    title: definition.title,
    repository: definition.repo,
    group: definition.group,
    role: definition.role,
    description: definition.description,
    detail: definition.detail,
    site: definition.site,
    siteLabel: definition.siteLabel ?? null,
    url: r.html_url,
    updatedAt: r.pushed_at,
    language: r.language,
    stars: r.stargazers_count,
    archived: r.archived,
  });
}
projects.push(...staticEntries);

const profile = await api('users/wlingze');

const now = new Date();
const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const to = now.toISOString().slice(0, 10);
const calendar = (await graphql(
  `query($from: DateTime!, $to: DateTime!) { user(login: "wlingze") { contributionsCollection(from: $from, to: $to) { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } } } } }`,
  { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
)).user.contributionsCollection.contributionCalendar;
const levels = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const contributions = {
  from,
  to,
  total: calendar.totalContributions,
  days: calendar.weeks.flatMap((week) => week.contributionDays.map((day) => ({ date: day.date, count: day.contributionCount, level: levels[day.contributionLevel] ?? 0 }))),
};

// Pull requests only. Commits and private repositories stay out of the site.
// Paginate so the timeline covers a full year, not just the latest page.
const prs = [];
let cursor = null;
for (let page = 0; page < 3; page += 1) {
  const data = await graphql(
    `query($after: String) { user(login: "wlingze") { pullRequests(first: 100, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) { pageInfo { hasNextPage endCursor } nodes { title url createdAt updatedAt mergedAt state repository { nameWithOwner isPrivate } } } } }`,
    cursor ? { after: cursor } : {},
  );
  const connection = data.user.pullRequests;
  prs.push(...connection.nodes);
  if (!connection.pageInfo.hasNextPage) break;
  cursor = connection.pageInfo.endCursor;
}
const activity = prs
  .filter((pr) => !pr.repository.isPrivate)
  .filter((pr) => pr.createdAt.slice(0, 10) >= from || (pr.mergedAt && pr.mergedAt.slice(0, 10) >= from))
  .map((pr) => ({
    title: pr.title,
    url: pr.url,
    repository: pr.repository.nameWithOwner,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    mergedAt: pr.mergedAt,
    state: pr.mergedAt ? 'merged' : pr.state.toLowerCase(),
  }));

await fs.mkdir('src/data', { recursive: true });
await fs.writeFile('src/data/github.json', JSON.stringify({
  account: 'wlingze',
  fetchedAt: now.toISOString(),
  profile: {
    login: profile.login,
    name: profile.name,
    twitter: profile.twitter_username,
    blog: profile.blog,
    followers: profile.followers,
    publicRepos: profile.public_repos,
  },
  contributions,
  projects,
  activity,
}, null, 2) + '\n');
console.log(`Recorded ${projects.length} projects, ${activity.length} pull requests and ${contributions.total} contributions.`);
