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
    const MAX_WORD = 8;    const DIGIT = /[0-9０-９]/;
    const LONG_RUN = 5;                                // 이 길이 이상 붙은 한자는 단어 경계가 불확실하다
    const NO_DUEUM_BEFORE_HA = new Set(['來']);        // 來하도다 → 래하도다
    const MAX_CANDIDATES = 60;

    // 사전의 대표음이 일반적인 기본 독음과 다른 글자
    const DEFAULT_READING = { '樂': '악', '車': '차', '塞': '색', '咽': '인', '殺': '살', '欠': '흠' };

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
    function tokenizeHanja(text, data, words, opts) {
        const chars = Array.from(text);
        const tokens = [];
        let plain = '';
        let i = 0;
        let runStart = true;
        let runNo = 0, runEnd = 0;
        const via = data.via || {};
        const original = !!(opts && opts.original);

        // 사전 단어의 독음 (없으면 null). 간체·신자체·이체자는 정자로 바꿔서 찾는다 (音乐 → 音樂)
        function wordAt(han) {
            const w = words[han.map(c => via[c] || c).join('')];
            if (!w) return null;
            // 원문 표기에서는 두음법칙만 고치려고 넣은 단어(臨時 → 임시)를 쓰지 않는다
            return original && dueumOnly(han, w, data) ? null : w;
        }

        // 한자 덩어리 [from, runEnd)에서 단어로 덮이는 글자 수의 최댓값 (메모)
        const memo = new Map();
        function cover(from) {
            if (from >= runEnd - 1) return 0;
            if (memo.has(from)) return memo.get(from);
            let best = cover(from + 1);
            for (let len = Math.min(MAX_WORD, runEnd - from); len >= 2; len--) {
                if (wordAt(chars.slice(from, from + len))) best = Math.max(best, len + cover(from + len));
            }
            memo.set(from, best);
            return best;
        }
        // from 위치에서 쓸 단어 길이 (단어를 쓰지 않는 쪽이 더 낫거나 같으면 0). 동점이면 앞쪽 단어를 쓴다.
        function bestWord(from) {
            const skip = cover(from + 1);
            let pick = 0, val = skip;
            for (let len = Math.min(MAX_WORD, runEnd - from); len >= 2; len--) {
                if (!wordAt(chars.slice(from, from + len))) continue;
                const v = len + cover(from + len);
                if (v > val || (v === val && !pick && v > skip)) { pick = len; val = v; }
            }
            return pick;
        }

        const flush = () => { if (plain) { tokens.push({ k: 'plain', text: plain }); plain = ''; } };

        while (i < chars.length) {
            const ch = chars[i];
            // 숫자 바로 뒤의 한자(1948年)는 단어 첫머리가 아니므로 두음법칙을 적용하지 않는다
            if (!HAN.test(ch)) { plain += ch; i++; runStart = !DIGIT.test(ch); continue; }
            flush();

            if (i >= runEnd) {
                runNo++;
                memo.clear();
                for (runEnd = i; runEnd < chars.length && HAN.test(chars[runEnd]); runEnd++);
            }

            // 1) 한자 사이의 공백 한 칸을 건너뛰는 단어 (崔 麟 → 최 린). 붙은 한자 덩어리를 넘어서는 경우만 본다.
            let end = 0;
            const pos = [];
            for (let p = i; p < chars.length && pos.length < MAX_WORD; p++) {
                if (HAN.test(chars[p])) pos.push(p);
                else if (chars[p] === ' ' && p > i && HAN.test(chars[p - 1]) && p + 1 < chars.length && HAN.test(chars[p + 1])) continue;
                else break;
            }
            for (let len = pos.length; len >= 2 && pos[len - 1] >= runEnd; len--) {
                const hit = wordAt(pos.slice(0, len).map(p => chars[p]));
                if (hit) { end = pos[len - 1] + 1; tokens.push({ k: 'han', origin: chars.slice(i, end).join(''), word: spaced(chars.slice(i, end).join(''), hit), runStart, runNo }); break; }
            }
            // 2) 붙은 한자 덩어리 안에서는 단어로 덮이는 글자가 가장 많은 분할을 고른다 (동점이면 앞쪽·긴 단어)
            if (!end) {
                const len = bestWord(i);
                if (len) {
                    end = i + len;
                    tokens.push({ k: 'han', origin: chars.slice(i, end).join(''), word: wordAt(chars.slice(i, end)), runStart, runNo });
                }
            }
            if (end) {
                i = end;
            } else {
                const readings = readingsOf(data.chars, ch);
                if (!readings) {
                    tokens.push({ k: 'unk', origin: ch, runStart, runNo });
                } else {
                    // 單獨 한자 + 하 (來하도다): 동사 어간이므로 두음법칙을 적용하지 않는다
                    const solo = chars[i + 1] === '하' && !HAN.test(chars[i - 1] || '') && NO_DUEUM_BEFORE_HA.has(ch);
                    tokens.push({
                        k: 'han', origin: ch, readings, variantOf: via[ch], sel: 0, userSel: false,
                        runStart: runStart && !solo, runNo,
                        select: readings.length > 1,   // 다음자는 독음을 고를 수 있다
                    });
                }
                i++;
            }
            runStart = false;
        }
        flush();
        tokens.opts = opts || {};
        markUncertain(tokens);
        resolve(tokens);
        return tokens;
    }

    /**
     * 사전 단어가 글자별 기본 독음과 두음법칙(첫머리 녀→여, 모음 뒤 렬→열)으로만 달라지는가.
     * 원문 표기에서는 이런 단어를 쓰지 않고 글자별 독음(림시, 력사)을 그대로 둔다.
     */
    function dueumOnly(han, word, data) {
        const rs = han.map(c => (readingsOf(data.chars, c) || [])[0]);
        const syl = Array.from(word);
        if (!rs.every(Boolean) || syl.length !== rs.length) return false;
        return rs.every((r, i) => syl[i] === r || syl[i] === applyDueum(r) || syl[i] === applyAfterVowelRule(r, '아'));
    }

    /** 단어 사전의 독음에 원문의 공백 위치를 그대로 옮긴다 (崔 麟 → 최 린). 글자 수가 다르면 공백을 버린다. */
    function spaced(origin, word) {
        const han = Array.from(origin).filter(c => c !== ' ').length;
        if (han === origin.length || Array.from(word).length !== han) return word;
        const syl = Array.from(word);
        return Array.from(origin).map(c => (c === ' ' ? ' ' : syl.shift())).join('');
    }

    /**
     * 띄어쓰기 없이 길게 붙은 한자(5자 이상) 안에서 두음법칙에 걸리는 글자는 단어 경계를 알 수 없어
     * 결과가 틀릴 수 있다. 또 낱글자 뒤에 공백으로 이어진 외자(崔 麟)도 이름일 수 있다.
     */
    function markUncertain(tokens) {
        const size = {};
        for (const t of tokens) if (t.runNo) size[t.runNo] = (size[t.runNo] || 0) + Array.from(t.origin).length;
        tokens.forEach((t, i) => {
            if (t.k !== 'han' || t.word || tokens.opts.original) return;
            const r = t.readings[0];
            if (applyDueum(r) === r) return;                  // 두음법칙과 무관한 글자
            if (!t.runStart && size[t.runNo] >= LONG_RUN) t.uncertain = true;
            const p = tokens[i - 1], q = tokens[i - 2];
            if (t.runStart && p && p.k === 'plain' && p.text === ' ' && q && q.k === 'han' && !q.word && q.runStart) t.uncertain = true;
        });
    }

    /** 토큰마다 최종 출력(out)을 계산한다. 독음을 바꾼 뒤에도 다시 호출한다. */
    function resolve(tokens, opts) {
        const original = ((opts || tokens.opts) || {}).original;     // 원문 표기: 두음법칙·율/열 규칙 없음
        let prev = null;
        for (const t of tokens) {
            if (t.k === 'plain') { prev = null; continue; }
            if (t.k === 'unk') { t.out = t.origin; prev = null; continue; }
            if (t.word) {
                t.out = t.word;
            } else {
                // 선택 상자에 보일 이름도 같은 규칙을 적용한다 (률 → 율)
                t.labels = original ? t.readings.slice()
                    : t.readings.map(r => (t.runStart ? applyDueum(r) : applyAfterVowelRule(r, prev)));
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

    return { tokenizeHanja, tokenizeHangul, resolve, markUncertain, textOf, applyDueum, applyAfterVowelRule };
});
