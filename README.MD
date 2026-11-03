# wlingze.github.io

令则（wlingze）的个人站点：程序分析、终端应用与技术写作。

线上地址：<https://wlingze.github.io>

## 技术栈

- **Astro 7** 静态输出，部署到 GitHub Pages。
- **Markdown** 作为唯一内容源，保留在 `docs/`。
- 旧的 VuePress 主题与配置留在仓库里作参考，不参与构建。
- 字体自托管：标题与正文 Newsreader，界面 Hanken Grotesk，日期 IBM Plex Mono。

## 目录

```
docs/                  文章与页面（Markdown）
  published/           从飞书文档整理的文章（14 篇）
  .vuepress/public/    图片、头像等静态资源
src/
  pages/               首页、近况、项目、文章索引、链接、文章详情、RSS、404
  layouts/             页面骨架
  components/          页头、页脚、搜索
  lib/content.mjs      Markdown 读取、渲染、日期与链接处理
  styles/              设计令牌、基础样式、页面样式
  data/                GitHub 快照与图片尺寸
scripts/
  import-lark.mjs      飞书文档转 Markdown（只读，需本机授权）
  refresh-github.mjs   抓取公开仓库、PR 与贡献日历
  check-site.mjs       站内链接与旧链接检查
  check-a11y.mjs       WCAG A/AA 检查
tests/                 内容与数据一致性测试
```

## 命令

```bash
npm ci
npm run dev             # 本地开发
npm run build           # 生成 dist/
npm run preview         # 预览构建结果
npm test                # 内容测试
npm run check           # 测试 + 构建 + 链接检查 + 可访问性检查
npm run refresh:github  # 更新公开仓库与 PR 数据
```

## 开发审阅评论

`npm run dev` 启动后，页面右下角有「评论」按钮（只在开发环境）：

1. 点按钮进入评论模式；
2. 选中一段文字，或点一个块，弹出输入框；
3. 写要改什么，按 `Ctrl/⌘ + Enter` 或点「保存」；
4. 说「处理评论」，agent 读取后修改。

评论写入 `.hallmark/comments.json`，记录页面、引用文字、源文件与行号；该文件不进仓库。

查看与关闭：

```bash
npm run comments -- list          # 只看未处理
npm run comments -- list --all    # 全部
npm run comments -- resolve 3 "已改小字号"
npm run comments -- reopen 3
```

已保存的评论会在页面上显示为编号圆点，悬停可看内容。

`.astro` 组件的位置来自 Astro 写入的标记（审计插件会删除，脚本提前保存）。Markdown 正文的行号由 `content.mjs` 在开发环境写入，渲染时保持行数以免偏移。生产构建不包含这段脚本、接口与 `data-dev-*` 属性。

Astro 内置的 Inspect 只识别交互岛屿；本站是纯静态站点，所以它显示 No islands detected，属于预期。

## 联系信息

`src/data/contact.json` 里的 `email` 是站点公开邮箱。留空时，关于页显示“邮箱地址暂不公开”，链接页不显示邮箱条目，友链区改为引导到仓库 issue。填上地址后，关于页、链接页与友链申请都会使用它。

## 内容约定

- 每篇文章都有 `title`、`date`、`permalink`、`categories`、`tags`。
- 旧链接保持不变：文章按 `permalink` 输出，同时为每个 `.md` 生成 `.html` 跳转。
- 友链从 `docs/friends.md` 读取，显示在 `/links/` 底部；旧 `/friends/` 跳转到 `/links/#links-friends`。
- 飞书导入的文章额外记录：
  - `source`：原文地址；
  - `sourceCreatedAt` / `sourceUpdatedAt`：源文档时间；
  - `dateBasis: source-created`：日期来自源文档创建时间；
  - `publicationDateVerified: false`：未核实公开发表日期。
- 不编造发布日期、指标或证言。无法取得的图片会显示说明，不静默丢弃。

## 自动更新

`.github/workflows/ci.yml` 在以下时机构建并部署：

- push 到 `master`；
- 每天定时（UTC 01:23）；
- 手动触发。

构建前运行 `scripts/refresh-github.mjs`，用 `GITHUB_TOKEN` 拉取公开仓库、Pull Request 和近一年的贡献日历。只使用 PR，不使用 commit；任何私有仓库都会被过滤。接口失败时使用仓库内的快照，不阻断构建。

`src/data/github.json` 保存四项数据：`profile`（账号与关注数）、`contributions`（365 天日历）、`projects`（人工策划的项目条目）、`activity`（近一年公开 PR）。近况、首页与项目页都从这份快照渲染，不在浏览器里请求 GitHub。

## 隐私

- 飞书只读授权只在本机使用，令牌不写入仓库。
- 私有仓库与公司内部内容不会出现在站点或数据文件里。
