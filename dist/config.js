import { MovSerial } from './serial.js';
import { base64ToBytes, decodeRleToRgba, decodeRawToRgba, rgbaToDataUrl, pngFileToRgb565Rle } from './imageDecode.js';
import { hello, listImages, getImage, getPresets, savePresets, uploadImage, getStorageInfo } from './protocol.js';
import { BUILD_VERSION } from './version.js';
const statusEl = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const forgetBtn = document.getElementById('forgetBtn');
const loadBtn = document.getElementById('loadBtn');
const helloBtn = document.getElementById('helloBtn');
const loadNewBtn = document.getElementById('loadNewBtn');
const loadStatusEl = document.getElementById('loadStatus');
const setsEl = document.getElementById('sets');
const logEl = document.getElementById('log');
const copyLogBtn = document.getElementById('copyLogBtn');
const uploadFileInput = document.getElementById('uploadFile');
const uploadFilenameInput = document.getElementById('uploadFilename');
const uploadBtn = document.getElementById('uploadBtn');
const buildVersionEl = document.getElementById('buildVersion');
const storageInfoEl = document.getElementById('storageInfo');
const testSizeInput = document.getElementById('testSize');
const testUploadBtn = document.getElementById('testUploadBtn');
buildVersionEl.textContent = 'hash: ' + BUILD_VERSION;
function formatBytes(n) {
    return (n / 1024).toFixed(1) + ' KB';
}
async function refreshStorageInfo() {
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
function log(msg) {
    const time = new Date().toLocaleTimeString();
    logEl.textContent += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
}
copyLogBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(logEl.textContent || '');
        const original = copyLogBtn.textContent;
        copyLogBtn.textContent = 'コピーしました';
        setTimeout(() => {
            copyLogBtn.textContent = original;
        }, 1500);
    }
    catch (e) {
        log('クリップボードへのコピーに失敗: ' + e.message);
    }
});
function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = cls;
}
function setLoadStatus(text) {
    loadStatusEl.textContent = text;
}
MovSerial.setDebugLogger(log);
function refreshUi() {
    const connected = MovSerial.isConnected();
    forgetBtn.disabled = !connected;
    loadBtn.disabled = !connected;
    helloBtn.disabled = !connected;
    loadNewBtn.disabled = !connected;
    uploadFileInput.disabled = !connected;
    uploadFilenameInput.disabled = !connected;
    uploadBtn.disabled = !connected;
    testSizeInput.disabled = !connected;
    testUploadBtn.disabled = !connected;
    setStatus(connected ? '接続済み（許可済み）' : '未接続', connected ? 'status-connected' : 'status-none');
}
testUploadBtn.addEventListener('click', async () => {
    const size = parseInt(testSizeInput.value, 10) || 0;
    if (size <= 0) {
        log('サイズを指定してください。');
        return;
    }
    const dummy = new Uint8Array(size).fill(0x41);
    testUploadBtn.disabled = true;
    try {
        log(`テスト送信開始: ${size} bytes`);
        const start = performance.now();
        await uploadImage('__test__.raw', dummy);
        const elapsed = Math.round(performance.now() - start);
        log(`テスト送信成功: ${size} bytes (${elapsed} ms)`);
    }
    catch (e) {
        log(`テスト送信失敗 (${size} bytes): ` + e.message);
    }
    testUploadBtn.disabled = false;
});
helloBtn.addEventListener('click', async () => {
    helloBtn.disabled = true;
    try {
        log('新プロトコル: helloを送信します。');
        const meta = await hello();
        log('hello応答: ' + JSON.stringify(meta));
    }
    catch (e) {
        log('hello失敗: ' + e.message);
    }
    helloBtn.disabled = false;
});
async function tryAutoConnect() {
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
    setsEl.innerHTML = '';
    setLoadStatus('');
    refreshUi();
});
// --- 画像読み込み ---
async function fetchImagesJson() {
    const jsonStr = await MovSerial.execRaw("print(open('images.json').read())");
    log('images.json raw: ' + JSON.stringify(jsonStr));
    return JSON.parse(jsonStr);
}
async function fetchRawFileBase64(filename) {
    const safe = filename.replace(/'/g, '');
    const code = `import binascii\nprint(binascii.b2a_base64(open('img/${safe}','rb').read()).decode())`;
    return await MovSerial.execRaw(code);
}
function renderSets(imagesData, cache, onRemoveFromSet) {
    setsEl.innerHTML = '';
    for (const setName of Object.keys(imagesData.sets)) {
        const section = document.createElement('div');
        section.className = 'set-section';
        const heading = document.createElement('h3');
        heading.textContent = setName + (setName === imagesData.primary ? '（primary）' : '');
        section.appendChild(heading);
        const row = document.createElement('div');
        row.className = 'thumb-row';
        for (const filename of Object.keys(imagesData.sets[setName])) {
            const wrap = document.createElement('div');
            wrap.className = 'thumb';
            const img = document.createElement('img');
            img.src = cache.get(filename) || '';
            img.alt = filename;
            const caption = document.createElement('div');
            caption.className = 'caption';
            caption.textContent = filename.replace(/\.raw$/, '');
            wrap.appendChild(img);
            wrap.appendChild(caption);
            if (onRemoveFromSet) {
                const delBtn = document.createElement('button');
                delBtn.className = 'delBtn';
                delBtn.textContent = 'このセットから外す';
                delBtn.addEventListener('click', () => onRemoveFromSet(setName, filename));
                wrap.appendChild(delBtn);
            }
            row.appendChild(wrap);
        }
        section.appendChild(row);
        setsEl.appendChild(section);
    }
}
loadBtn.addEventListener('click', async () => {
    loadBtn.disabled = true;
    try {
        setLoadStatus('images.jsonを取得しています...');
        log('Raw REPLに入ります。');
        await MovSerial.enterRawRepl();
        try {
            const imagesData = await fetchImagesJson();
            log('images.jsonを取得しました。');
            const allFilenames = new Set();
            for (const setName of Object.keys(imagesData.sets)) {
                for (const filename of Object.keys(imagesData.sets[setName])) {
                    allFilenames.add(filename);
                }
            }
            const cache = new Map();
            const total = allFilenames.size;
            let done = 0;
            for (const filename of allFilenames) {
                setLoadStatus(`画像を取得中... (${done}/${total}) ${filename}`);
                const b64 = await fetchRawFileBase64(filename);
                const bytes = base64ToBytes(b64);
                const rgba = imagesData.use_rle ? decodeRleToRgba(bytes) : decodeRawToRgba(bytes);
                cache.set(filename, rgbaToDataUrl(rgba));
                done++;
                log(`${filename} 取得完了 (${bytes.length} bytes)`);
            }
            renderSets(imagesData, cache);
            setLoadStatus(`完了（${total}枚）`);
        }
        finally {
            await MovSerial.exitRawRepl();
            log('Raw REPLを抜けました。');
        }
    }
    catch (e) {
        setLoadStatus('エラー: ' + e.message);
        log('読み込み失敗: ' + e.message);
    }
    loadBtn.disabled = false;
});
let currentImagesData = null;
async function loadWithNewProtocol() {
    loadNewBtn.disabled = true;
    try {
        setLoadStatus('新プロトコルでプリセットを取得しています...');
        const imagesData = await getPresets();
        log('プリセット取得完了: ' + JSON.stringify(imagesData));
        currentImagesData = imagesData;
        const filenames = await listImages();
        log('画像一覧: ' + JSON.stringify(filenames));
        const cache = new Map();
        const total = filenames.length;
        let done = 0;
        for (const filename of filenames) {
            setLoadStatus(`画像を取得中... (${done}/${total}) ${filename}`);
            const bytes = await getImage(filename);
            const rgba = imagesData.use_rle ? decodeRleToRgba(bytes) : decodeRawToRgba(bytes);
            cache.set(filename, rgbaToDataUrl(rgba));
            done++;
            log(`${filename} 取得完了 (${bytes.length} bytes)`);
        }
        renderSets(imagesData, cache, handleRemoveFromSet);
        setLoadStatus(`完了（${total}枚、新プロトコル）`);
        await refreshStorageInfo();
    }
    catch (e) {
        setLoadStatus('エラー: ' + e.message);
        log('読み込み失敗: ' + e.message);
    }
    loadNewBtn.disabled = false;
}
// プレビュー画面の「このセットから外す」操作: プール(img/)の実ファイルには触れず、
// そのセットの選択情報(images.jsonのsets)からキーを外して保存するだけ。
async function handleRemoveFromSet(setName, filename) {
    if (!currentImagesData)
        return;
    if (!confirm(`「${setName}」から ${filename} を外しますか？（画像自体は削除されません）`))
        return;
    try {
        delete currentImagesData.sets[setName][filename];
        const result = await savePresets(currentImagesData);
        log(`「${setName}」から ${filename} を外しました。`);
        if (result.warning) {
            log('警告: ' + result.warning);
        }
        await loadWithNewProtocol();
    }
    catch (e) {
        log('保存失敗: ' + e.message);
    }
}
loadNewBtn.addEventListener('click', loadWithNewProtocol);
uploadBtn.addEventListener('click', async () => {
    const file = uploadFileInput.files?.[0];
    if (!file) {
        log('アップロードするPNGファイルを選択してください。');
        return;
    }
    let filename = uploadFilenameInput.value.trim();
    if (!filename) {
        filename = file.name.replace(/\.png$/i, '') + '.raw';
    }
    if (!filename.endsWith('.raw')) {
        filename += '.raw';
    }
    uploadBtn.disabled = true;
    try {
        log(`${file.name} を変換しています...`);
        const rle = await pngFileToRgb565Rle(file);
        log(`変換完了 (${rle.length} bytes)。`);
        const info = await getStorageInfo();
        if (rle.length > info.freeBytes) {
            const proceed = confirm(`空き容量が足りない可能性があります（空き${formatBytes(info.freeBytes)} / 必要${formatBytes(rle.length)}）。それでもアップロードしますか？`);
            if (!proceed) {
                log('容量不足のためアップロードを中止しました。');
                uploadBtn.disabled = false;
                return;
            }
        }
        log(`アップロードします: ${filename}`);
        await uploadImage(filename, rle);
        log(`アップロード完了: ${filename}`);
        uploadFileInput.value = '';
        uploadFilenameInput.value = '';
        await refreshStorageInfo();
    }
    catch (e) {
        log('アップロード失敗: ' + e.message);
    }
    uploadBtn.disabled = false;
});
tryAutoConnect();
