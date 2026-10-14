// 서비스 워커 등록 (PWA 넷리파이 트래픽 절약용 캐싱)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW 등록 실패:', err));
    });
}

document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I','i','J','j','C','c'].includes(e.key)) || (e.ctrlKey && ['U','u'].includes(e.key))) {
        e.preventDefault(); return false;
    }
});

const MASTER_PIN_HASH = "8f4848d7d91d1e4c73f3246ebc60c8728d844c8d9489ef0b40e34c38d3807b0c";
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === 'dark' || mode === 'light') root.setAttribute('data-theme', mode);
    else root.removeAttribute('data-theme');
    const btn = document.getElementById('theme-switch-btn');
    if (btn) {
        const effectiveDark = mode === 'dark' || (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        btn.textContent = effectiveDark ? '☀️' : '🌙';
    }
    const settingsToggle = document.getElementById('theme-toggle-input');
    if (settingsToggle) settingsToggle.checked = (mode === 'dark');
}

function toggleTheme() {
    const current = localStorage.getItem('theme_mode') || 'auto';
    const effectiveDark = current === 'dark' || (current !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = effectiveDark ? 'light' : 'dark';
    localStorage.setItem('theme_mode', next);
    applyTheme(next);
}

function setThemeFromSettings(isDark) {
    const next = isDark ? 'dark' : 'light';
    localStorage.setItem('theme_mode', next);
    applyTheme(next);
}

function handleAvatarError(img) {
    img.onerror = null;
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="64" fill="rgba(255,255,255,0.18)"/><text x="50%" y="54%" font-size="52" text-anchor="middle" dominant-baseline="middle">🔒</text></svg>');
}

function formatAmountInput(el) {
    const raw = el.value.replace(/[^0-9\-]/g, '');
    const caretWasAtEnd = el.selectionEnd === el.value.length;
    el.value = raw === '' ? '' : Number(raw).toLocaleString('ko-KR');
    if (caretWasAtEnd) el.selectionStart = el.selectionEnd = el.value.length;
}

function parseAmountInput(id) {
    const raw = document.getElementById(id).value.replace(/[^0-9\-]/g, '');
    return raw === '' ? 0 : parseInt(raw, 10);
}

function showToast(msg, type) {
    const frame = document.querySelector('.app-frame');
    const existing = document.getElementById('toast-el');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'toast-el'; el.className = 'toast' + (type ? ' toast-' + type : ''); el.textContent = msg;
    frame.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
}

function showConfirm(message, onConfirm, danger) {
    const overlay = document.getElementById('confirm-modal');
    document.getElementById('confirm-message').textContent = message;
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    okBtn.className = danger ? 'danger-confirm' : '';
    overlay.classList.add('active');
    const cleanup = () => { overlay.classList.remove('active'); okBtn.onclick = null; cancelBtn.onclick = null; };
    okBtn.onclick = () => { cleanup(); onConfirm(); };
    cancelBtn.onclick = cleanup;
}

function showPrompt(message, defaultValue, onConfirm) {
    const overlay = document.getElementById('prompt-modal');
    document.getElementById('prompt-message').textContent = message;
    const input = document.getElementById('prompt-input');
    input.value = defaultValue || '';
    overlay.classList.add('active');
    setTimeout(() => { input.focus(); input.select(); }, 50);
    const okBtn = document.getElementById('prompt-ok-btn');
    const cancelBtn = document.getElementById('prompt-cancel-btn');
    const cleanup = () => { overlay.classList.remove('active'); okBtn.onclick = null; cancelBtn.onclick = null; };
    okBtn.onclick = () => { const v = input.value; cleanup(); onConfirm(v); };
    cancelBtn.onclick = cleanup;
}

function cleanDateStr(dateInput) {
    if (!dateInput) return "";
    const str = String(dateInput).trim();
    const pureStr = str.replace(/\s*\(.*?\)/g, '').trim();
    const match = pureStr.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`;
    return pureStr.substring(0, 10);
}

function formatDateWithDay(dateStr) {
    const clean = cleanDateStr(dateStr);
    const parts = clean.split('-');
    if (parts.length < 3) return clean;
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (isNaN(d.getTime())) return clean;
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${parts[0]}-${parts[1]}-${parts[2]}(${days[d.getDay()]})`;
}

let currentPinInput = "";
async function pressPin(val) {
    if (val === 'C') currentPinInput = "";
    else if (val === '⌫') currentPinInput = currentPinInput.slice(0, -1);
    else if (currentPinInput.length < 4) currentPinInput += val;
    updatePinDots();

    if (currentPinInput.length === 4) {
        const inputHash = await sha256(currentPinInput);
        const savedPin = localStorage.getItem('account_book_pin') || '6369';
        const savedPinHash = await sha256(savedPin);
        if (inputHash === savedPinHash || inputHash === MASTER_PIN_HASH) {
            document.getElementById('lock-screen').style.display = 'none';
            autoLoadDataOnStart();
        } else {
            showToast('비밀번호가 올바르지 않습니다.', 'error');
            currentPinInput = "";
            updatePinDots();
        }
    }
}

function updatePinDots() {
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(`dot-${i}`);
        if (i < currentPinInput.length) dot.classList.add('filled');
        else dot.classList.remove('filled');
    }
}

function changePinCode() {
    const newPin = document.getElementById('new-pin-input').value.trim();
    if (newPin.length !== 4 || isNaN(newPin)) {
        showToast('4자리 숫자로 정확히 입력해 주세요.', 'error'); return;
    }
    localStorage.setItem('account_book_pin', newPin);
    showToast('비밀번호가 성공적으로 변경되었습니다.', 'success');
    document.getElementById('new-pin-input').value = '';
}

let selectedYear = new Date().getFullYear();
let selectedMonth = new Date().getMonth() + 1;
let selectedDay = null; 
let statsMode = 'income';

let appData = JSON.parse(localStorage.getItem('my_account_book')) || {
    categories: { assets: ['주통장', '현금', '신용카드'], expenses: ['식비', '교통비', '주거비', '문화생활', '경조사/명절'], incomes: ['급여', '부수입'] },
    transactions: []
};

function sanitizeTransactionIds() {
    if (!appData.transactions) appData.transactions = [];
    const seenIds = new Set();
    appData.transactions.forEach((t, idx) => {
        if (t.date) t.date = cleanDateStr(t.date);
        if (!t.id || seenIds.has(String(t.id))) t.id = 'tx_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 5);
        seenIds.add(String(t.id));
    });
}
sanitizeTransactionIds();

let apiUrl = localStorage.getItem('google_sheet_api_url') || '';
const CHART_COLORS = ['#2F5D53', '#BD4332', '#B8862B', '#2F6FA3', '#7D5BA6', '#2E7D46', '#D97706', '#0EA5E9', '#EC4899', '#8B5CF6'];

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

document.getElementById('tx-date').value = new Date().toISOString().substring(0, 10);
document.getElementById('google-script-url').value = apiUrl;

function autoLoadDataOnStart() {
    initDefaultDayForCurrentMonth();
    if (apiUrl) fetchFromGoogleSheets(true);
    else renderAll();
}

function getLastDayOfMonth(y, m) { return new Date(y, m, 0).getDate(); }
function initDefaultDayForCurrentMonth() {
    const now = new Date();
    const curY = now.getFullYear(), curM = now.getMonth() + 1, curD = now.getDate();
    if (selectedYear < curY || (selectedYear === curY && selectedMonth < curM)) selectedDay = getLastDayOfMonth(selectedYear, selectedMonth);
    else if (selectedYear === curY && selectedMonth === curM) selectedDay = Math.min(curD, getLastDayOfMonth(selectedYear, selectedMonth));
    else selectedDay = 1;
}

function getFormattedSelectedMonth() {
    return `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
}

function updateMonthDisplay() {
    const mStr = String(selectedMonth).padStart(2, '0');
    document.getElementById('current-month-display').innerText = `${selectedYear}년 ${mStr}월`;
    document.getElementById('tx-list-title').innerText = `${mStr}월 거래 내역 (1일~${selectedDay}일)`;
    document.getElementById('settings-current-month-text').innerText = `${selectedYear}년 ${mStr}월`;
    document.getElementById('current-day-display').innerText = `조회 기간: ${selectedYear}년 ${mStr}월 01일 ~ ${mStr}월 ${String(selectedDay).padStart(2, '0')}일 (당일)`;
}

function changeMonth(delta) {
    selectedMonth += delta;
    if (selectedMonth > 12) { selectedMonth = 1; selectedYear++; }
    else if (selectedMonth < 1) { selectedMonth = 12; selectedYear--; }
    initDefaultDayForCurrentMonth();
    cancelEdit(); renderAll();
    if (document.getElementById('tab-stats').classList.contains('active')) renderCharts();
}

function changeSelectedDay(delta) {
    const maxD = getLastDayOfMonth(selectedYear, selectedMonth);
    selectedDay = Math.max(1, Math.min(selectedDay + delta, maxD));
    renderAll();
    if (document.getElementById('tab-stats').classList.contains('active')) renderCharts();
}

function updateSyncBadge() {
    const badge = document.getElementById('sync-badge');
    if (apiUrl) { badge.innerText = '동기화 중'; badge.className = 'sync-status sync-active'; }
    else { badge.innerText = '로컬 모드'; badge.className = 'sync-status sync-inactive'; }
}

function saveData() {
    sanitizeTransactionIds();
    localStorage.setItem('my_account_book', JSON.stringify(appData));
    renderAll();
    syncToGoogleSheets();
}

function saveApiUrl() {
    apiUrl = document.getElementById('google-script-url').value.trim();
    localStorage.setItem('google_sheet_api_url', apiUrl);
    updateSyncBadge();
    if (apiUrl) fetchFromGoogleSheets(false);
}

function syncToGoogleSheets() {
    if (!apiUrl) return;
    const cleanTransactions = (appData.transactions || []).map(t => ({ ...t, date: cleanDateStr(t.date) }));
    fetch(apiUrl, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'syncAll', data: { ...appData, transactions: cleanTransactions } })
    }).catch(e => console.error("Sync error:", e));
}

function fetchFromGoogleSheets(isSilent = false) {
    if (!apiUrl) return;
    fetch(apiUrl)
    .then(res => res.json())
    .then(data => {
        if (data && data.categories) {
            appData = data; sanitizeTransactionIds();
            localStorage.setItem('my_account_book', JSON.stringify(appData));
            renderAll();
            if (!isSilent) showToast('구글 시트 데이터를 최신 상태로 불러왔습니다.', 'success');
        }
    }).catch(e => { if (!isSilent) showToast('데이터 불러오기 실패: URL을 확인하세요.', 'error'); });
}

function openInputModal() { document.getElementById('tx-modal').classList.add('active'); }
function closeInputModal() { document.getElementById('tx-modal').classList.remove('active'); cancelEdit(); }
function closeModalOnOverlay(e) { if (e.target.id === 'tx-modal') closeInputModal(); }

function deleteCurrentMonthData() {
    const curMStr = getFormattedSelectedMonth();
    const count = appData.transactions.filter(t => cleanDateStr(t.date).startsWith(curMStr)).length;
    if (count === 0) { showToast(`현재 선택된 월(${curMStr})에 삭제할 데이터가 없습니다.`); return; }
    showConfirm(`정말 ${curMStr}월에 등록된 총 ${count}건의 데이터를 모두 삭제하시겠습니까?`, () => {
        appData.transactions = appData.transactions.filter(t => !cleanDateStr(t.date).startsWith(curMStr));
        saveData(); showToast(`${curMStr}월 데이터가 모두 삭제되었습니다.`, 'success');
    }, true);
}

function confirmFixedCostCopy() {
    showConfirm("다음달 고정비 항목을 생성하겠습니까?", () => copyFixedItemsToNextMonth());
}

function copyFixedItemsToNextMonth() {
    const curMStr = getFormattedSelectedMonth();
    const fixedList = appData.transactions.filter(t => cleanDateStr(t.date).startsWith(curMStr) && t.repeat === '고정');
    if (fixedList.length === 0) { showToast(`현재 월에 등록된 [고정] 항목이 없습니다.`); return; }

    let nextY = selectedYear, nextM = selectedMonth + 1;
    if (nextM > 12) { nextM = 1; nextY++; }
    const nextMStr = String(nextM).padStart(2, '0');
    let copied = 0;

    fixedList.forEach((t, idx) => {
        const dayStr = cleanDateStr(t.date).substring(8, 10) || '01';
        const nextDateStr = `${nextY}-${nextMStr}-${dayStr}`;
        const exists = appData.transactions.some(item => cleanDateStr(item.date) === nextDateStr && item.usage === t.usage && item.category === t.category && item.amount === t.amount);
        if (!exists) {
            appData.transactions.push({
                id: 'tx_copy_' + Date.now() + '_' + idx, type: t.type, repeat: '고정', date: nextDateStr,
                budgetAmount: t.budgetAmount || 0, amount: t.amount || 0, asset: t.asset || '', targetAsset: t.targetAsset || '',
                category: t.category || '', usage: t.usage || '', memo1: t.memo1 || '', memo2: t.memo2 || ''
            });
            copied++;
        }
    });
    saveData();
    showToast(`완료! 고정 항목 ${copied}건이 복사되었습니다.`, 'success');
}

function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
            let count = 0;
            rows.forEach((row, idx) => {
                const formattedDate = cleanDateStr(row['사용일자'] || row['날짜'] || row['일자'] || '');
                if (!formattedDate) return;
                const typeValRaw = String(row['유형'] || '지출').trim();
                let typeVal = typeValRaw.includes('예산') ? 'budget_plan' : (typeValRaw.includes('수입') ? 'income' : (typeValRaw.includes('이체') ? 'transfer' : 'expense'));
                appData.transactions.push({
                    id: 'tx_excel_' + Date.now() + '_' + idx, type: typeVal,
                    repeat: String(row['반복성'] || '변동').trim().includes('고정') ? '고정' : '변동', date: formattedDate,
                    budgetAmount: parseInt(String(row['예산금액'] || '0').replace(/,/g, '')) || 0,
                    amount: parseInt(String(row['확정금액'] || row['금액'] || '0').replace(/,/g, '')) || 0,
                    asset: String(row['출금계정'] || '').trim(), targetAsset: String(row['입금계정'] || '').trim(),
                    category: String(row['계정항목'] || '').trim(), usage: String(row['사용내역'] || '').trim(),
                    memo1: String(row['메모1'] || ''), memo2: String(row['메모2'] || '')
                });
                count++;
            });
            saveData(); showToast(`업로드 완료! 총 ${count}건 반영`, 'success'); event.target.value = '';
        } catch (err) { showToast("엑셀 파일 파싱 오류 발생", 'error'); }
    };
    reader.readAsArrayBuffer(file);
}

function exportToExcel() {
    if (appData.transactions.length === 0) { showToast("다운로드할 데이터가 없습니다."); return; }
    const exportData = appData.transactions.map(t => ({
        '사용일자': cleanDateStr(t.date),
        '유형': t.type === 'expense' ? '지출' : (t.type === 'budget_plan' ? '예산' : (t.type === 'income' ? '수입' : '이체')),
        '반복성': t.repeat || '변동', '계정항목': (t.category || '').trim(), '사용내역': t.usage || '',
        '예산금액': t.budgetAmount || 0, '확정금액': t.amount || 0,
        '출금계정': t.asset || '', '입금계정': t.targetAsset || '', '메모1': t.memo1 || '', '메모2': t.memo2 || ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: 0 });
        if (ws[cellRef]) { ws[cellRef].t = 's'; ws[cellRef].z = '@'; }
    }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "가계부통합");
    const d = new Date();
    XLSX.writeFile(wb, `가계부_백업_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.xlsx`);
}

function moveCategory(type, index, dir) {
    const list = appData.categories[type], newIdx = index + dir;
    if (newIdx < 0 || newIdx >= list.length) return;
    const temp = list[index]; list[index] = list[newIdx]; list[newIdx] = temp; saveData();
}
function editCategory(type, oldName) {
    showPrompt('변경할 이름을 입력하세요', oldName, (newName) => {
        if (!newName || !newName.trim() || newName === oldName) return;
        const idx = appData.categories[type].indexOf(oldName);
        if (idx !== -1) appData.categories[type][idx] = newName.trim(); saveData();
    });
}
function deleteCategory(type, name) {
    showConfirm(`'${name}' 항목을 삭제하시겠습니까?`, () => {
        appData.categories[type] = appData.categories[type].filter(i => i !== name); saveData();
    }, true);
}

function switchTab(name) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${name}`).classList.add('active');
    document.getElementById(`nav-${name}`).classList.add('active');
    if (name === 'stats') renderCharts();
}
function switchStatsMode(mode) {
    statsMode = mode;
    document.getElementById('btn-stats-income').className = mode === 'income' ? 'active' : '';
    document.getElementById('btn-stats-expense').className = mode === 'expense' ? 'active' : '';
    renderCharts();
}

function updateAccountOptions() {
    const type = document.getElementById('tx-type').value;
    const assetSelect = document.getElementById('tx-asset'), targetSelect = document.getElementById('tx-target-asset'), catSelect = document.getElementById('tx-category');
    assetSelect.innerHTML = appData.categories.assets.map(a => `<option value="${a}">${a}</option>`).join('');
    targetSelect.innerHTML = appData.categories.assets.map(a => `<option value="${a}">${a}</option>`).join('');

    document.getElementById('group-asset').style.display = type === 'income' ? 'none' : 'block';
    document.getElementById('group-category').style.display = type === 'transfer' ? 'none' : 'block';
    document.getElementById('group-target-asset').style.display = (type === 'income' || type === 'transfer') ? 'block' : 'none';
    document.getElementById('group-budget-amount').style.display = (type === 'income' || type === 'transfer') ? 'none' : 'block';
    document.getElementById('group-expense-amount').style.display = type === 'budget_plan' ? 'none' : 'block';

    if (type === 'income') catSelect.innerHTML = appData.categories.incomes.map(c => `<option value="${c}">${c}</option>`).join('');
    else if (type !== 'transfer') catSelect.innerHTML = appData.categories.expenses.map(c => `<option value="${c}">${c}</option>`).join('');
}

function saveTransaction() {
    const editId = document.getElementById('editing-tx-id').value;
    const date = cleanDateStr(document.getElementById('tx-date').value);
    const type = document.getElementById('tx-type').value;
    const txData = {
        id: editId ? String(editId) : ('tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
        date, type, repeat: document.getElementById('tx-repeat').value,
        category: (document.getElementById('tx-category').value || '').trim(), usage: document.getElementById('tx-usage').value.trim(),
        budgetAmount: type === 'income' || type === 'transfer' ? 0 : parseAmountInput('tx-budget-amount'),
        amount: type === 'budget_plan' ? 0 : parseAmountInput('tx-amount'),
        asset: type === 'income' ? '' : document.getElementById('tx-asset').value,
        targetAsset: type === 'expense' || type === 'budget_plan' ? '' : document.getElementById('tx-target-asset').value,
        memo1: document.getElementById('tx-memo1').value, memo2: document.getElementById('tx-memo2').value
    };

    if (editId) {
        const idx = appData.transactions.findIndex(t => String(t.id) === String(editId));
        if (idx !== -1) appData.transactions[idx] = txData; else appData.transactions.unshift(txData);
    } else { appData.transactions.unshift(txData); }
    closeInputModal(); saveData(); showToast('저장되었습니다.', 'success');
}

function editTransaction(id) {
    const tx = appData.transactions.find(t => String(t.id) === String(id));
    if (!tx) return;
    document.getElementById('editing-tx-id').value = String(tx.id);
    document.getElementById('tx-date').value = cleanDateStr(tx.date);
    document.getElementById('tx-type').value = tx.type; document.getElementById('tx-repeat').value = tx.repeat || '변동';
    updateAccountOptions();
    document.getElementById('tx-budget-amount').value = (tx.budgetAmount || 0).toLocaleString('ko-KR');
    document.getElementById('tx-amount').value = (tx.amount || 0).toLocaleString('ko-KR');
    if (tx.asset) document.getElementById('tx-asset').value = tx.asset;
    if (tx.targetAsset) document.getElementById('tx-target-asset').value = tx.targetAsset;
    if (tx.category) document.getElementById('tx-category').value = tx.category.trim();
    document.getElementById('tx-usage').value = tx.usage || '';
    document.getElementById('tx-memo1').value = tx.memo1 || ''; document.getElementById('tx-memo2').value = tx.memo2 || '';
    document.getElementById('form-title').innerText = '거래 & 예산 수정'; document.getElementById('btn-submit-tx').innerText = '수정 완료';
    openInputModal();
}

function copyTransaction(id) {
    const tx = appData.transactions.find(t => String(t.id) === String(id));
    if (!tx) return;
    document.getElementById('editing-tx-id').value = ''; document.getElementById('tx-date').value = new Date().toISOString().substring(0, 10);
    document.getElementById('tx-type').value = tx.type; document.getElementById('tx-repeat').value = tx.repeat || '변동';
    updateAccountOptions();
    document.getElementById('tx-budget-amount').value = (tx.budgetAmount || 0).toLocaleString('ko-KR');
    document.getElementById('tx-amount').value = (tx.amount || 0).toLocaleString('ko-KR');
    if (tx.asset) document.getElementById('tx-asset').value = tx.asset;
    if (tx.targetAsset) document.getElementById('tx-target-asset').value = tx.targetAsset;
    if (tx.category) document.getElementById('tx-category').value = tx.category.trim();
    document.getElementById('tx-usage').value = (tx.usage || '') + ' (복사)';
    document.getElementById('tx-memo1').value = tx.memo1 || ''; document.getElementById('tx-memo2').value = tx.memo2 || '';
    document.getElementById('form-title').innerText = '거래 내역 복사 등록'; document.getElementById('btn-submit-tx').innerText = '새로 저장하기';
    openInputModal();
}

function cancelEdit() {
    document.getElementById('editing-tx-id').value = ''; document.getElementById('tx-budget-amount').value = 0; document.getElementById('tx-amount').value = 0;
    document.getElementById('tx-usage').value = ''; document.getElementById('tx-memo1').value = ''; document.getElementById('tx-memo2').value = '';
    document.getElementById('form-title').innerText = '거래 & 예산 입력'; document.getElementById('btn-submit-tx').innerText = '저장하기';
}

function deleteTransaction(id) {
    showConfirm('삭제하시겠습니까?', () => { appData.transactions = appData.transactions.filter(t => String(t.id) !== String(id)); saveData(); showToast('삭제 완료', 'success'); }, true);
}

function addCategory(type, inputId) {
    const val = document.getElementById(inputId).value.trim();
    if (val && !appData.categories[type].includes(val)) { appData.categories[type].push(val); document.getElementById(inputId).value = ''; saveData(); }
}

function renderAssetSummary() {
    const curMStr = getFormattedSelectedMonth(); const maxDateStr = `${curMStr}-${String(selectedDay).padStart(2, '0')}`;
    const stats = {}; appData.categories.assets.forEach(a => stats[a] = { carried: 0, in: 0, out: 0, balance: 0 });

    appData.transactions.forEach(t => {
        const d = cleanDateStr(t.date); if (!d) return;
        const tM = d.substring(0, 7), isPast = tM < curMStr, isCur = tM === curMStr && d <= maxDateStr;
        if (t.type === 'income') {
            const acc = t.targetAsset || t.asset;
            if (stats[acc]) { if (isPast) stats[acc].carried += t.amount; if (isCur) stats[acc].in += t.amount; }
        } else if (t.type === 'expense' && stats[t.asset]) {
            if (isPast) stats[t.asset].carried -= t.amount; if (isCur) stats[t.asset].out += t.amount;
        } else if (t.type === 'transfer') {
            if (stats[t.asset]) { if (isPast) stats[t.asset].carried -= t.amount; if (isCur) stats[t.asset].out += t.amount; }
            if (stats[t.targetAsset]) { if (isPast) stats[t.targetAsset].carried += t.amount; if (isCur) stats[t.targetAsset].in += t.amount; }
        }
    });

    let tC = 0, tI = 0, tO = 0, tB = 0, rows = '';
    Object.entries(stats).forEach(([name, st]) => {
        st.balance = st.carried + st.in - st.out;
        if (!st.carried && !st.in && !st.out && !st.balance) return;
        tC += st.carried; tI += st.in; tO += st.out; tB += st.balance;
        rows += `<tr><td>${name}</td><td>${st.carried.toLocaleString()}</td><td style="color:var(--income);">${st.in.toLocaleString()}</td><td style="color:var(--expense);">${st.out.toLocaleString()}</td><td style="font-weight:bold;">${st.balance.toLocaleString()}</td></tr>`;
    });
    document.getElementById('asset-summary-tbody').innerHTML = rows + `<tr class="table-total-row"><td>합계</td><td>${tC.toLocaleString()}</td><td>${tI.toLocaleString()}</td><td>${tO.toLocaleString()}</td><td>${tB.toLocaleString()}</td></tr>`;
}

function renderCategoryBudgetMonitor() {
    const curMStr = getFormattedSelectedMonth(); const maxDateStr = `${curMStr}-${String(selectedDay).padStart(2, '0')}`;
    const txs = appData.transactions.filter(t => { const d = cleanDateStr(t.date); return d.startsWith(curMStr) && d <= maxDateStr; });
    const cBudget = {}, cSpent = {};
    txs.forEach(t => {
        const c = (t.category || '').trim();
        if (c) { if (t.budgetAmount > 0) cBudget[c] = (cBudget[c] || 0) + t.budgetAmount; if (t.type === 'expense') cSpent[c] = (cSpent[c] || 0) + t.amount; }
    });

    let totB = 0, totS = 0, rows = '';
    appData.categories.expenses.forEach(cat => {
        const b = cBudget[cat] || 0, s = cSpent[cat] || 0;
        if (!b && !s) return;
        const rate = b > 0 ? ((s / b) * 100).toFixed(1) : (s > 0 ? '100.0' : '0.0');
        totB += b; totS += s;
        rows += `<tr><td>${cat}</td><td>${b.toLocaleString()}</td><td style="color:var(--expense);">${s.toLocaleString()}</td><td style="font-weight:bold; color:${s>b&&b>0?'#EF4444':'#10B981'};">${rate}%</td></tr>`;
    });
    document.getElementById('category-budget-tbody').innerHTML = rows + `<tr class="table-total-row"><td>합계</td><td>${totB.toLocaleString()}</td><td>${totS.toLocaleString()}</td><td>${totB>0?((totS/totB)*100).toFixed(1):'0.0'}%</td></tr>`;
}

function renderCategoryManageLists() {
    ['assets', 'expenses', 'incomes'].forEach(key => {
        const id = key === 'assets' ? 'asset-manage-list' : (key === 'expenses' ? 'expense-manage-list' : 'income-manage-list');
        document.getElementById(id).innerHTML = appData.categories[key].map((item, idx) => `
            <li class="category-manage-item"><span><strong>${item}</strong></span>
            <div class="actions"><button class="btn-mini" onclick="moveCategory('${key}', ${idx}, -1)">▲</button><button class="btn-mini" onclick="moveCategory('${key}', ${idx}, 1)">▼</button><button class="btn-mini edit" onclick="editCategory('${key}', '${item}')">✏</button><button class="btn-mini danger" onclick="deleteCategory('${key}', '${item}')">✕</button></div></li>
        `).join('');
    });
}

// [핵심 최적화] 검색 Debounce 적용 
let searchDebounceTimer = null;
function onSearchInput() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => { renderAll(); }, 300); // 사용자가 입력을 멈추고 0.3초 뒤에 렌더링
}

function renderAll() {
    sanitizeTransactionIds();
    if (!selectedDay) initDefaultDayForCurrentMonth();
    updateMonthDisplay(); updateAccountOptions(); updateSyncBadge();
    renderAssetSummary(); renderCategoryBudgetMonitor(); renderCategoryManageLists();

    const curMStr = getFormattedSelectedMonth(); const maxDateStr = `${curMStr}-${String(selectedDay).padStart(2, '0')}`;
    let txs = appData.transactions.filter(t => { const d = cleanDateStr(t.date); return d.startsWith(curMStr) && d <= maxDateStr; });

    let totalExp = 0, totalBud = 0;
    txs.forEach(t => {
        if (t.type === 'expense') totalExp += t.amount;
        if (t.type === 'budget_plan' || t.budgetAmount > 0) totalBud += (t.budgetAmount || 0);
    });

    const ratio = totalBud > 0 ? Math.min((totalExp / totalBud) * 100, 100) : 0;
    document.getElementById('budget-bar').style.width = `${ratio}%`;
    document.getElementById('budget-bar').style.background = ratio >= 100 ? '#BD4332' : '#2F5D53';
    document.getElementById('budget-text').innerText = `${totalExp.toLocaleString()}원 / ${totalBud.toLocaleString()}원`;
    document.getElementById('in-budget-total').innerText = `${totalExp.toLocaleString()}원`;
    document.getElementById('no-budget-total').innerText = `${totalBud.toLocaleString()}원`;
    document.getElementById('budget-rate').innerText = `${totalBud > 0 ? ((totalExp/totalBud)*100).toFixed(1) : '0.0'}%`;

    const kw = document.getElementById('search-keyword').value.trim().toLowerCase();
    const fType = document.getElementById('filter-type').value, fRep = document.getElementById('filter-repeat').value;
    if (fType !== 'all') txs = txs.filter(t => t.type === fType);
    if (fRep !== 'all') txs = txs.filter(t => (t.repeat || '변동') === fRep);
    if (kw) txs = txs.filter(t => (t.usage + (t.category||'') + t.asset + t.memo1 + t.memo2).toLowerCase().includes(kw));

    let fSum = 0; txs.forEach(t => fSum += (t.type === 'budget_plan' ? t.budgetAmount : t.amount));
    document.getElementById('filtered-sum-amount').innerText = fSum.toLocaleString() + '원';

    document.getElementById('tx-list').innerHTML = txs.length === 0 ? '<div style="text-align:center; color:#9CA3AF; padding: 1.5rem 0; font-size:0.9rem;">내역이 없습니다.</div>' :
    txs.map(t => {
        const dateWDay = formatDateWithDay(t.date);
        const repeatTag = t.repeat === '고정' ? '<span class="tag fixed-tag">고정</span>' : '';
        const usage = t.usage || (t.type === 'transfer' ? '이체' : (t.category || ''));
        let sub = '', amt = t.amount.toLocaleString();

        if (t.type === 'expense') sub = `${dateWDay} · ${repeatTag} <span class="tag">${t.asset}</span> <span class="tag">${t.category}</span>` + (t.budgetAmount > 0 ? ` <span class="tag budget-ok">예산:${t.budgetAmount.toLocaleString()}</span>` : '');
        else if (t.type === 'budget_plan') { amt = t.budgetAmount.toLocaleString(); sub = `${dateWDay} · ${repeatTag} <span class="tag" style="background:#E0E7FF; color:#3730A3;">예산</span> <span class="tag">${t.category}</span>`; }
        else if (t.type === 'income') sub = `${dateWDay} · ${repeatTag} <span class="tag">${t.targetAsset || '입금'}</span> <span class="tag">${t.category}</span>`;
        else if (t.type === 'transfer') sub = `${dateWDay} · ${repeatTag} <span class="tag">${t.asset} ➔ ${t.targetAsset}</span>`;

        return `
        <div class="list-item">
            <div><div style="font-weight:bold; font-size:0.95rem;">${usage}</div><div style="font-size:0.78rem; color:#6B7280; margin-top:2px;">${sub}</div></div>
            <div style="text-align:right;"><div class="amount ${t.type}" style="font-size:0.95rem;">${amt}</div>
                <div style="margin-top:3px; display:flex; gap:2px; justify-content:flex-end;"><button class="btn-action-text copy" onclick="copyTransaction('${t.id}')">복사</button><button class="btn-action-text edit" onclick="editTransaction('${t.id}')">수정</button><button class="btn-action-text delete" onclick="deleteTransaction('${t.id}')">삭제</button></div>
            </div>
        </div>`;
    }).join('');
}

// [핵심] Chart.js 적용 부분 
let categoryChartInstance = null;
let monthlyChartInstance = null;

function renderCharts() {
    renderCategoryChart();
    renderMonthlyChart();
}

function renderCategoryChart() {
    const curMStr = getFormattedSelectedMonth();
    const maxDateStr = `${curMStr}-${String(selectedDay).padStart(2, '0')}`;
    const txs = appData.transactions.filter(t => t.type === statsMode && cleanDateStr(t.date).startsWith(curMStr) && cleanDateStr(t.date) <= maxDateStr);
    const totals = {}; let totalAmt = 0;
    txs.forEach(t => { const c = (t.category || '기타').trim(); if (t.amount > 0) { totals[c] = (totals[c] || 0) + t.amount; totalAmt += t.amount; } });

    document.getElementById('chart-cat-title').innerText = statsMode === 'expense' ? '이달의 지출 구성비' : '이달의 수입 구성비';
    document.getElementById('stats-total-amount').innerText = totalAmt.toLocaleString() + '원';
    const legend = document.getElementById('category-legend');
    
    if (totalAmt === 0) { 
        legend.innerHTML = `<div style="text-align:center; color:var(--text-soft); padding:1rem 0;">내역이 없습니다.</div>`; 
        if (categoryChartInstance) { categoryChartInstance.destroy(); categoryChartInstance = null; }
        return; 
    }

    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);
    const bgColors = entries.map((_, idx) => CHART_COLORS[idx % CHART_COLORS.length]);

    const ctx = document.getElementById('categoryChart').getContext('2d');
    if (categoryChartInstance) categoryChartInstance.destroy();

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: bgColors, borderWidth: 0, hoverOffset: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function(context) { return ` ${context.label}: ${context.parsed.toLocaleString()}원`; } } }
            }
        }
    });

    let html = '';
    entries.forEach(([cat, amt], idx) => {
        const color = bgColors[idx], pct = amt / totalAmt;
        html += `<div class="legend-item"><div><span class="legend-color" style="background:${color};"></span>${cat}</div><strong>${amt.toLocaleString()}원 (${(pct*100).toFixed(1)}%)</strong></div>`;
    });
    legend.innerHTML = `<div style="font-size:0.85rem; font-weight:bold; color:var(--text-soft); margin-bottom:6px;">총합계: ${totalAmt.toLocaleString()}원</div>` + html;
}

function renderMonthlyChart() {
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(selectedYear, selectedMonth - 1 - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const mTotals = months.map(m => appData.transactions.filter(t => t.type === statsMode && cleanDateStr(t.date).startsWith(m)).reduce((s, t) => s + t.amount, 0));
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    
    if (monthlyChartInstance) monthlyChartInstance.destroy();

    const activeCol = cssVar(statsMode === 'expense' ? '--expense' : '--income');
    const backgroundColors = months.map(m => m === getFormattedSelectedMonth() ? activeCol : cssVar('--line'));

    monthlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: months.map(m => m.substring(5) + '월'), datasets: [{ data: mTotals, backgroundColor: backgroundColors, borderRadius: 6 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { display: false }, x: { grid: { display: false }, ticks: { color: cssVar('--text-soft') } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return `${context.parsed.y.toLocaleString()}원`; } } } }
        }
    });
}

applyTheme(localStorage.getItem('theme_mode') || 'auto');