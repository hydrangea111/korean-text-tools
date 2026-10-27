/* 글자수·바이트 계산 (DOM 없음) */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else (root.HT = root.HT || {}).count = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * 나이스(NEIS)식: 한글·한자 등 ASCII가 아닌 글자는 UTF-8 길이(한글 3바이트),
     *                영문·숫자·기호·공백은 1바이트, 줄바꿈은 lineBreakBytes.
     */
    function neisBytes(text, lineBreakBytes) {
        let n = 0;
        for (const ch of text.replace(/\r\n?/g, '\n')) {
            const cp = ch.codePointAt(0);
            if (ch === '\n') n += lineBreakBytes;
            else if (cp < 0x80) n += 1;
            else if (cp < 0x800) n += 2;
            else if (cp < 0x10000) n += 3;
            else n += 4;
        }
        return n;
    }

    /**
     * EUC-KR(기업)식: 한글·한자 등 ASCII가 아닌 글자는 2바이트,
     *                영문·숫자·기호·공백은 1바이트, 줄바꿈은 lineBreakBytes.
     * 이모지처럼 EUC-KR에 없는 글자도 2바이트로 센다.
     */
    function euckrBytes(text, lineBreakBytes) {
        let n = 0;
        for (const ch of text.replace(/\r\n?/g, '\n')) {
            if (ch === '\n') n += lineBreakBytes;
            else n += ch.codePointAt(0) < 0x80 ? 1 : 2;
        }
        return n;
    }

    /** 글자수는 코드 포인트 기준(이모지도 1글자). 줄바꿈은 1글자로 센다. */
    function stats(text, lineBreakBytes) {
        const norm = text.replace(/\r\n?/g, '\n');
        const lb = lineBreakBytes === 1 ? 1 : 2;
        return {
            chars: Array.from(norm).length,
            charsNoSpace: Array.from(norm.replace(/\s/g, '')).length,
            lines: norm === '' ? 0 : norm.split('\n').length,
            neis: neisBytes(norm, lb),
            euckr: euckrBytes(norm, lb),
        };
    }

    return { stats, neisBytes, euckrBytes };
});
