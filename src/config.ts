import { MovSerial } from './serial.js';
import { ImagesJson, decodeRleToRgba, decodeRawToRgba, rgbaToDataUrl, pngFileToRgb565Rle } from './imageDecode.js';
import {
  listImages,
  getImage,
  getPresets,
  savePresets,
  uploadImage,
  deleteImage,
  getStorageInfo,
  testDisplay,
  reboot,
} from './protocol.js';
import { BUILD_VERSION } from './version.js';

const statusEl = document.getElementById('status') as HTMLDivElement;
const loadNewBtn = document.getElementById('loadNewBtn') as HTMLButtonElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const saveStatusEl = document.getElementById('saveStatus') as HTMLSpanElement;
const rebootBtn = document.getElementById('rebootBtn') as HTMLButtonElement;
const loadStatusEl = document.getElementById('loadStatus') as HTMLDivElement;
const setsEl = document.getElementById('sets') as HTMLDivElement;
const logEl = document.getElementById('log') as HTMLDivElement;
const copyLogBtn = document.getElementById('copyLogBtn') as HTMLButtonElement;
const uploadFileInput = document.getElementById('uploadFile') as HTMLInputElement;
const uploadFilenameInput = document.getElementById('uploadFilename') as HTMLInputElement;
const uploadBtn = document.getElementById('uploadBtn') as HTMLButtonElement;
const buildVersionEl = document.getElementById('buildVersion') as HTMLParagraphElement;
const storageInfoEl = document.getElementById('storageInfo') as HTMLDivElement;
const testSizeInput = document.getElementById('testSize') as HTMLInputElement;
const testUploadBtn = document.getElementById('testUploadBtn') as HTMLButtonElement;
const loadPoolBtn = document.getElementById('loadPoolBtn') as HTMLButtonElement;
const poolStatusEl = document.getElementById('poolStatus') as HTMLDivElement;
const poolListEl = document.getElementById('poolList') as HTMLDivElement;
const newSetNameInput = document.getElementById('newSetName') as HTMLInputElement;
const addSetBtn = document.getElementById('addSetBtn') as HTMLButtonElement;
const tabPoolBtn = document.getElementById('tabPoolBtn') as HTMLButtonElement;
const tabCharBtn = document.getElementById('tabCharBtn') as HTMLButtonElement;
const tabPoolEl = document.getElementById('tabPool') as HTMLDivElement;
const tabCharEl = document.getElementById('tabChar') as HTMLDivElement;

buildVersionEl.textContent = 'hash: ' + BUILD_VERSION;

// --- タブ切り替え（ページ遷移なし。接続状態を保ったまま画面を切り替えるため） ---

function showTab(tab: 'pool' | 'char'): void {
  const isPool = tab === 'pool';
  tabPoolEl.classList.toggle('active', isPool);
  tabCharEl.classList.toggle('active', !isPool);
  tabPoolBtn.classList.toggle('tab-inactive', !isPool);
  tabCharBtn.classList.toggle('tab-inactive', isPool);
}

tabPoolBtn.addEventListener('click', () => showTab('pool'));
tabCharBtn.addEventListener('click', () => showTab('char'));
showTab('pool');

function formatBytes(n: number): string {
  return (n / 1024).toFixed(1) + ' KB';
}

async function refreshStorageInfo(): Promise<void> {
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
    if (pct >= 90) fill.className = 'danger';
    else if (pct >= 70) fill.className = 'warn';
    bar.appendChild(fill);
    storageInfoEl.appendChild(bar);
  } catch (e) {
    storageInfoEl.textContent = 'ストレージ情報の取得に失敗: ' + (e as Error).message;
  }
}

function log(msg: string): void {
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
  } catch (e) {
    log('クリップボードへのコピーに失敗: ' + (e as Error).message);
  }
});

function setStatus(text: string, cls: string): void {
  statusEl.textContent = text;
  statusEl.className = cls;
}

function setLoadStatus(text: string): void {
  loadStatusEl.textContent = text;
}

MovSerial.setDebugLogger(log);

function refreshUi(): void {
  const connected = MovSerial.isConnected();
  loadNewBtn.disabled = !connected;
  saveBtn.disabled = !connected;
  rebootBtn.disabled = !connected;
  uploadFileInput.disabled = !connected;
  uploadFilenameInput.disabled = !connected;
  uploadBtn.disabled = !connected;
  loadPoolBtn.disabled = !connected;
  testSizeInput.disabled = !connected;
  testUploadBtn.disabled = !connected;
  newSetNameInput.disabled = !connected;
  addSetBtn.disabled = !connected;
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
  } catch (e) {
    log(`テスト送信失敗 (${size} bytes): ` + (e as Error).message);
  }
  testUploadBtn.disabled = false;
});

rebootBtn.addEventListener('click', async () => {
  if (!confirm('ESP32を再起動しますか？（設定モードを抜けて通常のスライドショーが始まります。未保存の変更は失われます）')) return;
  rebootBtn.disabled = true;
  try {
    log('再起動コマンドを送信します。');
    await reboot();
    log('再起動しました。再度設定するにはリセット後にPWR(BOOT)ボタンで入り直してください。');
  } catch (e) {
    log('再起動時にエラー（応答前に切断された可能性、実際には再起動できている場合があります）: ' + (e as Error).message);
  }
  rebootBtn.disabled = false;
});

async function tryAutoConnect(): Promise<void> {
  if (!MovSerial.isSupported()) {
    setStatus('このブラウザはWeb Serial APIに対応していません（Chrome/Edgeを使ってください）', 'status-error');
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
    log('許可済みデバイスがありません。接続ページで先に接続してください。');
  }
}

// --- 画像読み込み・プリセット編集 ---
// 変更(頻度・追加・削除・primary)はすべてローカルの currentImagesData を書き換えるだけに留め、
// 実際にESP32へ書き込むのは「設定を反映」ボタン(saveBtn)を押した時だけ。

let currentImagesData: ImagesJson | null = null;
let currentCache: Map<string, string> = new Map();

interface RenderSetsCallbacks {
  onRemoveFromSet?: (setName: string, filename: string) => void;
  onSetPrimary?: (setName: string) => void;
  onFreqChange?: (setName: string, filename: string, value: number) => void;
  onAddToSet?: (setName: string, filename: string, freq: number) => void;
  onDeleteSet?: (setName: string) => void;
}

function renderSets(imagesData: ImagesJson, cache: Map<string, string>, callbacks: RenderSetsCallbacks = {}): void {
  const { onRemoveFromSet, onSetPrimary, onFreqChange, onAddToSet, onDeleteSet } = callbacks;
  setsEl.innerHTML = '';
  for (const setName of Object.keys(imagesData.sets)) {
    const section = document.createElement('div');
    section.className = 'set-section';

    const isEmpty = Object.keys(imagesData.sets[setName]).length === 0;
    const heading = document.createElement('h3');
    const isPrimary = setName === imagesData.primary;
    heading.textContent = setName + (isPrimary ? '（primary） ' : ' ');
    // 画像が1枚もないセットをprimaryにできてしまうと、動作時にエラーになるため選ばせない
    if (!isPrimary && !isEmpty && onSetPrimary) {
      const primaryBtn = document.createElement('button');
      primaryBtn.textContent = 'primaryにする';
      primaryBtn.style.fontSize = '0.7rem';
      primaryBtn.style.padding = '0.15rem 0.5rem';
      primaryBtn.addEventListener('click', () => onSetPrimary(setName));
      heading.appendChild(primaryBtn);
    }
    // primaryのセットは削除させない（primaryが不在になる状態を防ぐ）
    if (!isPrimary && onDeleteSet) {
      const deleteSetBtn = document.createElement('button');
      deleteSetBtn.textContent = 'このキャラを削除';
      deleteSetBtn.style.fontSize = '0.7rem';
      deleteSetBtn.style.padding = '0.15rem 0.5rem';
      deleteSetBtn.addEventListener('click', () => onDeleteSet(setName));
      heading.appendChild(deleteSetBtn);
    }
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

      const freq = imagesData.sets[setName][filename];
      if (onFreqChange) {
        const freqRow = document.createElement('div');
        freqRow.style.cssText = 'display:flex; align-items:center; justify-content:center; gap:0.2rem; font-size:0.75rem; margin-top:0.2rem;';

        const freqLabel = document.createElement('span');
        freqLabel.textContent = '頻度:';

        const freqInput = document.createElement('input');
        freqInput.type = 'number';
        freqInput.min = '1';
        freqInput.step = '1';
        freqInput.value = String(freq);
        freqInput.style.width = '48px';
        freqInput.addEventListener('change', () => {
          const value = parseInt(freqInput.value, 10);
          if (!Number.isInteger(value) || value < 1) {
            log('頻度は1以上の整数で指定してください。');
            freqInput.value = String(imagesData.sets[setName][filename]);
            return;
          }
          onFreqChange(setName, filename, value);
        });

        freqRow.appendChild(freqLabel);
        freqRow.appendChild(freqInput);
        wrap.appendChild(freqRow);
      } else {
        const freqText = document.createElement('div');
        freqText.className = 'caption';
        freqText.textContent = `頻度: ${freq}`;
        wrap.appendChild(freqText);
      }

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

    if (onAddToSet) {
      const available = Array.from(cache.keys()).filter((f) => !(f in imagesData.sets[setName]));
      if (available.length > 0) {
        const addRow = document.createElement('div');
        addRow.style.cssText = 'margin-top:0.5rem; display:flex; align-items:center; gap:0.4rem; font-size:0.85rem;';

        const selectLabel = document.createElement('span');
        selectLabel.textContent = '画像ファイル名：';

        const select = document.createElement('select');
        for (const f of available) {
          const opt = document.createElement('option');
          opt.value = f;
          opt.textContent = f.replace(/\.raw$/, '');
          select.appendChild(opt);
        }

        const freqLabel = document.createElement('span');
        freqLabel.textContent = '頻度：';

        const freqInput = document.createElement('input');
        freqInput.type = 'number';
        freqInput.min = '1';
        freqInput.step = '1';
        freqInput.value = '1';
        freqInput.style.width = '60px';

        const addBtn = document.createElement('button');
        addBtn.textContent = 'このセットに追加';
        addBtn.style.fontSize = '0.8rem';
        addBtn.addEventListener('click', () => {
          const value = parseInt(freqInput.value, 10);
          if (!Number.isInteger(value) || value < 1) {
            log('頻度は1以上の整数で指定してください。');
            return;
          }
          onAddToSet(setName, select.value, value);
        });

        addRow.appendChild(selectLabel);
        addRow.appendChild(select);
        addRow.appendChild(freqLabel);
        addRow.appendChild(freqInput);
        addRow.appendChild(addBtn);
        section.appendChild(addRow);
      }
    }

    setsEl.appendChild(section);
  }
}

function rerenderSetsLocal(): void {
  if (!currentImagesData) return;
  renderSets(currentImagesData, currentCache, {
    onRemoveFromSet: handleRemoveFromSet,
    onSetPrimary: handleSetPrimary,
    onFreqChange: handleFreqChange,
    onAddToSet: handleAddToSet,
    onDeleteSet: handleDeleteSet,
  });
}

async function loadWithNewProtocol(): Promise<void> {
  loadNewBtn.disabled = true;
  try {
    setLoadStatus('プリセットを取得しています...');
    const imagesData = await getPresets();
    log('プリセット取得完了: ' + JSON.stringify(imagesData));
    currentImagesData = imagesData;

    const filenames = await listImages();
    log('画像一覧: ' + JSON.stringify(filenames));

    const cache = new Map<string, string>();
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
    currentCache = cache;
    rerenderSetsLocal();
    setLoadStatus(`完了（${total}枚）`);
    await refreshStorageInfo();
  } catch (e) {
    setLoadStatus('エラー: ' + (e as Error).message);
    log('読み込み失敗: ' + (e as Error).message);
  }
  loadNewBtn.disabled = false;
}

// 新しいキャラ(セット)を追加する（画像は空の状態で作成。ローカル編集、未保存）
addSetBtn.addEventListener('click', () => {
  if (!currentImagesData) {
    log('先に画像一覧を読み込んでください。');
    return;
  }
  const name = newSetNameInput.value.trim();
  if (!name) {
    log('キャラ名を入力してください。');
    return;
  }
  if (currentImagesData.sets[name]) {
    log(`「${name}」は既に存在します。`);
    return;
  }
  currentImagesData.sets[name] = {};
  newSetNameInput.value = '';
  log(`「${name}」を追加しました（画像はまだありません。下の一覧で画像を追加してください。未保存）。`);
  rerenderSetsLocal();
});

// プレビュー画面の「このセットから外す」操作: プール(img/)の実ファイルには触れず、
// そのセットの選択情報(images.jsonのsets)からキーを外すだけ（ローカル編集、未保存）。
function handleRemoveFromSet(setName: string, filename: string): void {
  if (!currentImagesData) return;
  delete currentImagesData.sets[setName][filename];
  log(`「${setName}」から ${filename} を外しました（未保存。「設定を反映」で書き込まれます）。`);
  rerenderSetsLocal();
}

// キャラ(セット)自体を削除する。primaryは削除できない（呼び出し元でボタン自体を出していない）。
function handleDeleteSet(setName: string): void {
  if (!currentImagesData) return;
  if (!confirm(`「${setName}」を削除しますか？（そのキャラの設定がすべて消えます。画像自体は削除されません）`)) return;
  delete currentImagesData.sets[setName];
  log(`「${setName}」を削除しました（未保存。「設定を反映」で書き込まれます）。`);
  rerenderSetsLocal();
}

// 起動時に最初に表示するセットを切り替える（ローカル編集、未保存）
function handleSetPrimary(setName: string): void {
  if (!currentImagesData) return;
  currentImagesData.primary = setName;
  log(`primaryを「${setName}」に変更しました（未保存。「設定を反映」で書き込まれます）。`);
  rerenderSetsLocal();
}

// 既存の画像の表示頻度を変更する（ローカル編集、未保存）
function handleFreqChange(setName: string, filename: string, value: number): void {
  if (!currentImagesData) return;
  currentImagesData.sets[setName][filename] = value;
  log(`「${setName}」の${filename}の頻度を${value}に変更しました（未保存。「設定を反映」で書き込まれます）。`);
}

// プールにある画像を、指定した頻度でこのセットに新たに追加する（ローカル編集、未保存）
function handleAddToSet(setName: string, filename: string, freq: number): void {
  if (!currentImagesData) return;
  currentImagesData.sets[setName][filename] = freq;
  log(`「${setName}」に ${filename}（頻度${freq}）を追加しました（未保存。「設定を反映」で書き込まれます）。`);
  rerenderSetsLocal();
}

loadNewBtn.addEventListener('click', loadWithNewProtocol);

saveBtn.addEventListener('click', async () => {
  if (!currentImagesData) {
    log('先に画像一覧を読み込んでください。');
    return;
  }
  saveBtn.disabled = true;
  try {
    const result = await savePresets(currentImagesData);
    log('設定を反映しました。');
    if (result.warning) {
      log('警告: ' + result.warning);
    }
    saveStatusEl.textContent = '保存されました';
    setTimeout(() => {
      saveStatusEl.textContent = '';
    }, 2000);
  } catch (e) {
    log('保存失敗: ' + (e as Error).message);
  }
  saveBtn.disabled = false;
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
  } catch (e) {
    log('アップロード失敗: ' + (e as Error).message);
  }
  uploadBtn.disabled = false;
});

// --- 画像プール管理（実ファイルの完全削除。プレビュー画面の「このセットから外す」とは別物） ---

async function loadImagePool(): Promise<void> {
  loadPoolBtn.disabled = true;
  try {
    poolStatusEl.textContent = 'プール一覧を取得しています...';
    const filenames = await listImages();
    const presets = currentImagesData ?? (await getPresets());

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

tryAutoConnect();
