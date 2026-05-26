# unlock-music 解密核心拆分版

这个目录从打包后的 unlock-music 项目中拆出了核心解密链路，入口在 `src/decrypt/index.ts`。它保留原项目的目录结构和 `@/*` 路径别名，方便直接复制到前端项目中再按需要删减。

## 目录结构

- `src/decrypt/`：统一分发入口和各格式解密模块。
- `src/decrypt/qmc.ts`、`qmc_cipher.ts`、`qmc_key.ts`：QMC 静态表、map、RC4、TEA 派生密钥相关逻辑。
- `src/decrypt/ncm.ts`：网易云 NCM 解析，包含 AES-ECB 解密、封面和音频数据提取。
- `src/decrypt/kgm.ts`、`kwm.ts`、`xm.ts`、`mg3d.ts`、`ximalaya.ts`、`joox.ts`：其他平台格式解析。
- `src/decrypt/qmc_wasm.ts`、`kgm_wasm.ts`：QMC/KGM 的 WASM 加速桥接。
- `src/QmcWasm/`、`src/KgmWasm/`：WASM C++ 源码、Emscripten 产物和单独构建脚本。
- `src/utils/tea.ts`：TEA 实现，供 QMC v2 密钥派生使用。
- `src/utils/worker.ts`：基于 `threads/worker` 暴露 `Decrypt` 的 worker 入口。
- `src/utils/qm_meta.ts`、`api.ts`、`MergeUint8Array.ts`、`storage/`：解密后元数据处理、QQ 音乐封面查询、数组合并和配置存储。

## 安装

```bash
cd decrypt-core
npm install
```

该拆分版是“原样可追溯”提取，不是零依赖重写。KGM/JOOX 原项目使用的私有/非稳定包已经 vendor 到 `src/vendor/`，但当前代码仍依赖 `crypto-js`、`music-metadata-browser`、`browser-id3-writer`、`metaflac-js`、`jimp`、`threads` 等包。

如果要做纯浏览器原生 Web Crypto 版本，需要至少重写 `ncm.ts` 的 `crypto-js` AES 调用、元数据读写链路，以及 JOOX vendor 代码中的 `crypto-js` 调用。

## 基本用法

```ts
import { Decrypt } from './src/decrypt';

const input = document.querySelector<HTMLInputElement>('#file')!;

input.onchange = async () => {
  const file = input.files?.[0];
  if (!file) return;

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

  const a = document.createElement('a');
  a.href = result.file;
  a.download = `${result.title || result.rawFilename}.${result.ext}`;
  a.click();

  URL.revokeObjectURL(result.file);
  if (result.picture?.startsWith('blob:')) URL.revokeObjectURL(result.picture);
};
```

## 返回值

`Decrypt` 返回 `Promise<DecryptResult>`：

```ts
interface DecryptResult {
  title: string;
  album?: string;
  artist?: string;
  mime: string;
  ext: string;
  file: string;
  blob: Blob;
  picture?: string;
  message?: string;
  rawExt?: string;
  rawFilename?: string;
}
```

其中 `blob` 是解密后的音频，`file` 是可直接下载或播放的 `blob:` URL，`picture` 是封面 URL。

## 支持格式和分发方式

`src/decrypt/index.ts` 通过文件扩展名分发到对应模块。模块内部会对部分格式做 Magic Header 校验或对解密后的音频做头部嗅探：

- `ncm`：网易云音乐。
- `uc`：网易云缓存。
- `qmc0/qmc2/qmc3/qmc4/qmc6/qmc8/qmcflac/qmcogg/tkm/mflac/mflac0/mgg/mgg0/mgg1/mggl/mmp4/...`：QQ 音乐和 MooMusic 系列。
- `cache`：QQ 音乐缓存。
- `kgm/kgma/vpr`：酷狗。
- `kwm`：酷我。
- `xm/wav/mp3/flac/m4a`：虾米或原始音频。
- `tm0/tm2/tm3/tm6`：QQ 音乐 iOS。
- `mg3d`：咪咕。
- `ofl_en`：JOOX。
- `x2m/x3m`：喜马拉雅。
- `ogg`：原始 OGG。

注意：当前原项目入口并不是完全基于 Magic Number 自动识别。若使用场景中扩展名不可信，需要在调用 `Decrypt` 前自行读取文件头并修正 `name` 的扩展名，或扩展 `src/decrypt/index.ts`。

## WASM 加速

QMC 和 KGM 会优先尝试 WASM：

- `src/decrypt/qmc_wasm.ts` 加载 `@/QmcWasm/QmcWasmBundle`。
- `src/decrypt/kgm_wasm.ts` 加载 `@/KgmWasm/KgmWasmBundle`。
- 对应 `.wasm` 文件在 `src/QmcWasm/QmcWasm.wasm` 和 `src/KgmWasm/KgmWasm.wasm`。

Emscripten 生成的 JS 默认按同目录加载 `.wasm`。打包时需要让 bundler 复制这些 `.wasm` 文件，并确保运行时 URL 能被 `fetch()` 访问。若使用 Vite/Webpack，通常需要把 `.wasm` 作为静态资源处理，或改造 `locateFile` 传入资源地址。

重新构建 WASM：

```bash
npm run build:wasm
```

脚本会分别进入 `src/QmcWasm` 和 `src/KgmWasm`，必要时拉取 Emscripten `3.0.0`，再通过 `emcmake cmake` 和 `make` 生成 JS/WASM 产物。

## Worker 用法

`src/utils/worker.ts` 只做一件事：把 `Decrypt` 暴露给 `threads` worker。

```ts
import { spawn, Worker } from 'threads';

const decrypt = await spawn<typeof import('./src/utils/worker')>(
  new Worker('./src/utils/worker.ts'),
);

const result = await decrypt(fileInfo, config);
```

实际项目中 worker 的路径写法取决于 bundler。

## 移植建议

1. 保留 `src/decrypt`、`src/utils/tea.ts`、`src/utils/MergeUint8Array.ts`、`src/utils/qm_meta.ts`、`src/utils/api.ts`、`src/utils/storage`。
2. 如果需要 QMC/KGM 性能，保留 `src/QmcWasm`、`src/KgmWasm` 和两个 `*_wasm.ts` 桥接文件。
3. 如果只要纯 JS fallback，可删除 WASM 目录，并在 `qmc.ts`、`kgm.ts` 中移除 WASM 分支。
4. 如果不需要封面联网查询和回写标签，可简化 `qm_meta.ts`，并删除 `api.ts`、`browser-id3-writer`、`metaflac-js`、`jimp`、`music-metadata-browser` 相关调用。
