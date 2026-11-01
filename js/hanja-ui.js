/* 한자 변환 탭 UI */
(function () {
    'use strict';
    const HT = window.HT;
    const C = HT.convert;

    // 대한민국 헌법 前文 (tests/cases.tsv 의 마지막 줄과 같은 글)
    const SAMPLE = '前文\n悠久한 歷史와 傳統에 빛나는 우리 大韓國民은 3·1運動으로 建立된 大韓民國臨時政府의 法統과 不義에 抗拒한 4·19民主理念을 繼承하고, 祖國의 民主改革과 平和的 統一의 使命에 立脚하여 正義·人道와 同胞愛로써 民族의 團結을 鞏固히 하고, 모든 社會的 弊習과 不義를 打破하며, 自律과 調和를 바탕으로 自由民主的 基本秩序를 더욱 確固히 하여 政治·經濟·社會·文化의 모든 領域에 있어서 各人의 機會를 均等히 하고, 能力을 最高度로 發揮하게 하며, 自由와 權利에 따르는 責任과 義務를 完遂하게 하여, 안으로는 國民生活의 均等한 向上을 基하고 밖으로는 恒久的인 世界平和와 人類共榮에 이바지함으로써 우리들과 우리들의 子孫의 安全과 自由와 幸福을 永遠히 確保할 것을 다짐하면서 1948年 7月 12日에 制定되고 8次에 걸쳐 改正된 憲法을 이제 國民投票에 의하여 改正한다.';
    const EMPTY_HTML = '<span class="text-slate-400">텍스트를 입력하시면 변환 결과가 실시간으로 나타납니다.</span>';

    const $ = id => document.getElementById(id);
    const toggleBtn = $('toggleBtn'), modeStatus = $('modeStatus'), inputLabel = $('inputLabel');
    const inputText = $('inputText'), outputArea = $('outputArea'), outputLabel = $('outputLabel');
    const clearBtn = $('clearBtn'), sampleBtn = $('sampleBtn'), copyBtn = $('copyBtn'), downloadBtn = $('downloadBtn');
    const dropZone = $('dropZone'), fileInput = $('fileInput'), fileInfo = $('fileInfo'), fileNameDisplay = $('fileNameDisplay');
    const help = $('hanjaHelp'), tipBox = $('tipBox'), convertNote = $('convertNote');
    const originalChk = $('originalChk'), originalWrap = $('originalWrap');

    const TEXT = {
        'han2hg': {
            status: '한자 ➔ 한글', input: '원본 한자 입력', output: '실시간 변환 및 독음 선택 결과',
            placeholder: '여기에 한자가 섞인 텍스트를 입력하거나 문서를 업로드 하세요...',
            help: '다음자(두 가지 이상의 음을 가진 한자)는 노란 선택 상자로 표시되며, 눌러서 알맞은 음을 고를 수 있습니다.',
            tip: '<strong>💡 변환 규칙:</strong> 단어 첫머리의 두음법칙(女子 → 여자), 모음·ㄴ 받침 뒤의 렬·률(比率 → 비율), 不 + ㄷ·ㅈ(不動 → 부동)을 자동으로 적용합니다. 音樂·十月처럼 글자별로 읽으면 틀리는 단어는 내장 단어 사전으로 처리합니다. 일본 신자체·중국 간체·이체자는 정자의 음으로 읽습니다(国→국, 发→발, 弁→변). 사전에 없는 한자는 <span class="unk-han">붉은 물결 밑줄</span>로 표시하고 그대로 둡니다.',
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

    // 지난번에 입력하던 내용을 되살린다 (?sample 로 열면 예시가 우선)
    const saved = HT.store.get('hanja') || {};
    if (saved.mode === 'hg2han') mode = 'hg2han';
    originalChk.checked = !!saved.original;
    if (typeof saved.text === 'string' && !location.search.includes('sample')) inputText.value = saved.text;

    // ---------- 모드 / 문구 ----------
    function applyModeText() {
        const t = TEXT[mode];
        modeStatus.textContent = t.status;
        inputLabel.textContent = t.input;
        outputLabel.textContent = t.output;
        inputText.placeholder = t.placeholder;
        help.textContent = t.help;
        tipBox.innerHTML = t.tip;
        originalWrap.style.display = mode === 'han2hg' ? '' : 'none';   // Tailwind의 flex가 hidden 속성을 이기므로 style로 숨긴다
    }

    originalChk.addEventListener('change', process);

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
        HT.store.set('hanja', { text, mode, original: originalChk.checked });
        if (!data) return;
        if (!text) {
            tokens = [];
            outputArea.innerHTML = EMPTY_HTML;
            copyBtn.disabled = downloadBtn.disabled = true;
            return;
        }
        tokens = mode === 'han2hg'
            ? C.tokenizeHanja(text, data, words, { original: originalChk.checked })
            : C.tokenizeHangul(text, data);
        render();
        copyBtn.disabled = downloadBtn.disabled = false;
        if (mode === 'han2hg') {
            const unk = tokens.filter(t => t.k === 'unk').length;
            const maybe = tokens.filter(t => t.uncertain).length;
            const notes = [];
            if (unk) notes.push(`사전에 없어 변환하지 못한 한자 ${unk}개`);
            if (maybe) notes.push(`띄어쓰기 없이 붙은 한자라 단어 경계가 불확실한 곳 ${maybe}개 (점선 밑줄) — 두음법칙이 틀릴 수 있으니 확인하세요`);
            convertNote.textContent = notes.join(' · ');
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
                const el = polySelect(t, i);
                if (t.uncertain) el.classList.add('maybe-han');
                frag.appendChild(el);
            } else if (t.uncertain) {
                const s = document.createElement('span');
                s.className = 'maybe-han';
                s.title = '단어 경계가 불확실합니다 (두음법칙 확인)';
                s.textContent = t.out;
                frag.appendChild(s);
            } else {
                frag.appendChild(document.createTextNode(t.out));
            }
        });
        outputArea.replaceChildren(frag);
    }

    function polySelect(t, i) {
        const sel = document.createElement('select');
        sel.className = 'poly-select';
        sel.title = t.variantOf ? `원문 한자: ${t.origin} (이체자 · ${t.variantOf}의 음)` : `원문 한자: ${t.origin}`;
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

    Promise.all([fetch('data/hanja.json'), fetch('data/words.lib.json'), fetch('data/words.json')])
        .then(rs => Promise.all(rs.map(r => { if (!r.ok) throw new Error(r.status); return r.json(); })))
        .then(([d, lib, manual]) => {
            data = d; words = Object.assign({}, lib, manual);     // 손으로 고친 단어가 우선
            if (location.search.includes('sample')) inputText.value = SAMPLE;
            process();
            if (!inputText.value) outputArea.innerHTML = EMPTY_HTML;
        })
        .catch(() => {
            outputArea.innerHTML = '<span class="text-rose-600">사전을 불러오지 못했습니다. 페이지를 새로고침 하거나, 파일을 직접 열었다면 웹 서버(예: GitHub Pages)로 접속해 주세요.</span>';
        });
})();
