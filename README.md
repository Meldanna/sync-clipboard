# ⚡ SyncBoard - 跨端实时消息同步

一个部署在 Cloudflare Workers 上的**私人跨端剪贴板**。

在任何设备的浏览器打开 `https://sync.windlife.site`，登录后即可在不同设备间实时同步消息。

## 功能

- 🔐 注册/登录（密码 PBKDF2 加密，JWT 认证）
- ⚡ WebSocket 实时推送，多端即时同步
- 📑 多窗口标签页，可开多个独立频道
- 📜 默认最新 20 条，上滑自动加载更多
- 📋 一键复制 / 🗑 单条删除
- 📱 手机电脑都能用，暗色主题

## 部署步骤

```bash
# 1. 克隆 & 安装
git clone https://github.com/Meldanna/sync-clipboard.git
cd sync-clipboard && npm install

# 2. 登录 Cloudflare
npx wrangler login

# 3. 创建 D1 数据库（把输出的 database_id 填入 wrangler.toml）
npx wrangler d1 create sync-clipboard-db

# 4. 建表
npm run db:init:remote

# 5. 设置 JWT 密钥
npx wrangler secret put JWT_SECRET
# 输入一个随机字符串，可用: openssl rand -hex 32

# 6. Cloudflare DNS 添加记录
# 类型: AAAA | 名称: sync | 内容: 100:: | 代理: 开启

# 7. 部署
npm run deploy
```

访问 **https://sync.windlife.site** 🎉

## 技术栈

- Cloudflare Workers（后端 + 前端托管）
- Cloudflare D1（SQLite 数据库）
- Durable Objects（WebSocket 实时推送）
- 纯原生 HTML/CSS/JS（零依赖前端）

## License

MIT
