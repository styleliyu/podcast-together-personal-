# 一起听播客

> 这是基于原项目改造的个人自用版。原项目来自 [yenche123/podcast-together](https://github.com/yenche123/podcast-together)，本版本将后端从 Laf 云函数迁移为可部署到自有云服务器的 Node.js 服务。

<img src="./resources/screenshot_index.png" width="700" />

<img src="./resources/screenshot_listening.png" width="700" />

> 跟你的好友一起实时连线听播客！

<br>

## 😎 如何使用

1. 打开小宇宙 App，在单集详情页，点击屏幕右上角的分享按钮（如下图所示），再点击复制链接。

<img src="./resources/xyz_share.jpg" width="500" />

2. 访问你自己部署的网站创建房间，依页面的提示黏贴上一步复制到的链接，即可创建能跟好友一起实时聆听的播客房间。

原项目使用方式可参考[使用指南](https://yenche.zhubai.love/posts/2172097942360440832)。

<br>

## 🎧 介绍

网易云音乐能一起听歌却不支持一起听 Podcast，小宇宙也不支持，Spotify 需要成为会员才能一起听......

百度了一下，没有人提供这项服务，我就只好自己开发了🥲

### 1 无需登录，直接听

输入昵称，就可以进入房间，跟好友一起听啦！目前最多支持 15 人同时一起听。

### 2 支持小宇宙 / Apple Podcast 中国区

目前已知支持 `xiaoyuzhoufm.com/episode/` 或者 `podcasts.apple.com/cn/` 的链接（不支持短链），后者解析稍慢是正常的，如果解析失败不妨稍后再尝试。

另外，还支持 https 协议的 CDN 链接，也就是你上传 `.mp3` 文件至任意可公网访问的云上，获得 https 链接后即可黏贴到自己部署的网站中一起听。

更多音源详情请参见[这里](https://github.com/yenche123/podcast-together/discussions/3)
<br>

## 🧑‍💻 自行构建/部署

本版本面向个人自部署使用，包含前端和普通云服务器后端：

- 前端：Vite + Vue 3。
- 后端：Node.js + Express + WebSocket + SQLite。
- 已支持喜马拉雅分享链接解析，但需要服务端配置喜马拉雅开放平台应用。
- 个人自用版仓库：[styleliyu/podcast-together-personal-](https://github.com/styleliyu/podcast-together-personal-)
- 原始开源项目：[yenche123/podcast-together](https://github.com/yenche123/podcast-together)

个人仓库克隆地址：

```bash
git clone https://github.com/styleliyu/podcast-together-personal-.git
```

### 本地开发

前端：

```bash
npm install
npm run dev
```

后端：

```bash
cd server
npm install
npm run dev
```

### 环境变量

在项目根目录创建 `.env.local`：

```env
VITE_API_URL=https://你的域名/api
VITE_WEBSOCKET_URL=wss://你的域名/ws
VITE_HEARTBEAT_PERIOD=15
```

在 `server` 目录创建 `.env`：

```env
HOST=127.0.0.1
PORT=3001
DATABASE_PATH=./data/podcast-together.db
CORS_ORIGIN=https://你的域名
ROOM_CLOCK_INTERVAL_MS=30000
XIMALAYA_APP_KEY=
XIMALAYA_APP_SECRET=
XIMALAYA_CLIENT_OS_TYPE=4
XIMALAYA_SERVER_API_VERSION=1.0.0
XIMALAYA_DEVICE_ID=
XIMALAYA_DEVICE_ID_TYPE=
XIMALAYA_SIG_MODE=md5_secret_concat
```

喜马拉雅配置说明：

- `XIMALAYA_APP_KEY` / `XIMALAYA_APP_SECRET` 来自喜马拉雅开放平台。
- 应用需要具备免费声音播放地址接口权限。
- 当前只支持开放平台可输出的免费声音；付费内容、无权限内容无法解析播放地址。
- 如果开放平台调试工具提示签名错误，可把 `XIMALAYA_SIG_MODE` 改成 `hmac_sha1_md5` 后重启后端再试。

### 服务器部署

完整部署步骤见 [DEPLOY_SERVER.md](./DEPLOY_SERVER.md)。核心流程如下：

```bash
cd /www/wwwroot/podcast-together/server
npm install
npm run build
pm2 start dist/index.js --name podcast-together-api
pm2 save

cd /www/wwwroot/podcast-together
npm install
npm run build
```

Nginx 需要把 `/api/` 反向代理到后端 HTTP 服务，把 `/ws` 反向代理到 WebSocket 服务，并为域名配置 HTTPS 证书。

<br>

## ✉️ 联系我

1. 个人自用版仓库：[styleliyu/podcast-together-personal-](https://github.com/styleliyu/podcast-together-personal-)

2. 原项目 Github [讨论区](https://github.com/yenche123/podcast-together/discussions)

3. [Email](mailto:tsuiyenche@outlook.com)

<br>

## 开源协议

MIT
