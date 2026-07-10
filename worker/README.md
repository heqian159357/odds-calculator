# The Odds API 代理部署指南

## 你需要做的 3 步

### 第 1 步：拿 API key（免费）
1. 打开 https://the-odds-api.com/ → 点 **Get API Key**
2. 填邮箱注册 → 邮件里拿到 key（形如 `a1b2c3d4...`）
3. 免费额度：500 次请求/月

### 第 2 步：登录 Cloudflare（免费）
```bash
cd /tmp/dutching-calc/worker
npx wrangler login          # 浏览器弹出授权，点 Allow
```
没有 Cloudflare 账号会引导你注册（免费）。

### 第 3 步：部署 + 设密钥
```bash
npx wrangler deploy                    # 部署 Worker，得到网址 https://odds-proxy.<你的名>.workers.dev
npx wrangler secret put ODDS_API_KEY   # 粘贴第1步的 key 回车（不会显示，安全）
```

部署成功后，浏览器打开 `https://odds-proxy.<你的名>.workers.dev/sports` 应能看到足球赛事列表 JSON。

## 前端如何用
把返回的 Worker 网址填进精算分析器页面的「数据源」输入框（下一步我会加），点「拉取赔率」即可自动填入。

## 注意
- The Odds API 是**国际博彩盘**（Bet365/Pinnacle 等），非中国竞彩固定奖金。
- 拉来的赔率仅作模型参考，实际竞彩下注仍需以竞彩 App 当前赔率为准。
- 每次 /odds 请求消耗 1 次额度（乘以 market 数），500/月够个人用。
