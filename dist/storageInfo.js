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
        const total = used + info.freeBytes;
        const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
        storageInfoEl.innerHTML = '';
        const text = document.createElement('div');
        text.textContent =
            `ストレージ使用状況: 画像 ${formatBytes(info.imagesUsedBytes)} + プリセット ${formatBytes(info.presetsUsedBytes)}` +
                ` = 使用 ${formatBytes(used)} / 空き ${formatBytes(info.freeBytes)}（使用率 ${pct}%）`;
        storageInfoEl.appendChild(text);
        const bar = document.createElement('div');
        bar.id = 'storageBar';
        const fill = document.createElement('div');
        fill.id = 'storageBarFill';
        fill.style.width = pct + '%';
        if (pct >= 90)
            fill.className = 'danger';
        else if (pct >= 70)
            fill.className = 'warn';
        bar.appendChild(fill);
        storageInfoEl.appendChild(bar);
    }
    catch (e) {
        storageInfoEl.textContent = 'ストレージ情報の取得に失敗: ' + e.message;
    }
}
