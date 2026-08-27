import { MovSerial } from './serial.js';
import { hello } from './protocol.js';
import { log, setStatus } from './ui.js';
const connectBtn = document.getElementById('connectBtn');
const forgetBtn = document.getElementById('forgetBtn');
const helloBtn = document.getElementById('helloBtn');
let onChangeCallback = null;
// 接続状態が変わるたびに、他のタブ(pool/char)のボタン活性状態も更新できるよう通知する
export function onConnectionChange(cb) {
    onChangeCallback = cb;
}
export function refreshUi() {
    const connected = MovSerial.isConnected();
    connectBtn.hidden = connected;
    forgetBtn.hidden = !connected;
    helloBtn.hidden = !connected;
    setStatus(connected ? '接続済み（許可済み）' : '未接続', connected ? 'status-connected' : 'status-none');
    onChangeCallback?.();
}
export async function tryAutoConnect() {
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
        }
        catch (e) {
            setStatus('接続エラー: ' + e.message, 'status-error');
            log('open失敗: ' + e.message);
        }
        refreshUi();
    }
    else {
        log('許可済みデバイスはありません。「ESP32に接続」を押してください。');
    }
}
connectBtn.addEventListener('click', async () => {
    try {
        const p = await MovSerial.requestNewPort();
        log('デバイスが選択されました。');
        await MovSerial.connect(p);
        log('ポートをopenしました。');
    }
    catch (e) {
        setStatus('接続エラー: ' + e.message, 'status-error');
        log('接続失敗: ' + e.message);
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
    }
    catch (e) {
        log('hello失敗: ' + e.message);
    }
    helloBtn.disabled = false;
});
