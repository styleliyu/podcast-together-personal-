# 一起听

一个自部署 Web 应用，用来和朋友实时同步听音乐、播客和本地音频。项目基于 `podcast-together` 改造，后端已迁移为普通 Node.js 服务，适合部署到自己的服务器。

## 功能

- 创建房间后，把房间链接发给朋友即可一起听。
- 同步播放、暂停、进度、倍速。
- 房主可限制其他成员操作播放器。
- 支持播客链接、公开音频直链、喜马拉雅开放平台、音乐平台单曲和歌单链接。
- 支持房间队列、上一首、下一首、顺序播放、随机播放、单曲循环。
- 支持上传本地 `mp3`、`m4a`、`aac` 文件到服务器后同步播放。
- 支持常驻房间，适合固定入口长期使用。

## 支持链接

当前支持：

- 播客链接：小宇宙、Apple Podcasts 中国区、常见播客网页。
- 音频直链：公网可访问的 `.mp3`、`.m4a`、`.aac` 链接。
- 喜马拉雅：需要后端配置开放平台应用。
- 音乐平台单曲和歌单：网易云音乐、QQ 音乐、酷狗音乐、酷我音乐、百度/千千音乐。

暂不支持：

- 专辑、歌手页直接创建房间。
- Bilibili、虾米。
- 平台没有返回播放地址的内容。会员、版权、下架、地区限制歌曲需要平台接口实际给出可播放地址。

## 复制音乐链接

原则：打开歌曲或歌单详情页，直接复制浏览器地址栏里的前端页面链接。不要复制搜索页、歌手页、专辑页或临时跳转链接。

常见形式：

- 网易云音乐单曲：`https://music.163.com/#/song?id=3381828899`
- 网易云音乐歌单：`https://music.163.com/#/playlist?id=...`
- QQ 音乐单曲：`https://y.qq.com/n/ryqq/songDetail/003mAan70zUy5O`
- QQ 音乐歌单：`https://y.qq.com/n/ryqq/playlist/...`
- 酷狗音乐单曲：`https://www.kugou.com/mixsong/12f54x43.html?...` 或 `https://www.kugou.com/song/#hash=...`
- 酷狗音乐歌单：`https://www.kugou.com/yy/special/single/...`
- 酷我音乐单曲：`https://www.kuwo.cn/play_detail/263288`
- 酷我音乐歌单：`https://www.kuwo.cn/playlist_detail/...`
- 百度/千千音乐：`https://music.91q.com/song/...` 或 `https://music.taihe.com/song/...`

QQ 音乐播放地址解析已吸收 `copws/qq-music-api` 的新版请求方式：原逻辑失败后会使用 `https://u.y.qq.com/cgi-bin/musicu.fcg` 的 POST 方式兜底。需要会员授权的内容可以在后端配置 `QQ_MUSIC_COOKIE`，但最终仍取决于 QQ 音乐接口是否给当前账号返回播放地址。

## 歌单、本地歌曲与常驻房间

- 粘贴歌单链接创建房间时，会导入平台返回的完整曲目列表，不做人为数量限制。
- 创建房间时只解析第一首可播放歌曲；切歌时再按需解析目标歌曲播放地址，避免一次性请求大量播放地址。
- 本地歌曲会上传到后端 `server/data/uploads/`，并通过 `/uploads/...` 提供播放。
- 常驻房间不会因为同一用户创建新房间而被自动替换。房间没人时仍会暂停播放并清空在线成员。

## 本地开发

建议使用 Node.js 18 LTS。

前端：

```bash
pnpm install
pnpm dev
```

后端：

```bash
cd server
npm install
npm run dev
```

如果 Windows 下安装后端依赖时 `better-sqlite3` 编译失败，优先切换到 Node.js 18；仍失败时安装 Visual Studio Build Tools，并勾选 `Desktop development with C++`。

## 环境变量

根目录创建 `.env.local`：

```env
VITE_API_URL=https://你的域名/api
VITE_WEBSOCKET_URL=wss://你的域名/ws
VITE_HEARTBEAT_PERIOD=15
```

`server` 目录创建 `.env`：

```env
HOST=127.0.0.1
PORT=3001
DATABASE_PATH=./data/podcast-together.db
CORS_ORIGIN=https://你的域名
UPLOAD_DIR=./data/uploads
ROOM_CLOCK_INTERVAL_MS=30000

# 可选：QQ 音乐登录 Cookie，用于需要账号授权的播放地址解析。
QQ_MUSIC_COOKIE=

XIMALAYA_APP_KEY=
XIMALAYA_APP_SECRET=
XIMALAYA_CLIENT_OS_TYPE=4
XIMALAYA_SERVER_API_VERSION=1.0.0
XIMALAYA_DEVICE_ID=
XIMALAYA_DEVICE_ID_TYPE=
XIMALAYA_SIG_MODE=md5_secret_concat
```

`QQ_MUSIC_COOKIE` 获取方式：在浏览器登录 QQ 音乐网页版，打开开发者工具，在 `y.qq.com` 或 `u.y.qq.com` 请求里复制 `Cookie` 请求头。该值只放在自己的服务器环境变量里，不要提交到仓库。

## 部署

完整部署步骤见 [DEPLOY_SERVER.md](./DEPLOY_SERVER.md)。

常规流程：

```bash
cd /www/wwwroot/podcast-together/server
npm install
npm run build
pm2 start dist/index.js --name podcast-together-api
pm2 save

cd /www/wwwroot/podcast-together
pnpm install
pnpm build
```

Nginx 站点根目录指向前端 `dist`，并把 `/api/` 和 `/ws` 反向代理到后端服务。使用本地歌曲上传时，需要确认 Nginx 上传体积限制足够大，例如：

```nginx
client_max_body_size 1024m;
```

## 参考与致谢

- 我的 GitHub：[styleliyu](https://github.com/styleliyu)
- QQ 音乐 API 参考：[copws/qq-music-api](https://github.com/copws/qq-music-api)
- 多平台音乐 API 参考：[listen1/listen1_desktop](https://github.com/listen1/listen1_desktop)
- Meting 参考：[metowolf/Meting](https://github.com/metowolf/Meting)
- 原项目：[yenche123/podcast-together](https://github.com/yenche123/podcast-together)

## 许可

MIT
