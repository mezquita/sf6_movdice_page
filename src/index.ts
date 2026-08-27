import { MovSerial } from './serial.js';
import { hello } from './protocol.js';
import { BUILD_VERSION } from './version.js';

const statusEl = document.getElementById('status') as HTMLDivElement;
const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const forgetBtn = document.getElementById('forgetBtn') as HTMLButtonElement;
const helloBtn = document.getElementById('helloBtn') as HTMLButtonElement;
const logEl = document.getElementById('log') as HTMLDivElement;
const copyLogBtn = document.getElementById('copyLogBtn') as HTMLButtonElement;
const buildVersionEl = document.getElementById('buildVersion') as HTMLParagraphElement;

buildVersionEl.textContent = 'hash: ' + BUILD_VERSION;

function log(msg: string): void {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

MovSerial.setDebugLogger(log);

copyLogBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(logEl.textContent || '');
    const original = copyLogBtn.textContent;
    copyLogBtn.textContent = 'コピーしました';
    setTimeout(() => {
      copyLogBtn.textContent = original;
    }, 1500);
  } catch (e) {
    log('クリップボードへのコピーに失敗: ' + (e as Error).message);
  }
});

function setStatus(text: string, cls: string): void {
  statusEl.textContent = text;
  statusEl.className = cls;
}

function refreshUi(): void {
  const connected = MovSerial.isConnected();
  connectBtn.hidden = connected;
  forgetBtn.hidden = !connected;
  helloBtn.hidden = !connected;
  setStatus(connected ? '接続済み（許可済み）' : '未接続', connected ? 'status-connected' : 'status-none');
}

async function tryAutoConnect(): Promise<void> {
  if (!MovSerial.isSupported()) {
    setStatus('このブラウザはWeb Serial APIに対応していません（Chrome/Edgeを使ってください）', 'status-error');
    connectBtn.disabled = true;
    return;
  }
  const found = await MovSerial.getRememberedPort();
  if (found) {
    log('許可済みデバイスを検出。自動接続します。');
    try {
      await MovSerial.connect(found);
      log('ポートをopenしました。');
    } catch (e) {
      setStatus('接続エラー: ' + (e as Error).message, 'status-error');
      log('open失敗: ' + (e as Error).message);
    }
    refreshUi();
  } else {
    log('許可済みデバイスはありません。「ESP32に接続」を押してください。');
  }
}

connectBtn.addEventListener('click', async () => {
  try {
    const p = await MovSerial.requestNewPort();
    log('デバイスが選択されました。');
    await MovSerial.connect(p);
    log('ポートをopenしました。');
  } catch (e) {
    setStatus('接続エラー: ' + (e as Error).message, 'status-error');
    log('接続失敗: ' + (e as Error).message);
  }
  refreshUi();
});

forgetBtn.addEventListener('click', async () => {
  await MovSerial.disconnectAndForget();
  log('アクセスを取り消しました。');
  refreshUi();
});

helloBtn.addEventListener('click', async () => {
  helloBtn.disabled = true;
  try {
    log('helloを送信します（設定モードで実行してください）。');
    const meta = await hello();
    log('hello応答: ' + JSON.stringify(meta));
  } catch (e) {
    log('hello失敗: ' + (e as Error).message);
  }
  helloBtn.disabled = false;
});

tryAutoConnect();
