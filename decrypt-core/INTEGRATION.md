# 接入到其他前端项目

## 方式一：直接复制源码目录

把整个 `decrypt-core` 文件夹复制到目标项目，例如：

```text
your-project/
  src/
  decrypt-core/
    src/
      decrypt/
      utils/
      QmcWasm/
      KgmWasm/
      vendor/
```

然后在目标项目安装依赖：

```bash
npm install crypto-js music-metadata-browser browser-id3-writer metaflac-js jimp iconv-lite threads
```

如果目标项目没有 TypeScript，还需要：

```bash
npm install -D typescript @types/node
```

## 路径别名

拆分包保留了原项目的 `@/*` 别名，指向 `decrypt-core/src/*`。

### Vite

```ts
// vite.config.ts
import path from 'node:path';

export default {
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'decrypt-core/src'),
    },
  },
};
```

### Webpack

```js
// webpack.config.js
const path = require('path');

module.exports = {
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'decrypt-core/src'),
    },
    extensions: ['.ts', '.js'],
  },
};
```

如果你的项目已经使用 `@` 指向自己的 `src`，不要覆盖它。可以选择下面两种方案之一：

1. 把 `decrypt-core/src/decrypt`、`utils`、`QmcWasm`、`KgmWasm`、`vendor` 复制进目标项目自己的 `src` 下。
2. 批量把拆分包里的 import 从 `@/...` 改成相对路径或新别名，例如 `@unlock-decrypt/...`。

## 基本调用

```ts
import { Decrypt } from './decrypt-core/src/decrypt';

async function decryptFile(file: File) {
  const result = await Decrypt(
    {
      status: 'ready',
      name: file.name,
      size: file.size,
      percentage: 0,
      uid: Date.now(),
      raw: file,
    },
    {},
  );

  return result;
}
```

`result.blob` 是解密后的音频，`result.file` 是可播放/下载的 `blob:` URL。

```ts
const result = await decryptFile(file);

const audio = new Audio(result.file);
audio.play();

const a = document.createElement('a');
a.href = result.file;
a.download = `${result.title || result.rawFilename}.${result.ext}`;
a.click();
```

使用完后释放 URL：

```ts
URL.revokeObjectURL(result.file);
if (result.picture?.startsWith('blob:')) {
  URL.revokeObjectURL(result.picture);
}
```

## WASM 文件处理

QMC/KGM 会优先使用 WASM 加速：

- `decrypt-core/src/QmcWasm/QmcWasm.wasm`
- `decrypt-core/src/KgmWasm/KgmWasm.wasm`

目标项目打包时必须确保这两个 `.wasm` 文件被复制到运行时可访问的位置。

如果你的 bundler 不能自动处理这些 `.wasm` 文件，可以先使用纯 JS fallback：

1. 删除或不复制 `src/QmcWasm`、`src/KgmWasm`。
2. 在 `src/decrypt/qmc.ts` 中移除 `DecryptQmcWasm` 分支。
3. 在 `src/decrypt/kgm.ts` 中移除 `DecryptKgmWasm` 分支。

这样速度会慢一些，但接入更简单。

## Worker 可选接入

如果要避免大文件解密阻塞 UI，可以使用 `src/utils/worker.ts`。它基于 `threads`：

```ts
import { spawn, Worker } from 'threads';

const decrypt = await spawn<any>(new Worker('./decrypt-core/src/utils/worker.ts'));
const result = await decrypt(fileInfo, {});
```

具体 worker 路径写法取决于 Vite/Webpack 配置。

## 接入检查清单

1. 已复制 `decrypt-core` 或其中 `src` 下的核心目录。
2. 已安装 `package.json` 中列出的依赖。
3. 已配置 `@` 路径别名，或已改成目标项目使用的别名。
4. 已处理 `.wasm` 静态资源。
5. 页面运行环境支持 `Blob`、`File`、`FileReader`、`URL.createObjectURL`、`TextDecoder`。
6. 如果要用 JOOX，调用前需要配置 `storage.loadJooxUUID()` 可读到 32 位 UUID。

## 最小保留集

如果只想保留“解密输出 blob”，不需要封面、联网查元数据、写标签，可以后续继续精简：

- 保留：`src/decrypt`、`src/utils/tea.ts`、`src/utils/MergeUint8Array.ts`、`src/vendor`。
- 可删改：`src/utils/api.ts`、`src/utils/qm_meta.ts` 中联网查封面和写标签逻辑。
- 可选：`src/QmcWasm`、`src/KgmWasm`。

