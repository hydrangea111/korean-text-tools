/* 한자 ↔ 한글 변환 로직 (DOM 없음: 브라우저와 Node 양쪽에서 동작) */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else (root.HT = root.HT || {}).convert = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const HAN = /\p{Script=Han}/u;
    const SYLLABLE = /[가-힣]/;
    const S_BASE = 0xAC00, V_COUNT = 21, T_COUNT = 28;
    const L_NIEUN = 2, L_DIGEUT = 3, L_RIEUL = 5, L_IEUNG = 11, L_JIEUT = 12;
    const T_NONE = 0, T_NIEUN = 4;
    const V_Y = new Set([2, 3, 6, 7, 12, 17, 20]);      // ㅑ ㅒ ㅕ ㅖ ㅛ ㅠ ㅣ
    const MAX_WORD = 6;
    const MAX_CANDIDATES = 60;

    // 사전의 대표음이 일반적인 기본 독음과 다른 글자
    const DEFAULT_READING = { '樂': '악', '車': '차', '塞': '색', '咽': '인' };

    function decompose(syl) {
        const c = syl.charCodeAt(0) - S_BASE;
        return { l: Math.floor(c / (V_COUNT * T_COUNT)), v: Math.floor((c % (V_COUNT * T_COUNT)) / T_COUNT), t: c % T_COUNT };
    }
    function compose(l, v, t) {
        return String.fromCharCode(S_BASE + (l * V_COUNT + v) * T_COUNT + t);
    }

    /** 두음법칙: 단어 첫머리의 녀·려·리·라·로 … → 여·여·이·나·노 … */
    function applyDueum(syl) {
        if (!SYLLABLE.test(syl)) return syl;
        const { l, v, t } = decompose(syl);
        if (l !== L_NIEUN && l !== L_RIEUL) return syl;
        if (V_Y.has(v)) return compose(L_IEUNG, v, t);
        if (l === L_RIEUL) return compose(L_NIEUN, v, t);
        return syl;
    }

    /** 모음이나 ㄴ 받침 뒤의 렬·률 → 열·율 (비율, 나열이 아니라 선열, 규율) */
    function applyAfterVowelRule(syl, prevOut) {
        if (syl !== '렬' && syl !== '률') return syl;
        if (!prevOut || !SYLLABLE.test(prevOut.slice(-1))) return syl;
        const t = decompose(prevOut.slice(-1)).t;
        if (t !== T_NONE && t !== T_NIEUN) return syl;
        const { v, t: jong } = decompose(syl);
        return compose(L_IEUNG, v, jong);
    }

    function lookup(chars, ch) {
        return chars[ch] || chars[ch.normalize('NFC')] || null;
    }

    function readingsOf(chars, ch) {
        const raw = lookup(chars, ch);
        if (!raw) return null;
        const list = raw.split(',');
        const def = DEFAULT_READING[ch];
        if (def && list.includes(def)) return [def, ...list.filter(r => r !== def)];
        return list;
    }

    /**
     * 한자 → 한글 토큰화.
     *  plain: 그대로 둘 글자 / han: 변환 대상(한자 한 글자 또는 사전 단어) / unk: 사전에 없는 한자
     */
    function tokenizeHanja(text, data, words) {
        const chars = Array.from(text);
        const tokens = [];
        let plain = '';
        let i = 0;
        let runStart = true;
        const via = data.via || {};

        const flush = () => { if (plain) { tokens.push({ k: 'plain', text: plain }); plain = ''; } };

        while (i < chars.length) {
            const ch = chars[i];
            if (!HAN.test(ch)) { plain += ch; i++; runStart = true; continue; }
            flush();

            let runEnd = i;
            while (runEnd < chars.length && HAN.test(chars[runEnd])) runEnd++;

            // 간체·신자체·이체자는 정자로 바꿔서 단어 사전과 맞춰 본다 (音乐 → 音樂)
            const key = chars.slice(i, runEnd).map(c => via[c] || c);
            let matched = 0, hit = '';
            for (let len = Math.min(MAX_WORD, runEnd - i); len >= 2; len--) {
                const w = key.slice(0, len).join('');
                if (words[w]) { matched = len; hit = w; break; }
            }
            if (matched) {
                tokens.push({ k: 'han', origin: chars.slice(i, i + matched).join(''), word: words[hit], runStart });
                i += matched;
            } else {
                const readings = readingsOf(data.chars, ch);
                if (!readings) {
                    tokens.push({ k: 'unk', origin: ch, runStart });
                } else {
                    tokens.push({
                        k: 'han', origin: ch, readings, variantOf: via[ch], sel: 0, userSel: false, runStart,
                        select: readings.length > 1,   // 다음자는 독음을 고를 수 있다
                    });
                }
                i++;
            }
            runStart = false;
        }
        flush();
        resolve(tokens);
        return tokens;
    }

    /** 토큰마다 최종 출력(out)을 계산한다. 독음을 바꾼 뒤에도 다시 호출한다. */
    function resolve(tokens) {
        let prev = null;
        for (const t of tokens) {
            if (t.k === 'plain') { prev = null; continue; }
            if (t.k === 'unk') { t.out = t.origin; prev = null; continue; }
            if (t.word) {
                t.out = t.word;
            } else {
                // 선택 상자에 보일 이름도 같은 규칙을 적용한다 (률 → 율)
                t.labels = t.readings.map(r => (t.runStart ? applyDueum(r) : applyAfterVowelRule(r, prev)));
                t.out = t.labels[t.sel];
            }
            prev = t.out;
        }
        // 不: 뒤 글자가 ㄷ·ㅈ으로 시작하면 부 (부동, 부정), 그 밖에는 불
        for (let i = 0; i < tokens.length - 1; i++) {
            const t = tokens[i], n = tokens[i + 1];
            if (t.origin !== '不' || t.word || t.userSel || n.k !== 'han' || n.runStart) continue;
            if (!SYLLABLE.test(n.out[0])) continue;
            const l = decompose(n.out[0]).l;
            if (l === L_DIGEUT || l === L_JIEUT) t.out = '부';
        }
        return tokens;
    }

    /** 한글 → 한자 토큰화. 한자 후보가 있는 음절마다 가장 흔한 한자를 기본값으로 둔다. */
    function tokenizeHangul(text, data) {
        const tokens = [];
        let plain = '';
        for (const ch of text) {
            const cands = SYLLABLE.test(ch) ? data.reverse[ch] : null;
            if (cands) {
                if (plain) { tokens.push({ k: 'plain', text: plain }); plain = ''; }
                tokens.push({ k: 'hg', origin: ch, cands: Array.from(cands).slice(0, MAX_CANDIDATES), sel: 0 });
            } else {
                plain += ch;
            }
        }
        if (plain) tokens.push({ k: 'plain', text: plain });
        return tokens;
    }

    function textOf(tokens) {
        return tokens.map(t => {
            if (t.k === 'plain') return t.text;
            if (t.k === 'hg') return t.sel >= 0 ? t.cands[t.sel] : t.origin;
            return t.out;
        }).join('');
    }

    return { tokenizeHanja, tokenizeHangul, resolve, textOf, applyDueum, applyAfterVowelRule };
});
