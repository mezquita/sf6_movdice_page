// ビルドのたびに src/version.ts を書き換える。
// リロード後にページが更新されているかを画面上で確認するための、暫定的な目印。
const fs = require('fs');

const version = new Date().toISOString();
const content = `// このファイルは npm run build のたびに gen-version.js が自動生成します。手動編集しないでください。
export const BUILD_VERSION = ${JSON.stringify(version)};
`;

fs.writeFileSync('src/version.ts', content);
console.log('generated src/version.ts:', version);
