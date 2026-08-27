// ビルドのたびに src/version.ts を書き換える。
// リロード後にページが更新されているかを画面上で確認するための、暫定的な目印。
const fs = require('fs');

// 実行環境のタイムゾーン設定に依存しないよう、UTC時刻に明示的に+9時間して日本時間を計算する
const now = new Date();
const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
const pad = (n) => String(n).padStart(2, '0');
const version =
  `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())} ` +
  `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())} JST`;

const content = `// このファイルは npm run build のたびに gen-version.js が自動生成します。手動編集しないでください。
export const BUILD_VERSION = ${JSON.stringify(version)};
`;

fs.writeFileSync('src/version.ts', content);
console.log('generated src/version.ts:', version);
