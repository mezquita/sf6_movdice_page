import { MovSerial } from './serial.js';
import { ImagesJson, decodeRleToRgba, decodeRawToRgba, rgbaToDataUrl } from './imageDecode.js';
import { listImages, getImage, getPresets, savePresets, reboot } from './protocol.js';
import { log } from './ui.js';
import { appState } from './state.js';

const loadNewBtn = document.getElementById('loadNewBtn') as HTMLButtonElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const saveStatusEl = document.getElementById('saveStatus') as HTMLSpanElement;
const rebootBtn = document.getElementById('rebootBtn') as HTMLButtonElement;
const setsEl = document.getElementById('sets') as HTMLDivElement;
const newSetNameInput = document.getElementById('newSetName') as HTMLInputElement;
const addSetBtn = document.getElementById('addSetBtn') as HTMLButtonElement;
const loadStatusEl = document.getElementById('loadStatus') as HTMLDivElement;

function setLoadStatus(text: string): void {
  loadStatusEl.textContent = text;
}

export function refreshUi(): void {
  const connected = MovSerial.isConnected();
  loadNewBtn.disabled = !connected;
  saveBtn.disabled = !connected;
  rebootBtn.disabled = !connected;
  newSetNameInput.disabled = !connected;
  addSetBtn.disabled = !connected;
}

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
    heading.style.cssText = 'display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;';
    const isPrimary = setName === imagesData.primary;
    const titleSpan = document.createElement('span');
    titleSpan.textContent = setName + (isPrimary ? '（primary）' : '');
    heading.appendChild(titleSpan);
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
        addRow.className = 'addToSetRow';
        addRow.style.cssText = 'margin-top:0.5rem; display:flex; align-items:center; gap:0.4rem; font-size:0.85rem;';

        const selectLabel = document.createElement('span');
        selectLabel.textContent = '画像：';

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
        addBtn.textContent = '追加';
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
  if (!appState.imagesData) return;
  renderSets(appState.imagesData, appState.cache, {
    onRemoveFromSet: handleRemoveFromSet,
    onSetPrimary: handleSetPrimary,
    onFreqChange: handleFreqChange,
    onAddToSet: handleAddToSet,
    onDeleteSet: handleDeleteSet,
  });
}

export async function loadWithNewProtocol(): Promise<void> {
  loadNewBtn.disabled = true;
  try {
    setLoadStatus('プリセットを取得しています...');
    const imagesData = await getPresets();
    log('プリセット取得完了: ' + JSON.stringify(imagesData));
    appState.imagesData = imagesData;

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
    appState.cache = cache;
    rerenderSetsLocal();
    setLoadStatus(`完了（${total}枚）`);
  } catch (e) {
    setLoadStatus('エラー: ' + (e as Error).message);
    log('読み込み失敗: ' + (e as Error).message);
  }
  loadNewBtn.disabled = false;
}

// 新しいキャラ(セット)を追加する（画像は空の状態で作成。ローカル編集、未保存）
addSetBtn.addEventListener('click', () => {
  if (!appState.imagesData) {
    log('先に画像一覧を読み込んでください。');
    return;
  }
  const name = newSetNameInput.value.trim();
  if (!name) {
    log('キャラ名を入力してください。');
    return;
  }
  // JSON構造のキーとして使うため、半角英数字・ハイフン・ピリオドのみ許可する
  if (!/^[A-Za-z0-9.-]+$/.test(name)) {
    log('キャラ名は半角英数字・ハイフン(-)・ピリオド(.)のみ使用できます。');
    return;
  }
  if (appState.imagesData.sets[name]) {
    log(`「${name}」は既に存在します。`);
    return;
  }
  appState.imagesData.sets[name] = {};
  newSetNameInput.value = '';
  log(`「${name}」を追加しました（画像はまだありません。下の一覧で画像を追加してください。未保存）。`);
  rerenderSetsLocal();
});

// プレビュー画面の「このセットから外す」操作: プール(img/)の実ファイルには触れず、
// そのセットの選択情報(images.jsonのsets)からキーを外すだけ（ローカル編集、未保存）。
function handleRemoveFromSet(setName: string, filename: string): void {
  if (!appState.imagesData) return;
  delete appState.imagesData.sets[setName][filename];
  log(`「${setName}」から ${filename} を外しました（未保存。「設定を反映」で書き込まれます）。`);
  rerenderSetsLocal();
}

// キャラ(セット)自体を削除する。primaryは削除できない（呼び出し元でボタン自体を出していない）。
function handleDeleteSet(setName: string): void {
  if (!appState.imagesData) return;
  if (!confirm(`「${setName}」を削除しますか？（そのキャラの設定がすべて消えます。画像自体は削除されません）`)) return;
  delete appState.imagesData.sets[setName];
  log(`「${setName}」を削除しました（未保存。「設定を反映」で書き込まれます）。`);
  rerenderSetsLocal();
}

// 起動時に最初に表示するセットを切り替える（ローカル編集、未保存）
function handleSetPrimary(setName: string): void {
  if (!appState.imagesData) return;
  appState.imagesData.primary = setName;
  log(`primaryを「${setName}」に変更しました（未保存。「設定を反映」で書き込まれます）。`);
  rerenderSetsLocal();
}

// 既存の画像の表示頻度を変更する（ローカル編集、未保存）
function handleFreqChange(setName: string, filename: string, value: number): void {
  if (!appState.imagesData) return;
  appState.imagesData.sets[setName][filename] = value;
  log(`「${setName}」の${filename}の頻度を${value}に変更しました（未保存。「設定を反映」で書き込まれます）。`);
}

// プールにある画像を、指定した頻度でこのセットに新たに追加する（ローカル編集、未保存）
function handleAddToSet(setName: string, filename: string, freq: number): void {
  if (!appState.imagesData) return;
  appState.imagesData.sets[setName][filename] = freq;
  log(`「${setName}」に ${filename}（頻度${freq}）を追加しました（未保存。「設定を反映」で書き込まれます）。`);
  rerenderSetsLocal();
}

loadNewBtn.addEventListener('click', loadWithNewProtocol);

saveBtn.addEventListener('click', async () => {
  if (!appState.imagesData) {
    log('先に画像一覧を読み込んでください。');
    return;
  }
  saveBtn.disabled = true;
  try {
    const result = await savePresets(appState.imagesData);
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
