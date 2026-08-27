// 各タブモジュールから共通で使う、ログ表示とステータスバー表示。
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
export function log(msg) {
    const time = new Date().toLocaleTimeString();
    logEl.textContent += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
}
export function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = cls;
}
