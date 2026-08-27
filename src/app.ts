import { BUILD_VERSION } from './version.js';
import { log } from './ui.js';
import * as connectionTab from './connectionTab.js';
import * as poolTab from './poolTab.js';
import * as charTab from './charTab.js';

const buildVersionEl = document.getElementById('buildVersion') as HTMLParagraphElement;
const logEl = document.getElementById('log') as HTMLDivElement;
const copyLogBtn = document.getElementById('copyLogBtn') as HTMLButtonElement;

buildVersionEl.textContent = 'hash: ' + BUILD_VERSION;

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

// --- タブ切り替え（ページ遷移なし。接続状態を保ったまま画面を切り替えるため） ---

type TabName = 'conn' | 'pool' | 'char' | 'help';

const tabButtons: Record<TabName, HTMLButtonElement> = {
  conn: document.getElementById('tabConnBtn') as HTMLButtonElement,
  pool: document.getElementById('tabPoolBtn') as HTMLButtonElement,
  char: document.getElementById('tabCharBtn') as HTMLButtonElement,
  help: document.getElementById('tabHelpBtn') as HTMLButtonElement,
};
const tabPanels: Record<TabName, HTMLDivElement> = {
  conn: document.getElementById('tabConn') as HTMLDivElement,
  pool: document.getElementById('tabPool') as HTMLDivElement,
  char: document.getElementById('tabChar') as HTMLDivElement,
  help: document.getElementById('tabHelp') as HTMLDivElement,
};

function showTab(tab: TabName): void {
  for (const name of Object.keys(tabButtons) as TabName[]) {
    const active = name === tab;
    tabPanels[name].classList.toggle('active', active);
    // 塗りつぶしのまま色(secondary)だけ変える。outlineだと非アクティブが薄すぎて気づかれない。
    tabButtons[name].classList.toggle('secondary', !active);
  }
}

(Object.keys(tabButtons) as TabName[]).forEach((name) => {
  tabButtons[name].addEventListener('click', () => showTab(name));
});
showTab('conn');

// --- 接続状態の変化を、画像プール管理・キャラ管理タブのボタン活性状態にも反映する ---
connectionTab.onConnectionChange(() => {
  poolTab.refreshUi();
  charTab.refreshUi();
});

poolTab.refreshUi();
charTab.refreshUi();
connectionTab.tryAutoConnect();
