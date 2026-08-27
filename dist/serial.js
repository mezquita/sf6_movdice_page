// movdice: ESP32とのWeb Serial接続まわりの共通処理
// 接続管理 + MicroPythonのRaw REPLを使ったコード実行（開発/検証用の暫定手段）
const USB_VENDOR_ID = 0x303A; // Espressif
const USB_PRODUCT_ID = 0x1001; // ESP32-C6 USB Serial/JTAG
export const MovSerial = (() => {
    let port = null;
    let reader = null;
    let readLoopPromise = null;
    let rxBuffer = [];
    let debugLog = null;
    function setDebugLogger(fn) {
        debugLog = fn;
    }
    function dlog(msg) {
        if (debugLog)
            debugLog('[serial.ts] ' + msg);
    }
    function isSupported() {
        return 'serial' in navigator;
    }
    async function getRememberedPort() {
        const ports = await navigator.serial.getPorts();
        return (ports.find((p) => {
            const info = p.getInfo();
            return info.usbVendorId === USB_VENDOR_ID && info.usbProductId === USB_PRODUCT_ID;
        }) || null);
    }
    async function requestNewPort() {
        return navigator.serial.requestPort({
            filters: [{ usbVendorId: USB_VENDOR_ID, usbProductId: USB_PRODUCT_ID }],
        });
    }
    function startReadLoop() {
        readLoopPromise = (async () => {
            if (!port || !port.readable)
                return;
            reader = port.readable.getReader();
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done)
                        break;
                    if (value) {
                        for (const b of value)
                            rxBuffer.push(b);
                    }
                }
            }
            catch (e) {
                // ポートが閉じられた場合など。呼び出し側でconnectedを見て判断する。
            }
            finally {
                try {
                    reader?.releaseLock();
                }
                catch (e) {
                    // ignore
                }
                reader = null;
            }
        })();
    }
    async function connect(p) {
        await p.open({ baudRate: 115200 });
        port = p;
        rxBuffer = [];
        startReadLoop();
    }
    function isConnected() {
        return port !== null;
    }
    async function disconnectAndForget() {
        if (reader) {
            try {
                await reader.cancel();
            }
            catch (e) {
                // ignore
            }
        }
        if (readLoopPromise) {
            try {
                await readLoopPromise;
            }
            catch (e) {
                // ignore
            }
        }
        if (port) {
            try {
                if (port.readable || port.writable)
                    await port.close();
            }
            catch (e) {
                // ignore
            }
            try {
                await port.forget();
            }
            catch (e) {
                // ignore
            }
            port = null;
        }
        rxBuffer = [];
    }
    async function writeBytes(bytes) {
        if (!port || !port.writable)
            throw new Error('ポートが接続されていません');
        const w = port.writable.getWriter();
        try {
            await w.write(new Uint8Array(bytes));
        }
        finally {
            w.releaseLock();
        }
    }
    function bytesToString(bytes) {
        return new TextDecoder().decode(new Uint8Array(bytes));
    }
    function findPattern(buf, pattern) {
        outer: for (let i = 0; i <= buf.length - pattern.length; i++) {
            for (let j = 0; j < pattern.length; j++) {
                if (buf[i + j] !== pattern[j])
                    continue outer;
            }
            return i;
        }
        return -1;
    }
    async function waitForBytes(patternStr, timeoutMs = 5000) {
        const pattern = Array.from(new TextEncoder().encode(patternStr));
        const start = Date.now();
        while (true) {
            const idx = findPattern(rxBuffer, pattern);
            if (idx !== -1)
                return idx + pattern.length;
            if (Date.now() - start > timeoutMs) {
                throw new Error(`タイムアウト: "${patternStr}" が来ませんでした`);
            }
            await new Promise((r) => setTimeout(r, 20));
        }
    }
    function consumeUpTo(endIndex) {
        const consumed = rxBuffer.slice(0, endIndex);
        rxBuffer = rxBuffer.slice(endIndex);
        return consumed;
    }
    // 指定バイト数がバッファに集まるまで待って取り出す（独自プロトコルのフレーム読み取り用）
    async function readExactBytes(n, timeoutMs = 8000) {
        const start = Date.now();
        while (rxBuffer.length < n) {
            if (Date.now() - start > timeoutMs) {
                throw new Error(`タイムアウト: ${n}バイト読めませんでした（${rxBuffer.length}バイトのみ受信）`);
            }
            await new Promise((r) => setTimeout(r, 20));
        }
        return consumeUpTo(n);
    }
    // MicroPythonのRaw REPLに入る（Thonny/mpremote等と同じ仕組み）
    async function enterRawRepl() {
        rxBuffer = [];
        await writeBytes([0x03, 0x03]); // Ctrl-C x2: 実行中の処理を止める
        await new Promise((r) => setTimeout(r, 200));
        dlog('Ctrl-C後・破棄前のバッファ: ' + JSON.stringify(bytesToString(rxBuffer)));
        rxBuffer = [];
        await writeBytes([0x01]); // Ctrl-A: raw REPLへ
        const idx = await waitForBytes('raw REPL; CTRL-B to exit\r\n>');
        dlog('raw REPLプロンプト検出idx=' + idx + ' 残り: ' + JSON.stringify(bytesToString(rxBuffer.slice(idx))));
        consumeUpTo(idx); // プロンプトまでを消費。以降に届いているデータは保持する
    }
    async function exitRawRepl() {
        await writeBytes([0x02]); // Ctrl-B: 通常REPLへ戻る
        rxBuffer = [];
    }
    // Raw REPL内でPythonコードを1回実行し、標準出力の文字列を返す
    async function execRaw(code, timeoutMs = 8000) {
        rxBuffer = [];
        await writeBytes(Array.from(new TextEncoder().encode(code)));
        await writeBytes([0x04]); // Ctrl-D: 実行
        const okIdx = await waitForBytes('OK', timeoutMs); // 実行受理の合図
        dlog('OK検出idx=' + okIdx + ' consume前バッファ全体: ' + JSON.stringify(bytesToString(rxBuffer)));
        consumeUpTo(okIdx); // "OK"までを消費。直後に届いているstdoutの先頭は保持する
        dlog('OK消費後の残り: ' + JSON.stringify(bytesToString(rxBuffer)));
        const stdoutEnd = await waitForBytes('\x04', timeoutMs);
        const stdoutBytes = consumeUpTo(stdoutEnd).slice(0, -1); // 末尾の0x04を除く
        const stderrEnd = await waitForBytes('\x04', timeoutMs);
        const stderrBytes = consumeUpTo(stderrEnd).slice(0, -1);
        const stderrStr = bytesToString(stderrBytes);
        if (stderrStr.trim().length > 0) {
            throw new Error('ESP32側エラー: ' + stderrStr);
        }
        return bytesToString(stdoutBytes);
    }
    return {
        isSupported,
        getRememberedPort,
        requestNewPort,
        connect,
        isConnected,
        disconnectAndForget,
        enterRawRepl,
        exitRawRepl,
        execRaw,
        setDebugLogger,
        writeBytes,
        readExactBytes,
    };
})();
