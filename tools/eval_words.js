/*
 * 단어 사전 정확도 점검: hanja.txt 의 단일 독음 단어를 변환기에 넣어 사전의 독음과 비교한다.
 * (사전을 만든 원본으로 재는 것이므로 예외 단어는 당연히 맞는다. 보는 것은 글자별 변환 대비 개선과,
 *  사전을 적용한 뒤에도 남는 오답이다. 남는 오답은 대부분 긴 복합어 속의 두음법칙이다.)
 *
 * 사용법:  node tools/eval_words.js <hanja.txt> [보여 줄 오답 수]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { tokenizeHanja, textOf, applyDueum } = require('../js/convert.js');

const src = process.argv[2];
const show = +process.argv[3] || 20;
if (!src) { console.error('사용법: node tools/eval_words.js <hanja.txt> [오답 수]'); process.exit(1); }
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const data = read('hanja.json');
const words = Object.assign({}, read('words.lib.json'), read('words.json'));

const HAN = /^\p{Script=Han}+$/u, HANGUL = /^[가-힣]+$/;
const cands = new Map();
for (const line of fs.readFileSync(src, 'utf8').split(/\r?\n/)) {
    if (!line || line[0] === '#') continue;
    const [hg, hj] = line.split(':');
    if (!hj || !HAN.test(hj) || !HANGUL.test(hg)) continue;
    if (Array.from(hj).length < 2 || Array.from(hg).length !== Array.from(hj).length) continue;
    if (!cands.has(hj)) cands.set(hj, new Set());
    cands.get(hj).add(hg);
}

let n = 0, base = 0, now = 0;
const bad = [];
for (const [hj, set] of cands) {
    if (set.size !== 1) continue;
    const hg = [...set][0];
    if (applyDueum(hg[0]) !== hg[0]) continue;       // 첫머리 두음법칙이 없는 입력기식 표기는 제외
    n++;
    if (textOf(tokenizeHanja(hj, data, {})) !== hg) base++;
    const out = textOf(tokenizeHanja(hj, data, words));
    if (out !== hg) { now++; if (bad.length < show) bad.push(`${hj}  ${hg} → ${out}`); }
}
const pct = x => (100 * x / n).toFixed(2) + '%';
console.log(`평가 단어 ${n}개 | 글자별만: 오답 ${base} (${pct(base)}) | 사전 적용: 오답 ${now} (${pct(now)})`);
console.log(bad.join('\n'));
