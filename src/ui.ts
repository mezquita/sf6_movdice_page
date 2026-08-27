// 各タブモジュールから共通で使う、ログ表示とステータスバー表示。

const statusEl = document.getElementById('status') as HTMLDivElement;
const logEl = document.getElementById('log') as HTMLDivElement;

export function log(msg: string): void {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

export function setStatus(text: string, cls: string): void {
  statusEl.textContent = text;
  statusEl.className = cls;
}
