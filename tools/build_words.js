/*
 * libhangul의 hanja.txt(한글:한자:뜻)에서 단어 예외 사전(data/words.lib.json)을 만든다.
 *
 * 사용법:  node tools/build_words.js <hanja.txt> [출력 경로]
 *
 * 한자만으로 된 2~8자 단어 가운데, 글자별로 읽은 결과(두음법칙 포함)와 다른 것만 남긴다.
 * 독음이 둘 이상인 단어는 글자별 결과와 같은 쪽이 있으면 제외하고(모호함), 그렇지 않고
 * 후보가 하나뿐일 때만 넣는다. 손으로 고친 data/words.json 이 항상 우선한다.
 *
 * 원본: https://github.com/libhangul/libhangul/blob/main/data/hanja/hanja.txt  (BSD 3-clause,
 * 저작권 고지는 data/words.lib.LICENSE.txt)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { tokenizeHanja, textOf, applyDueum } = require('../js/convert.js');

const src = process.argv[2];
if (!src) { console.error('사용법: node tools/build_words.js <hanja.txt> [출력 경로]'); process.exit(1); }
const out = process.argv[3] || path.join(__dirname, '..', 'data', 'words.lib.json');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hanja.json'), 'utf8'));

const HAN = /^\p{Script=Han}+$/u, HANGUL = /^[가-힣]+$/;
const cands = new Map();                  // 한자 단어 -> 독음 집합
for (const line of fs.readFileSync(src, 'utf8').split(/\r?\n/)) {
    if (!line || line[0] === '#') continue;
    const [hg, hj] = line.split(':');
    if (!hj || !HAN.test(hj) || !HANGUL.test(hg)) continue;
    const n = Array.from(hj).length;
    if (n < 2 || n > 8 || Array.from(hg).length !== n) continue;
    if (!cands.has(hj)) cands.set(hj, new Set());
    cands.get(hj).add(hg);
}

const words = {};
let ambiguous = 0, noDueum = 0;
for (const [hj, set] of cands) {
    const charwise = textOf(tokenizeHanja(hj, data, {}));
    const diff = [...set].filter(r => r !== charwise);
    if (diff.length !== 1 || set.size > diff.length) { if (set.size > 1) ambiguous++; continue; }
    // 입력기용 사전이라 零資 령자, 肋線 륵선처럼 첫머리에 두음법칙을 쓰지 않은 항목이 섞여 있다
    if (applyDueum(diff[0][0]) !== diff[0][0]) { noDueum++; continue; }
    words[hj] = diff[0];
}

// 보호용 단어: 예외 단어를 부분으로 품고 있어서, 글자별 결과와 같아도 넣어 두면 부분 일치
// (開放率 속의 放率 방솔)를 막아 주는 단어. (두음법칙 경계를 알려 주는 용도로 ㄴ·ㄹ 계열 낱말을 넣어 보았으나
// 學年末 → 年末처럼 엉뚱한 경계를 만들어 이득이 거의 없어 뺐다.)
const exceptions = { ...words };
let anchorB = 0;
for (const [hj, set] of cands) {
    if (hj in words || set.size !== 1) continue;
    const hg = [...set][0];
    if (applyDueum(hg[0]) !== hg[0]) continue;
    const han = Array.from(hj), syl = Array.from(hg);
    let guard = false;
    for (let a = 0; a < han.length && !guard; a++) {
        for (let b = a + 2; b <= han.length && !guard; b++) {
            if (b - a === han.length) continue;
            const e = exceptions[han.slice(a, b).join('')];
            if (e && e !== syl.slice(a, b).join('')) guard = true;
        }
    }
    if (guard) { words[hj] = hg; anchorB++; }
}
const sorted = Object.fromEntries(Object.entries(words).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
fs.writeFileSync(out, JSON.stringify(sorted), 'utf8');
console.log(`보호용 단어(예외 부분일치 방지) ${anchorB}개`);
console.log(`후보 ${cands.size}개 → 사전 ${Object.keys(sorted).length}개 (모호해서 제외 ${ambiguous}, 두음법칙 미적용 제외 ${noDueum}) -> ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
