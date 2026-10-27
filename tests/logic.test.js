const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tokenizeHanja, tokenizeHangul, textOf, applyDueum } = require('../js/convert.js');
const { stats, neisBytes, euckrBytes } = require('../js/count.js');

const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const data = read('hanja.json');
const words = read('words.json');
const toHangul = (s, opts) => textOf(tokenizeHanja(s, data, words, opts));

test('기본 한자 → 한글', () => {
    assert.equal(toHangul('大韓民國'), '대한민국');
    assert.equal(toHangul('學校에서 工夫'), '학교에서 공부');
});

test('두음법칙은 단어 첫머리에만 적용', () => {
    assert.equal(toHangul('女子'), '여자');
    assert.equal(toHangul('老人'), '노인');
    assert.equal(toHangul('理想'), '이상');
    assert.equal(toHangul('來日'), '내일');
    assert.equal(toHangul('男女'), '남녀');
    assert.equal(toHangul('良心'), '양심');
    assert.equal(toHangul('善良'), '선량');
});

test('모음·ㄴ 받침 뒤 렬/률 → 열/율', () => {
    assert.equal(toHangul('比率'), '비율');
    assert.equal(toHangul('規律'), '규율');
    assert.equal(toHangul('先烈'), '선열');
    assert.equal(toHangul('能率'), '능률');
    assert.equal(toHangul('羅列'), '나열');
});

test('不은 ㄷ·ㅈ 앞에서 부', () => {
    assert.equal(toHangul('不動産'), '부동산');
    assert.equal(toHangul('不正'), '부정');
    assert.equal(toHangul('不安'), '불안');
    assert.equal(toHangul('不便'), '불편');
    assert.equal(toHangul('不可能'), '불가능');
});

test('단어 사전이 글자별 변환보다 우선', () => {
    assert.equal(toHangul('音樂'), '음악');
    assert.equal(toHangul('娛樂'), '오락');
    assert.equal(toHangul('十月'), '시월');
    assert.equal(toHangul('敗北'), '패배');
    assert.equal(toHangul('自轉車'), '자전거');
});

test('다음자 기본음 보정', () => {
    assert.equal(toHangul('樂'), '악');
    assert.equal(toHangul('車'), '차');
});

test('사전에 없는 한자는 그대로 두고 unk로 표시', () => {
    const t = tokenizeHanja('〇', data, words);
    assert.equal(t[0].k, 'unk');
    assert.equal(textOf(t), '〇');
});

test('독음 선택은 결과에 반영', () => {
    const t = tokenizeHanja('行', data, words);
    assert.equal(t[0].select, true);
    t[0].sel = t[0].readings.indexOf('항');
    require('../js/convert.js').resolve(t);
    assert.equal(textOf(t), '항');
});

test('다음자는 모두 선택 가능하고, 선택 항목 이름에도 규칙이 적용됨', () => {
    const t = tokenizeHanja('比率', data, words);
    assert.equal(t[1].select, true);
    assert.equal(t[1].labels[0], '율');
    assert.equal(textOf(t), '비율');
    const nok = tokenizeHanja('女', data, words);
    assert.equal(nok[0].select, false);
});

test('이모지(서로게이트 쌍)와 한자가 섞여도 깨지지 않음', () => {
    assert.equal(toHangul('😀大😀'), '😀대😀');
});

test('한글 → 한자: 후보와 두음법칙 변형', () => {
    assert.equal(textOf(tokenizeHangul('여자', data)).length, 2);
    const t = tokenizeHangul('여', data);
    assert.ok(t[0].cands.includes('女'));
    const t2 = tokenizeHangul('abc 123', data);
    assert.deepEqual(t2.map(x => x.k), ['plain']);
});

test('두음법칙 함수', () => {
    assert.equal(applyDueum('녀'), '여');
    assert.equal(applyDueum('례'), '예');
    assert.equal(applyDueum('락'), '낙');
    assert.equal(applyDueum('뢰'), '뇌');
    assert.equal(applyDueum('나'), '나');
});

test('나이스식 바이트: 한글 3, 영문·숫자·기호·공백 1, 엔터 2', () => {
    assert.equal(neisBytes('가', 2), 3);
    assert.equal(neisBytes('abc 123!?', 2), 9);
    assert.equal(neisBytes('가\n나', 2), 3 + 2 + 3);
    assert.equal(neisBytes('가\r\n나', 2), 8);
    assert.equal(neisBytes('大', 2), 3);
});

test('EUC-KR식 바이트: 한글·한자 2, 영문·숫자·기호·공백 1', () => {
    assert.equal(euckrBytes('가大', 2), 4);
    assert.equal(euckrBytes('abc 123!?', 2), 9);
    assert.equal(euckrBytes('가\n나', 2), 2 + 2 + 2);
    assert.equal(euckrBytes('가\n나', 1), 5);
});

test('글자수·줄 수', () => {
    const s = stats('안녕 하세요\nHello 😀', 2);
    assert.equal(s.chars, 14);
    assert.equal(s.charsNoSpace, 11);
    assert.equal(s.lines, 2);
    assert.equal(stats('', 2).lines, 0);
    assert.equal(stats('', 2).neis, 0);
});
