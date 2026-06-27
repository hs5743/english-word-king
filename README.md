# 三校聯網・英語單字王

新港國小、鳳岡國小、豐田國小使用的英語單字挑戰平台。

## 技術組合

- 前端：純 HTML / CSS / JavaScript 靜態網站
- 網站網址：GitHub Pages 發布 repository 裡的靜態 HTML/CSS/JS
- 後端：Supabase
  - Google OAuth 登入
  - PostgreSQL 資料庫
  - Row Level Security
  - Edge Functions
- 原始碼：GitHub repository

正式架構：Supabase + GitHub Pages。

## 本機測試

需要 Node.js。

```bash
npm run check
npm run serve
```

開啟：

```text
http://127.0.0.1:3000/
```

## Supabase 專案

目前前端設定指向：

```text
https://tzvnyluqommusppbzyiy.supabase.co
```

既有 Supabase production 專案請優先執行：

```text
supabase/production-upgrade-existing-project.sql
```

全新空專案才使用：

```text
supabase/migrations/20260627000000_init.sql
```

## Edge Functions

需要部署：

```bash
supabase functions deploy generate-challenge
supabase functions deploy admin-api
```

`generate-challenge` 會優先使用管理端設定的 AI 金鑰；若未設定或 API 失敗，會自動改用內建題庫 fallback，確保學生可以開始挑戰。

## GitHub Pages 部署

1. 將本專案推到 GitHub repository。
2. 到 GitHub repository → Settings → Pages。
3. Source 選 `GitHub Actions`。
4. 推送到 `main` 後，`.github/workflows/pages.yml` 會自動檢查並發布網站。
5. Actions 完成後取得 GitHub Pages 網址，例如：

```text
https://你的帳號.github.io/english-word-king/
```

取得網址後，到 Supabase Dashboard → Authentication → URL Configuration 加入：

```text
https://你的帳號.github.io/english-word-king/join.html
```

## 上線驗收

請依照 [上線測試與驗證.md](./上線測試與驗證.md) 執行：

- Supabase 資料庫升級
- Edge Functions 部署
- Google OAuth redirect 設定
- 管理員、教師、學生三端流程驗收
