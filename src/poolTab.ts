import { MovSerial } from './serial.js';
import { decodeRleToRgba, decodeRawToRgba, rgbaToDataUrl, pngFileToRgb565Rle } from './imageDecode.js';
import { listImages, getImage, getPresets, uploadImage, deleteImage, testDisplay, getStorageInfo } from './protocol.js';
import { log } from './ui.js';
import { appState } from './state.js';
import { refreshStorageInfo, formatBytes } from './storageInfo.js';

const uploadFileInput = document.getElementById('uploadFile') as HTMLInputElement;
const uploadFilenameInput = document.getElementById('uploadFilename') as HTMLInputElement;
const uploadBtn = document.getElementById('uploadBtn') as HTMLButtonElement;
const testSizeInput = document.getElementById('testSize') as HTMLInputElement;
const testUploadBtn = document.getElementById('testUploadBtn') as HTMLButtonElement;
const loadPoolBtn = document.getElementById('loadPoolBtn') as HTMLButtonElement;
const poolStatusEl = document.getElementById('poolStatus') as HTMLDivElement;
const poolListEl = document.getElementById('poolList') as HTMLDivElement;

export function refreshUi(): void {
  const connected = MovSerial.isConnected();
  uploadFileInput.disabled = !connected;
  uploadFilenameInput.disabled = !connected;
  uploadBtn.disabled = !connected;
  loadPoolBtn.disabled = !connected;
  testSizeInput.disabled = !connected;
  testUploadBtn.disabled = !connected;
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
  } catch (e) {
    log(`テスト送信失敗 (${size} bytes): ` + (e as Error).message);
  }
  testUploadBtn.disabled = false;
});

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
      const proceed = confirm(
        `空き容量が足りない可能性があります（空き${formatBytes(info.freeBytes)} / 必要${formatBytes(rle.length)}）。それでもアップロードしますか？`
      );
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
    await loadImagePool();
  } catch (e) {
    log('アップロード失敗: ' + (e as Error).message);
  }
  uploadBtn.disabled = false;
});

// --- 画像プール管理（実ファイルの完全削除。プレビュー画面の「このセットから外す」とは別物） ---

export async function loadImagePool(): Promise<void> {
  loadPoolBtn.disabled = true;
  try {
    poolStatusEl.textContent = 'プール一覧を取得しています...';
    const filenames = await listImages();
    const presets = appState.imagesData ?? (await getPresets());

    // 各画像がどのセットから参照されているかを集計（使用中バッジ用）
    const usageMap = new Map<string, string[]>();
    for (const setName of Object.keys(presets.sets)) {
      for (const filename of Object.keys(presets.sets[setName])) {
        if (!usageMap.has(filename)) usageMap.set(filename, []);
        usageMap.get(filename)!.push(setName);
      }
    }

    poolListEl.innerHTML = '';
    const total = filenames.length;
    let done = 0;
    for (const filename of filenames) {
      poolStatusEl.textContent = `画像を取得中... (${done}/${total}) ${filename}`;
      const bytes = await getImage(filename);
      const rgba = presets.use_rle ? decodeRleToRgba(bytes) : decodeRawToRgba(bytes);
      const dataUrl = rgbaToDataUrl(rgba);
      done++;

      const wrap = document.createElement('div');
      wrap.className = 'thumb';

      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = filename;

      const caption = document.createElement('div');
      caption.className = 'caption';
      caption.textContent = filename.replace(/\.raw$/, '');

      wrap.appendChild(img);
      wrap.appendChild(caption);

      const usedBy = usageMap.get(filename) || [];

      const testBtn = document.createElement('button');
      testBtn.className = 'delBtn';
      testBtn.textContent = 'テスト表示';
      testBtn.addEventListener('click', () => handleTestDisplay(filename));
      wrap.appendChild(testBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'delBtn';
      delBtn.textContent = '完全に削除';
      delBtn.addEventListener('click', () => handlePoolDelete(filename, usedBy));
      wrap.appendChild(delBtn);

      if (usedBy.length > 0) {
        const badge = document.createElement('div');
        badge.className = 'usedBy';
        badge.textContent = `使用中: ${usedBy.join(', ')}`;
        wrap.appendChild(badge);
      }

      poolListEl.appendChild(wrap);
    }
    poolStatusEl.textContent = `完了（${total}枚）`;
  } catch (e) {
    poolStatusEl.textContent = 'エラー: ' + (e as Error).message;
    log('プール読み込み失敗: ' + (e as Error).message);
  }
  loadPoolBtn.disabled = false;
}

async function handleTestDisplay(filename: string): Promise<void> {
  try {
    log(`テスト表示: ${filename}`);
    await testDisplay(filename);
    log(`テスト表示完了: ${filename}`);
  } catch (e) {
    log('テスト表示失敗: ' + (e as Error).message);
  }
}

async function handlePoolDelete(filename: string, usedBy: string[]): Promise<void> {
  const warning =
    usedBy.length > 0
      ? `${filename} は次のセットから使用中です: ${usedBy.join(', ')}\n削除すると、それらのセットの表示も壊れます。`
      : `${filename} はどのセットからも使われていません。`;
  if (!confirm(`${warning}\n\n本当に完全に削除しますか？（元に戻せません）`)) return;
  try {
    await deleteImage(filename);
    log(`${filename} をプールから完全に削除しました。`);
    await refreshStorageInfo();
    await loadImagePool();
  } catch (e) {
    log('削除失敗: ' + (e as Error).message);
  }
}

loadPoolBtn.addEventListener('click', loadImagePool);
