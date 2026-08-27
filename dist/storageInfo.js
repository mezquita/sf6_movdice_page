// poolTab.ts（アップロード時）とcharTab.ts（画像一覧読み込み時）の両方から呼ばれる。
// 循環参照を避けるため独立したモジュールにしてある。
import { getStorageInfo } from './protocol.js';
const storageInfoEl = document.getElementById('storageInfo');
export function formatBytes(n) {
    return (n / 1024).toFixed(1) + ' KB';
}
export async function refreshStorageInfo() {
    try {
        const info = await getStorageInfo();
        const used = info.imagesUsedBytes + info.presetsUsedBytes;
        const pct = used + info.freeBytes > 0 ? Math.min(100, Math.round((used / (used + info.freeBytes)) * 100)) : 0;
        storageInfoEl.textContent = `使用 ${formatBytes(used)} / 空き ${formatBytes(info.freeBytes)}（使用率 ${pct}%）`;
    }
    catch (e) {
        storageInfoEl.textContent = 'ストレージ情報の取得に失敗: ' + e.message;
    }
}
