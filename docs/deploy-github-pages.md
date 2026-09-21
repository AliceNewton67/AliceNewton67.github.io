# 部署到 GitHub Pages：手动操作指引

本机已把本地 Git 仓库搭好（分支 `main`，唯一提交，remote `origin` 已指向
`https://github.com/AliceNewton67/AliceNewton67.github.io.git`）。
由于当前网络无法访问 github.com，请按以下步骤在**浏览器 + 本地终端**手动完成创建仓库、推送与开启 Pages。

---

## 1. 在 GitHub 创建个人主页仓库

1. 登录 GitHub。
2. 打开 <https://github.com/new>。
3. 仓库名必须填：**Repository name = `AliceNewton67.github.io`**
   （`<用户名>.github.io`，这是 GitHub Pages 个人主页的固定命名）。
4. visibility 随意（建议 Public，个人主页通常公开）。
5. 不要勾选 "Add a README / .gitignore / license"（避免产生冲突的初始提交）。
6. 点击 **Create repository**。

## 2. 在本地推送

在 `ecliptic-event/` 目录执行：

```bash
cd "C:/Users/zwsoft/atomworkspace/GithubWeb/ecliptic-event"
git push -u origin main
```

首次推送会弹出 GitHub 登录（使用已配置的 credential helper `manager`，或输入 token）。

## 3. 开启 GitHub Actions 部署

仓库已附带 `.github/workflows/deploy.yml`（Action），它会自动 `pnpm build` 并部署到 Pages。
需在 GitHub Pages 把构建源设为 **GitHub Actions**：

1. 进入仓库 **Settings → Pages**。
2. "Build and deployment" → **Source** 选择 **GitHub Actions**。
3. 完成。

## 4. 触发构建与访问

- 推送后 Actions 自动运行；也可在 **Actions → Deploy Astro site to Pages → Run workflow** 手动触发。
- 构建成功后，站点将发布在：
  `https://AliceNewton67.github.io/`
- 首页 = `src/pages/index.astro`（按分区展示的文章总览），示例文章 =
  `https://AliceNewton67.github.io/posts/fibonacci-tmp/`
- 分区页：
  `https://AliceNewton67.github.io/section/cs/`、
  `https://AliceNewton67.github.io/section/math/`、
  `https://AliceNewton67.github.io/section/game/`

## 注意事项

- 由于是 `<username>.github.io` 主页仓库，站点部署在根路径 `/`，因此 `astro.config.mjs`
  中**不应**设置 `base`（保持默认，或显式 `base: '/'`）。当前配置正确。
- `astro.config.mjs` 的 `site` 已设为 `https://AliceNewton67.github.io`，供 sitemap 与 canonical 使用。
- 若推送后 Pages 未自动启用，回到 **Settings → Pages** 确认 Source 为 GitHub Actions。

## 验证清单

- [ ] 本地 `git push -u origin main` 成功
- [ ] GitHub 仓库 Actions 运行且 `build` + `deploy` 两个 job 通过
- [ ] 浏览器打开 `https://AliceNewton67.github.io/` 能看到首页
