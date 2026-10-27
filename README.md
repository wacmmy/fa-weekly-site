# 工控周报

工业自动化 / FA 中文周报。每周一期，由 `content/*.md` 构建成静态站。

线上地址：https://wacmmy.github.io/fa-weekly-site/

## 添加一期

在 `content/` 新建 `YYYY-MM-DD-weekly-HHMM.md`，例如 `content/2026-10-27-weekly-1000.md`。

Frontmatter：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| date | 是 | 发布日期，`YYYY-MM-DD`，须与文件名一致 |
| slot | 是 | 四位时刻，如 `"1000"`，须与文件名中的 `HHMM` 一致 |
| time | 否 | 显示时间，如 `"10:00"`；省略时由 slot 推出 |
| type | 是 | 固定 `weekly` |
| title | 否 | 详情页副标题；省略时自动生成 |
| headline | 是 | 标题 |
| summary | 是 | 摘要 |
| items | 否 | 条目数，默认 0 |

正文空行分段。短行渲染为小标题；以「来源」「仓库」等开头，或单独一行的链接，渲染为来源行。

## 本地构建

需要 Node.js 18 及以上。

```bash
npm run build
```

等价于 `node build.mjs`。产物在 `dist/`：`index.html`、`p/{slug}.html`、`style.css`。

## GitHub Pages

推送到 `main` 后，`.github/workflows/pages.yml` 会构建 `dist/` 并部署。

若站点没有自动出现：仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
