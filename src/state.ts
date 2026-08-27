// poolTab.ts / charTab.ts で共有するプリセット編集の状態。
// 変更はすべてこのオブジェクトをローカル書き換えするだけに留め、
// 実際にESP32へ書き込むのは「設定を反映」ボタン(charTab.ts)を押した時だけ。

import { ImagesJson } from './imageDecode.js';

export const appState: {
  imagesData: ImagesJson | null;
  cache: Map<string, string>;
} = {
  imagesData: null,
  cache: new Map(),
};
