/* 글자수 · 바이트 탭 UI */
(function () {
    'use strict';
    const HT = window.HT;
    const $ = id => document.getElementById(id);

    const input = $('countInput'), lbTwo = $('lbTwo');
    const limitBasis = $('limitBasis'), limitValue = $('limitValue'), limitText = $('limitText'), limitBar = $('limitBar');
    const fileInput = $('countFileInput');
    const out = {
        chars: $('statChars'), charsNoSpace: $('statCharsNoSpace'), lines: $('statLines'),
        neis: $('statNeis'), euckr: $('statEuckr'),
    };
    const fmt = n => n.toLocaleString('ko-KR');

    // 지난번에 입력하던 내용을 되살린다
    const saved = HT.store.get('count') || {};
    if (typeof saved.text === 'string') input.value = saved.text;
    if (typeof saved.limit === 'string') limitValue.value = saved.limit;
    if ([...limitBasis.options].some(o => o.value === saved.basis)) limitBasis.value = saved.basis;
    if (typeof saved.lbTwo === 'boolean') lbTwo.checked = saved.lbTwo;

    function update() {
        HT.store.set('count', { text: input.value, limit: limitValue.value, basis: limitBasis.value, lbTwo: lbTwo.checked });
        const s =HT.count.stats(input.value, lbTwo.checked ? 2 : 1);
        for (const k of Object.keys(out)) out[k].textContent = fmt(s[k]);

        const limit = parseInt(limitValue.value, 10);
        if (!(limit > 0)) {
            limitText.textContent = '';
            limitBar.style.width = '0%';
            limitBar.className = 'h-full bg-blue-500 transition-all';
            return;
        }
        const used = s[limitBasis.value];
        const left = limit - used;
        limitText.textContent = left >= 0 ? `${fmt(used)} / ${fmt(limit)} byte (${fmt(left)} 남음)` : `${fmt(used)} / ${fmt(limit)} byte (${fmt(-left)} 초과)`;
        limitBar.style.width = Math.min(100, (used / limit) * 100) + '%';
        limitBar.className = 'h-full transition-all ' + (left < 0 ? 'bg-rose-500' : used / limit >= 0.9 ? 'bg-amber-500' : 'bg-blue-500');
    }

    [input, limitValue].forEach(el => el.addEventListener('input', update));
    [lbTwo, limitBasis].forEach(el => el.addEventListener('change', update));

    $('countClearBtn').addEventListener('click', () => { input.value = ''; update(); input.focus(); });
    $('countFileBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async e => {
        const file = e.target.files[0];
        fileInput.value = '';
        if (!file) return;
        try {
            input.value = await HT.readTextFile(file);
            update();
        } catch (err) {
            HT.toast(`파일 읽기 실패: ${err.message}`);
        }
    });

    update();
})();
