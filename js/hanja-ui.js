/* 한자 변환 탭 UI */
(function () {
    'use strict';
    const HT = window.HT;
    const C = HT.convert;

    const SAMPLE = '大韓民國의 首都는 서울이며, 音樂과 文學의 比率이 높다. 不動産 市場의 女子 老人 問題를 說明한다.';
    const EMPTY_HTML = '<span class="text-slate-400">텍스트를 입력하시면 변환 결과가 실시간으로 나타납니다.</span>';

    const $ = id => document.getElementById(id);
    const toggleBtn = $('toggleBtn'), modeStatus = $('modeStatus'), inputLabel = $('inputLabel');
    const inputText = $('inputText'), outputArea = $('outputArea'), outputLabel = $('outputLabel');
    const clearBtn = $('clearBtn'), sampleBtn = $('sampleBtn'), copyBtn = $('copyBtn'), downloadBtn = $('downloadBtn');
    const dropZone = $('dropZone'), fileInput = $('fileInput'), fileInfo = $('fileInfo'), fileNameDisplay = $('fileNameDisplay');
    const help = $('hanjaHelp'), tipBox = $('tipBox'), convertNote = $('convertNote');

    const TEXT = {
        'han2hg': {
            status: '한자 ➔ 한글', input: '원본 한자 입력', output: '실시간 변환 및 독음 선택 결과',
            placeholder: '여기에 한자가 섞인 텍스트를 입력하거나 문서를 업로드 하세요...',
            help: '다음자(두 가지 이상의 음을 가진 한자)는 노란 선택 상자로 표시되며, 눌러서 알맞은 음을 고를 수 있습니다.',
            tip: '<strong>💡 변환 규칙:</strong> 단어 첫머리의 두음법칙(女子 → 여자), 모음·ㄴ 받침 뒤의 렬·률(比率 → 비율), 不 + ㄷ·ㅈ(不動 → 부동)을 자동으로 적용합니다. 音樂·十月처럼 글자별로 읽으면 틀리는 단어는 내장 단어 사전으로 처리합니다. 사전에 없는 한자는 <span class="unk-han">붉은 물결 밑줄</span>로 표시하고 그대로 둡니다.',
        },
        'hg2han': {
            status: '한글 ➔ 한자', input: '원본 한글 입력', output: '실시간 변환 및 한자 선택 결과',
            placeholder: '여기에 한글 텍스트를 입력하거나 문서를 업로드 하세요...',
            help: '한자가 있는 글자는 가장 흔한 한자로 바뀌며, 눌러서 다른 한자를 고르거나 한글로 되돌릴 수 있습니다.',
            tip: '<strong>💡 한자 고르기:</strong> 한글만으로는 뜻을 알 수 없어서 후보 가운데 가장 흔한 한자를 먼저 보여 줍니다. 파란 점선이 있는 글자를 눌러 문맥에 맞는 한자를 직접 고르세요. 변환하고 싶지 않은 글자는 팝업 아래의 「한글로 되돌리기」를 누르세요.',
        },
    };

    let mode = 'han2hg';
    let tokens = [];
    let data = null, words = null;
    let currentFileName = '';
    let timer = 0;

    // ---------- 모드 / 문구 ----------
    function applyModeText() {
        const t = TEXT[mode];
        modeStatus.textContent = t.status;
        inputLabel.textContent = t.input;
        outputLabel.textContent = t.output;
        inputText.placeholder = t.placeholder;
        help.textContent = t.help;
        tipBox.innerHTML = t.tip;
    }

    toggleBtn.addEventListener('click', () => {
        mode = mode === 'han2hg' ? 'hg2han' : 'han2hg';
        applyModeText();
        closePopover();
        process();
    });

    // ---------- 변환 ----------
    function process() {
        clearTimeout(timer);
        convertNote.textContent = '';
        const text = inputText.value;
        if (!data) return;
        if (!text) {
            tokens = [];
            outputArea.innerHTML = EMPTY_HTML;
            copyBtn.disabled = downloadBtn.disabled = true;
            return;
        }
        tokens = mode === 'han2hg'
            ? C.tokenizeHanja(text, data, words)
            : C.tokenizeHangul(text, data);
        render();
        copyBtn.disabled = downloadBtn.disabled = false;
        if (mode === 'han2hg') {
            const unk = tokens.filter(t => t.k === 'unk').length;
            if (unk) convertNote.textContent = `사전에 없어 변환하지 못한 한자 ${unk}개`;
        }
    }

    function render() {
        const frag = document.createDocumentFragment();
        tokens.forEach((t, i) => {
            if (t.k === 'plain') {
                frag.appendChild(document.createTextNode(t.text));
            } else if (t.k === 'unk') {
                const s = document.createElement('span');
                s.className = 'unk-han';
                s.title = '사전에 없는 한자';
                s.textContent = t.origin;
                frag.appendChild(s);
            } else if (t.k === 'hg') {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'hg-btn';
                b.dataset.i = i;
                b.textContent = t.sel >= 0 ? t.cands[t.sel] : t.origin;
                frag.appendChild(b);
            } else if (t.select) {
                frag.appendChild(polySelect(t, i));
            } else {
                frag.appendChild(document.createTextNode(t.out));
            }
        });
        outputArea.replaceChildren(frag);
    }

    function polySelect(t, i) {
        const sel = document.createElement('select');
        sel.className = 'poly-select';
        sel.title = `원문 한자: ${t.origin}`;
        sel.dataset.i = i;
        t.labels.forEach((label, idx) => {
            const o = document.createElement('option');
            o.value = idx;
            o.textContent = label;
            sel.appendChild(o);
        });
        // 不처럼 뒤 글자 때문에 음이 바뀐 경우에는 최종 음과 같은 항목을 선택 상태로 보여 준다
        const shown = t.labels.indexOf(t.out);
        sel.value = shown >= 0 ? shown : t.sel;
        return sel;
    }

    outputArea.addEventListener('change', e => {
        const sel = e.target.closest('.poly-select');
        if (!sel) return;
        const t = tokens[+sel.dataset.i];
        t.sel = +sel.value;
        t.userSel = true;
        C.resolve(tokens);
        render();
    });

    // ---------- 한글 → 한자 후보 팝업 ----------
    let pop = null, popFor = null;

    function closePopover() {
        if (pop) { pop.remove(); pop = null; popFor = null; }
    }

    outputArea.addEventListener('click', e => {
        const btn = e.target.closest('.hg-btn');
        if (!btn) return;
        e.stopPropagation();
        if (popFor === btn) { closePopover(); return; }
        openPopover(btn);
    });
    document.addEventListener('click', e => { if (pop && !pop.contains(e.target)) closePopover(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopover(); });
    outputArea.addEventListener('scroll', closePopover);

    function openPopover(btn) {
        closePopover();
        const t = tokens[+btn.dataset.i];
        pop = document.createElement('div');
        pop.className = 'hg-pop';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', `${t.origin}의 한자 후보`);

        const grid = document.createElement('div');
        grid.className = 'hg-grid';
        t.cands.forEach((c, idx) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'hg-cand';
            b.textContent = c;
            if (idx === t.sel) b.setAttribute('aria-current', 'true');
            b.addEventListener('click', () => { t.sel = idx; btn.textContent = c; closePopover(); });
            grid.appendChild(b);
        });
        const revert = document.createElement('button');
        revert.type = 'button';
        revert.className = 'hg-revert';
        revert.textContent = `「${t.origin}」 한글로 되돌리기`;
        revert.addEventListener('click', () => { t.sel = -1; btn.textContent = t.origin; closePopover(); });

        pop.append(grid, revert);
        document.body.appendChild(pop);
        popFor = btn;

        const r = btn.getBoundingClientRect();
        const w = pop.offsetWidth;
        pop.style.left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - w - 8)) + 'px';
        pop.style.top = (window.scrollY + r.bottom + 6) + 'px';
    }

    // ---------- 입력 / 복사 / 다운로드 ----------
    inputText.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(process, 120); });

    sampleBtn.addEventListener('click', () => {
        if (mode !== 'han2hg') { mode = 'han2hg'; applyModeText(); }
        inputText.value = SAMPLE;
        process();
    });

    clearBtn.addEventListener('click', () => {
        inputText.value = '';
        currentFileName = '';
        fileInfo.hidden = true;
        closePopover();
        process();
    });

    copyBtn.addEventListener('click', async () => {
        const text = C.textOf(tokens);
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            HT.toast('클립보드에 복사했습니다.');
        } catch (err) {
            HT.toast('클립보드 복사에 실패했습니다.');
        }
    });

    downloadBtn.addEventListener('click', () => {
        const text = C.textOf(tokens);
        if (!text) return;
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentFileName.replace(/\.[^.]+$/, '') || 'document'}_변환.txt`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // ---------- 파일 ----------
    async function loadFile(file) {
        if (!file) return;
        try {
            const text = await HT.readTextFile(file);
            currentFileName = file.name;
            fileNameDisplay.textContent = file.name;
            fileInfo.hidden = false;
            inputText.value = text;
            process();
        } catch (error) {
            HT.toast(`파일 읽기 실패: ${error.message}`);
        }
    }

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', e => { loadFile(e.target.files[0]); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('border-blue-400', 'bg-slate-50'); }));
    ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('border-blue-400', 'bg-slate-50'); }));
    dropZone.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));

    // ---------- 시작 ----------
    applyModeText();
    outputArea.innerHTML = '<span class="text-slate-400">사전을 불러오는 중…</span>';

    Promise.all([fetch('data/hanja.json'), fetch('data/words.json')])
        .then(rs => Promise.all(rs.map(r => { if (!r.ok) throw new Error(r.status); return r.json(); })))
        .then(([d, w]) => {
            data = d; words = w;
            if (location.search.includes('sample')) inputText.value = SAMPLE;
            process();
            if (!inputText.value) outputArea.innerHTML = EMPTY_HTML;
        })
        .catch(() => {
            outputArea.innerHTML = '<span class="text-rose-600">사전을 불러오지 못했습니다. 페이지를 새로고침 하거나, 파일을 직접 열었다면 웹 서버(예: GitHub Pages)로 접속해 주세요.</span>';
        });
})();
