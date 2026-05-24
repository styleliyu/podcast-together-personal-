# 自有云服务器部署说明

本文档用于把本项目从 Laf 后端切换到普通云服务器后端。服务器只需要 Node 18+、PM2、Nginx，不需要额外安装数据库，后端默认使用 SQLite。

## 1. 准备域名

在域名 DNS 控制台添加 A 记录，指向你的云服务器公网 IP。等待解析生效后，在宝塔或 Nginx 里为该域名创建站点并申请 HTTPS 证书。

正式环境建议只使用域名访问，不建议长期使用 IP 访问，因为浏览器对 HTTPS 和 WebSocket 证书要求较严格。

## 2. 上传项目

建议放到：

```bash
/www/wwwroot/podcast-together
```

如果你用宝塔上传压缩包，解压后确认目录里能看到 `package.json`、`src/`、`server/`。

## 3. 配置前端环境变量

在项目根目录创建 `.env.local`：

```env
VITE_API_URL=https://你的域名/api
VITE_WEBSOCKET_URL=wss://你的域名/ws
VITE_HEARTBEAT_PERIOD=15
```

把 `你的域名` 换成真实域名，不要带末尾 `/`。

## 4. 配置后端环境变量

进入后端目录，创建 `.env`：

```env
HOST=127.0.0.1
PORT=3001
DATABASE_PATH=./data/podcast-together.db
CORS_ORIGIN=https://你的域名
ROOM_CLOCK_INTERVAL_MS=30000
```

## 5. 构建并启动后端

```bash
cd /www/wwwroot/podcast-together/server
pnpm install
pnpm build
pm2 start dist/index.js --name podcast-together-api
pm2 save
```

检查后端：

```bash
curl http://127.0.0.1:3001/health
```

应返回 `code: "0000"`。

## 6. 构建前端

```bash
cd /www/wwwroot/podcast-together
pnpm install
pnpm build
```

宝塔站点根目录指向：

```bash
/www/wwwroot/podcast-together/dist
```

## 7. Nginx 配置

在站点配置中加入以下反向代理规则。保留宝塔自动生成的 SSL 配置和静态站点配置。

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /ws {
    proxy_pass http://127.0.0.1:3001/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

重载 Nginx 后访问：

```bash
curl -X POST https://你的域名/api/pt-service \
  -H "Content-Type: application/json" \
  -d '{"x-pt-local-id":"test"}'
```

应返回 `code: "0000"`。

## 8. 验证功能

1. 打开 `https://你的域名`。
2. 用 `.mp3` 或 `.m4a` 直链创建房间。
3. 用两个浏览器进入同一个房间。
4. 在一个浏览器播放、暂停、拖动进度，确认另一个浏览器同步。
5. 关闭其中一个浏览器，约 50-60 秒后确认成员被清理。

## 9. 安全事项

如果你曾经在聊天、文档或截图里暴露过服务器 root 密码或宝塔密码，上线前请立即修改：

- SSH root 密码
- 宝塔面板账号密码
- 宝塔面板入口路径
- 关闭不必要的公网端口
