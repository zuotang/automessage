# SFTP + Nginx 实时调试

## 1. 配置

复制模板并填写你的服务器信息：

```bash
cp .env.sftp.example .env.sftp
```

关键字段：

- `UPDATE_BASE_URL`: AutoJS 下载更新的 HTTP 地址，例如 `https://your-domain.com/automessage`
- `SFTP_REMOTE_DIR`: Nginx 对应的服务器目录，例如 `/usr/share/nginx/html/automessage`

这两个地址必须一一对应：

- `UPDATE_BASE_URL/version.json`
- `SFTP_REMOTE_DIR/version.json`

## 2. 安装依赖

```bash
npm install
```

## 3. 一次性上传

```bash
npm run deploy:sftp
```

## 4. 监听并实时上传

```bash
npm run watch:sftp
```

监听 `main.js` 和 `lib/**/*.js`，每次变更会自动：

1. 重新生成 `version.json`
2. 上传 `main.js` / `lib/utils.js` / `version.json`

## 5. AutoJS 启动器配置

在 `bootstrap.js` 中把 `REMOTE_BASE_URL` 改成你的线上地址：

```js
const REMOTE_BASE_URL = "https://your-domain.com/automessage";
```
