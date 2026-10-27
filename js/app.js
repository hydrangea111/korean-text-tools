/* 공통: 탭 전환, 알림, 파일 읽기 */
(function () {
    'use strict';
    const HT = (window.HT = window.HT || {});

    // ---- 알림 ----
    const toastEl = document.getElementById('toast');
    let toastTimer = 0;
    HT.toast = function (msg) {
        toastEl.textContent = msg;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
    };

    // ---- 파일 읽기 (.txt는 UTF-8 → 실패 시 EUC-KR, .docx는 mammoth) ----
    HT.readTextFile = async function (file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const buffer = await file.arrayBuffer();
        if (ext === 'txt') {
            try {
                return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
            } catch (e) {
                return new TextDecoder('euc-kr').decode(buffer);
            }
        }
        if (ext === 'docx') {
            const result = await mammoth.extractRawText({ arrayBuffer: buffer });
            return result.value;
        }
        throw new Error('지원하지 않는 포맷입니다. TXT 혹은 DOCX 파일만 제공해 주세요.');
    };

    // ---- 탭 ----
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const panels = { hanja: document.getElementById('panel-hanja'), count: document.getElementById('panel-count') };

    function select(name, focus) {
        if (!panels[name]) name = 'count';
        tabs.forEach(t => {
            const on = t.dataset.tab === name;
            t.setAttribute('aria-selected', String(on));
            t.tabIndex = on ? 0 : -1;
            if (on && focus) t.focus();
        });
        Object.entries(panels).forEach(([k, el]) => { el.hidden = k !== name; });
        try { history.replaceState(null, '', name === 'count' ? location.pathname + location.search : '#' + name); } catch (e) { /* file:// 등 */ }
    }

    tabs.forEach((t, i) => {
        t.addEventListener('click', () => select(t.dataset.tab));
        t.addEventListener('keydown', e => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            select(next.dataset.tab, true);
        });
    });

    select(location.hash.replace('#', '') || (location.search.includes('sample') ? 'hanja' : ''));
    window.addEventListener('hashchange', () => select(location.hash.replace('#', '')));

    if (window.lucide) lucide.createIcons();
})();
