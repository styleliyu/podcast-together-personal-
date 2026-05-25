# 一起听

一个用于和朋友实时同步听音频的自部署 Web 应用。项目基于 `podcast-together` 改造，后端已迁移为普通 Node.js 服务，可部署到自己的服务器。

## 功能

- 创建房间后，把房间链接分享给朋友即可一起听。
- 支持播放、暂停、进度、倍速同步。
- 支持房主限制其他成员操作播放器。
- 支持播客、音频直链和部分音乐平台单曲链接创建房间。

## 支持的链接

当前支持：

- 播客链接：小宇宙、Apple Podcasts 中国区、常见播客网页。
- 音频直链：公网可访问的 `.mp3`、`.m4a` 链接。
- 喜马拉雅：需要后端配置开放平台应用。
- 音乐平台单曲链接：网易云音乐、QQ 音乐、酷狗音乐、酷我音乐、百度/千千音乐。

暂不支持：

- 歌单、专辑、歌手页直接创建房间。后端已预留识别入口，后续建议扩展为“解析列表后选择一首单曲创建房间”。
- Bilibili、虾米。
- 付费、会员、下架、地区受限，或平台接口不返回播放地址的内容。

## 如何复制音乐链接

原则：打开歌曲详情页，直接复制浏览器地址栏里的链接即可。不要复制歌单、专辑或歌手页链接。

### 网易云音乐

- 网页端打开歌曲页，复制地址栏链接。
- 常见形式：`https://music.163.com/#/song?id=3381828899`。
- App 分享出来的网页链接如果最终能跳到歌曲详情页，也可以使用。

### QQ 音乐

- 网页端打开歌曲详情页，复制地址栏链接。
- 常见形式：`https://y.qq.com/n/ryqq/songDetail/003mAan70zUy5O`。
- 当前只创建单曲房间；会员或无版权歌曲会提示解析失败。

### 酷狗音乐

- 网页端打开歌曲详情页，复制地址栏链接。
- 支持旧的 `hash` 链接和新的 `mixsong` 页面链接。
- 常见形式：`https://www.kugou.com/song/#hash=...` 或 `https://www.kugou.com/mixsong/12f54x43.html?...`。
- 如果歌曲本身不返回播放地址，会提示解析失败，不会创建无效房间。

### 酷我音乐

- 网页端打开歌曲详情页，复制地址栏链接。
- 常见形式：`https://www.kuwo.cn/play_detail/263288`。

### 百度/千千音乐

- 网页端打开歌曲详情页，复制地址栏链接。
- 常见形式：`https://music.91q.com/song/...` 或 `https://music.taihe.com/song/...`。
- 该平台接口稳定性较弱；如果平台返回空播放地址，请换用其他平台的同一首歌链接。

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
ROOM_CLOCK_INTERVAL_MS=30000
XIMALAYA_APP_KEY=
XIMALAYA_APP_SECRET=
XIMALAYA_CLIENT_OS_TYPE=4
XIMALAYA_SERVER_API_VERSION=1.0.0
XIMALAYA_DEVICE_ID=
XIMALAYA_DEVICE_ID_TYPE=
XIMALAYA_SIG_MODE=md5_secret_concat
```

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

Nginx 站点根目录指向前端 `dist`，并把 `/api/` 和 `/ws` 反向代理到后端服务。

## 许可

MIT
