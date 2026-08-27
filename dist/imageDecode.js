// movdice: images.jsonの型と、RGB565/RLE画像データのデコード処理
// img_cvt.py の _image_to_rgb565 / _rle_encode、esp32_dist/main.py の _draw_image_rle と対応する処理
const IMG_WIDTH = 320;
const IMG_HEIGHT = 172;
export function base64ToBytes(b64) {
    const bin = atob(b64.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        bytes[i] = bin.charCodeAt(i);
    return bytes;
}
function rgb565ToRgb888(val) {
    const r5 = (val >> 11) & 0x1f;
    const g6 = (val >> 5) & 0x3f;
    const b5 = val & 0x1f;
    return [Math.round((r5 * 255) / 31), Math.round((g6 * 255) / 63), Math.round((b5 * 255) / 31)];
}
// img_cvt.pyの_rle_encode / main.pyの_draw_image_rleと対のデコード
// トークン形式: 色2byte(big-endian) + (ラン長-1)1byte
export function decodeRleToRgba(bytes) {
    const pixelCount = IMG_WIDTH * IMG_HEIGHT;
    const rgba = new Uint8ClampedArray(pixelCount * 4);
    let pos = 0;
    let outPixel = 0;
    const n = bytes.length;
    while (pos + 2 < n && outPixel < pixelCount) {
        const hi = bytes[pos];
        const lo = bytes[pos + 1];
        const run = bytes[pos + 2] + 1;
        pos += 3;
        const [r, g, b] = rgb565ToRgb888((hi << 8) | lo);
        for (let i = 0; i < run && outPixel < pixelCount; i++) {
            const idx = outPixel * 4;
            rgba[idx] = r;
            rgba[idx + 1] = g;
            rgba[idx + 2] = b;
            rgba[idx + 3] = 255;
            outPixel++;
        }
    }
    return rgba;
}
// RLEを使わない場合（images.jsonのuse_rleがfalse）の生RGB565デコード
export function decodeRawToRgba(bytes) {
    const pixelCount = IMG_WIDTH * IMG_HEIGHT;
    const rgba = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
        const hi = bytes[i * 2];
        const lo = bytes[i * 2 + 1];
        const [r, g, b] = rgb565ToRgb888((hi << 8) | lo);
        const idx = i * 4;
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
    }
    return rgba;
}
export function rgbaToDataUrl(rgba) {
    const canvas = document.createElement('canvas');
    canvas.width = IMG_WIDTH;
    canvas.height = IMG_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        throw new Error('canvas 2d context を取得できません');
    // TSのUint8ClampedArrayジェネリック化により型が厳密に一致しないが、実行時のデータ構造は問題ない
    ctx.putImageData(new ImageData(rgba, IMG_WIDTH, IMG_HEIGHT), 0, 0);
    return canvas.toDataURL('image/png');
}
// --- アップロード用: PNG(File/Blob) -> RGB565 -> RLE圧縮 ---
// img_cvt.py の _image_to_rgb565 / _rle_encode と対応する処理（変換自体はブラウザ側で完結させる方針）
function rgbaToRgb565Bytes(rgba) {
    const pixelCount = IMG_WIDTH * IMG_HEIGHT;
    const out = new Uint8Array(pixelCount * 2);
    for (let i = 0; i < pixelCount; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];
        const rgb565 = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
        out[i * 2] = rgb565 >> 8;
        out[i * 2 + 1] = rgb565 & 0xff;
    }
    return out;
}
// img_cvt.pyの_rle_encodeと同じロジック（色2byte(big-endian) + (ラン長-1)1byte のトークン列）
function rleEncode(buf) {
    const out = [];
    const n = buf.length;
    let i = 0;
    while (i < n) {
        const hi = buf[i];
        const lo = buf[i + 1];
        let j = i + 2;
        while (j < n && buf[j] === hi && buf[j + 1] === lo) {
            j += 2;
        }
        let run = (j - i) / 2;
        while (run > 0) {
            const chunk = Math.min(run, 256);
            out.push(hi, lo, chunk - 1);
            run -= chunk;
        }
        i = j;
    }
    return new Uint8Array(out);
}
export async function pngFileToRgb565Rle(file) {
    const bitmap = await createImageBitmap(file, {
        resizeWidth: IMG_WIDTH,
        resizeHeight: IMG_HEIGHT,
        resizeQuality: 'high',
    });
    const canvas = document.createElement('canvas');
    canvas.width = IMG_WIDTH;
    canvas.height = IMG_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        throw new Error('canvas 2d context を取得できません');
    ctx.drawImage(bitmap, 0, 0, IMG_WIDTH, IMG_HEIGHT);
    const imageData = ctx.getImageData(0, 0, IMG_WIDTH, IMG_HEIGHT);
    return rleEncode(rgbaToRgb565Bytes(imageData.data));
}
