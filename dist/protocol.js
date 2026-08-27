// movdice 設定モード用の独自プロトコル（本番用）
// ESP32側 esp32_dist/config_mode.py と対のブラウザ側実装。
// Raw REPLとは異なり、決められたコマンドのみをやり取りする（詳細はdocs/WEBCONFIG_DESIGN.md参照）。
//
// メッセージフォーマット（リクエスト・レスポンス共通）:
//   [4 bytes] メタデータ長 (uint32, little-endian)
//   [N bytes] メタデータ (UTF-8 JSON)
//   [4 bytes] バイナリ本体長 (uint32, 無ければ0)
//   [M bytes] バイナリ本体
import { MovSerial } from './serial.js';
function u32ToBytes(n) {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, n, true);
    return Array.from(buf);
}
function bytesToU32(bytes) {
    return new DataView(new Uint8Array(bytes).buffer).getUint32(0, true);
}
async function writeMessage(cmd, params = {}, body = new Uint8Array(0)) {
    const metaBytes = Array.from(new TextEncoder().encode(JSON.stringify({ cmd, ...params })));
    await MovSerial.writeBytes(u32ToBytes(metaBytes.length));
    await MovSerial.writeBytes(metaBytes);
    await MovSerial.writeBytes(u32ToBytes(body.length));
    if (body.length > 0) {
        await MovSerial.writeBytesChunked(Array.from(body));
    }
}
async function readMessage() {
    const metaLen = bytesToU32(await MovSerial.readExactBytes(4));
    const metaBytes = await MovSerial.readExactBytes(metaLen);
    const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(metaBytes)));
    const bodyLen = bytesToU32(await MovSerial.readExactBytes(4));
    const body = bodyLen > 0 ? new Uint8Array(await MovSerial.readExactBytes(bodyLen)) : new Uint8Array(0);
    return { meta, body };
}
// 複数のコマンドがほぼ同時に呼ばれると、rxBufferの読み取りが競合し、
// 別コマンドの応答を誤って消費してプロトコルが壊れる。1本のシリアル接続を
// 使い回している以上、通信は常に直列化する（前のコマンドの完了を待ってから次を実行する）。
let commandQueue = Promise.resolve();
async function sendCommandRaw(cmd, params, body) {
    await writeMessage(cmd, params, body);
    const res = await readMessage();
    if (!res.meta.ok) {
        throw new Error('ESP32側エラー: ' + (res.meta.error ?? '(詳細不明)'));
    }
    return res;
}
export function sendCommand(cmd, params = {}, body = new Uint8Array(0)) {
    const result = commandQueue.then(() => sendCommandRaw(cmd, params, body), () => sendCommandRaw(cmd, params, body));
    // 直前のコマンドが失敗していても、キュー自体は途切れさせずに次へつなげる
    commandQueue = result.catch(() => undefined);
    return result;
}
export async function hello() {
    const res = await sendCommand('hello');
    return res.meta;
}
export async function listImages() {
    const res = await sendCommand('list_images');
    return res.meta.files ?? [];
}
export async function getImage(filename) {
    const res = await sendCommand('get_image', { filename });
    return res.body;
}
export async function getPresets() {
    const res = await sendCommand('get_presets');
    const text = new TextDecoder().decode(res.body);
    return JSON.parse(text);
}
export async function savePresets(data) {
    const body = new TextEncoder().encode(JSON.stringify(data));
    const res = await sendCommand('save_presets', {}, body);
    return { warning: res.meta.warning };
}
export async function uploadImage(filename, data) {
    await sendCommand('upload_image', { filename }, data);
}
export async function deleteImage(filename) {
    await sendCommand('delete_image', { filename });
}
export async function testDisplay(filename) {
    await sendCommand('test_display', { filename });
}
export async function reboot() {
    // ESP32側は応答を返した直後にmachine.reset()するため、応答を受け取れば十分。
    // 再起動によりUSBが再列挙されポートが切断されるが、それ自体はエラーとして扱わない。
    await sendCommand('reboot');
}
export async function getStorageInfo() {
    const res = await sendCommand('get_storage_info');
    return {
        freeBytes: res.meta.free_bytes,
        imagesUsedBytes: res.meta.images_used_bytes,
        presetsUsedBytes: res.meta.presets_used_bytes,
    };
}
