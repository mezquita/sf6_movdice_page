import { MovSerial } from './serial.js';

const statusEl = document.getElementById('status') as HTMLDivElement;
const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const forgetBtn = document.getElementById('forgetBtn') as HTMLButtonElement;
const logEl = document.getElementById('log') as HTMLDivElement;

function log(msg: string): void {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text: string, cls: string): void {
  statusEl.textContent = text;
  statusEl.className = cls;
}

function refreshUi(): void {
  const connected = MovSerial.isConnected();
  forgetBtn.disabled = !connected;
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

tryAutoConnect();
