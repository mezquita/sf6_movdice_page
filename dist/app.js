import { BUILD_VERSION } from './version.js';
import { log } from './ui.js';
import * as connectionTab from './connectionTab.js';
import * as poolTab from './poolTab.js';
import * as charTab from './charTab.js';
const buildVersionEl = document.getElementById('buildVersion');
const logEl = document.getElementById('log');
const copyLogBtn = document.getElementById('copyLogBtn');
buildVersionEl.textContent = 'build: ' + BUILD_VERSION;
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
const tabButtons = {
    conn: document.getElementById('tabConnBtn'),
    pool: document.getElementById('tabPoolBtn'),
    char: document.getElementById('tabCharBtn'),
    help: document.getElementById('tabHelpBtn'),
};
const tabPanels = {
    conn: document.getElementById('tabConn'),
    pool: document.getElementById('tabPool'),
    char: document.getElementById('tabChar'),
    help: document.getElementById('tabHelp'),
};
function showTab(tab) {
    for (const name of Object.keys(tabButtons)) {
        const active = name === tab;
        tabPanels[name].classList.toggle('active', active);
        tabButtons[name].classList.toggle('active-tab', active);
    }
}
Object.keys(tabButtons).forEach((name) => {
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
