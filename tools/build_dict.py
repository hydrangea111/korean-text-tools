"""Unihan에서 한자 독음 사전(data/hanja.json)을 생성한다.

사용법:
    python tools/build_dict.py <Unihan.zip 이 풀린 폴더> [출력 경로]

Unihan 데이터: https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip
라이선스: https://www.unicode.org/terms_of_use.html

kHangul 값의 접미사
    :E / :0E / :1E   대표음 (한자 하나에 대표 독음)
    :N / :0N / :1N   보조음 (다른 뜻일 때의 음)
    :0 / :1          두음법칙·속음 변형 (예: 女 녀 → 여). 규칙으로 처리하므로 제외한다.
"""
import json
import re
import sys
from pathlib import Path

src = Path(sys.argv[1])
out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "data" / "hanja.json"


def rows(name, field):
    for line in (src / name).read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or not line:
            continue
        cp, f, val = line.split("\t", 2)
        if f == field:
            yield chr(int(cp[2:], 16)), val


def is_candidate(ch):
    """한글→한자 후보로 쓸 범위: 기본 한자 + 호환 한자 (희귀한 확장 영역은 제외)."""
    cp = ord(ch)
    return 0x4E00 <= cp <= 0x9FFF or 0xF900 <= cp <= 0xFAFF


readings = {}   # 한자 -> [(음, 대표음 여부)]
variants = {}   # 한자 -> [두음법칙 변형 음]
for ch, val in rows("Unihan_Readings.txt", "kHangul"):
    main, alt, var = [], [], []
    for item in val.split():
        syl, _, tag = item.partition(":")
        if "E" in tag:
            main.append(syl)
        elif "N" in tag:
            alt.append(syl)
        else:
            var.append(syl)
    ordered = main + [s for s in alt if s not in main]
    if not ordered:                 # 표식이 전혀 없으면 변형값을 그대로 쓴다
        ordered, var = var, []
    readings[ch] = ordered
    variants[ch] = [v for v in var if v not in ordered]

grade = {ch: int(v) for ch, v in rows("Unihan_DictionaryLikeData.txt", "kGradeLevel")}
strokes = {ch: int(v.split()[0]) for ch, v in rows("Unihan_RadicalStrokeCounts.txt", "kTotalStrokes")}
ks1001 = {ch for ch, v in rows("Unihan_IRGSources.txt", "kIRG_KSource") if v.startswith("K0-")}


def rank(ch):
    """작을수록 흔한 한자: KS X 1001 수록 → 학년 수준 → 획수 → 코드포인트."""
    return (0 if ch in ks1001 else 1, grade.get(ch, 9), strokes.get(ch, 99), ord(ch))


# Unihan에 빠졌거나 모자란 음의 보충표. 기존 음 뒤에 덧붙이므로 기본음은 그대로다.
# 변이형(数 등)도 이 음을 이어받도록 이체자 계산보다 먼저 적용한다.
EXTRA_READINGS = {
    "數": ["촉"],              # 수 · 삭(頻數) · 촉(數罟)
    "辦": ["변"],              # 판 · 변(懲辦)
    "躕": ["주"],              # 躊躇 → 주저 (Unihan에 없음)
    "內": ["나"], "大": ["태"], "寺": ["시"], "單": ["선"], "食": ["사"],
    "覆": ["부"], "合": ["홉"], "曾": ["층"], "否": ["비"], "蓋": ["합"],
    "畜": ["휵"], "著": ["착"], "伯": ["패"], "邪": ["야"], "差": ["치"],
    "詰": ["길"], "徵": ["치"], "繁": ["파"], "尉": ["울"], "辟": ["피", "비"],
}
for ch, extra in EXTRA_READINGS.items():
    readings[ch] = list(dict.fromkeys(readings.get(ch, []) + extra))
    variants.setdefault(ch, [])

# 대표음이 두음법칙형으로 올라와 있는 글자: 朗 낭/랑, 欄 난/란, 虜 노/로, 隆 융/륭, 類 유/류.
# 단어 중간(明朗, 空欄)에서는 원음(랑, 란)으로 읽어야 하므로 두음법칙형은 빼고, 첫머리에서는 규칙이 바꿔 준다.
# 빼 낸 음은 한글→한자 후보에 남도록 variants 로 옮긴다.
Y_VOWELS = {2, 3, 6, 7, 12, 17, 20}      # ㅑ ㅒ ㅕ ㅖ ㅛ ㅠ ㅣ


def dueum(syl):
    code = ord(syl) - 0xAC00
    if not 0 <= code < 11172:
        return syl
    lead, vowel, tail = code // 588, code % 588 // 28, code % 28
    if lead not in (2, 5):                # ㄴ ㄹ
        return syl
    if vowel in Y_VOWELS:
        return chr(0xAC00 + (11 * 21 + vowel) * 28 + tail)
    return chr(0xAC00 + (2 * 21 + vowel) * 28 + tail) if lead == 5 else syl


def prefer_original_sound():
    for ch, rs in readings.items():
        pool = rs + variants.get(ch, [])
        swapped = {}
        for a in rs:
            b = next((b for b in pool if b != a and dueum(b) == a), None)
            if b:
                swapped[a] = b
        if swapped:
            readings[ch] = list(dict.fromkeys(swapped.get(r, r) for r in rs))
            variants[ch] = [v for v in variants.get(ch, []) if v not in swapped.values()] + list(swapped)


prefer_original_sound()


def targets(value):
    """Unihan 변이 값(U+XXXX<출처> ...)에서 글자만 뽑는다."""
    return [chr(int(x.split("<")[0][2:], 16)) for x in value.split()]


# 변이형 그래프. 정확도 순으로 1단계(정자·간체·신자체·Z변이) → 2단계(의미 변이)
graphs = ({}, {})
for field, tier in (("kTraditionalVariant", 0), ("kSimplifiedVariant", 0), ("kZVariant", 0),
                    ("kJapaneseOldVariant", 0), ("kJapaneseNewVariant", 0),
                    ("kSemanticVariant", 1), ("kSpecializedSemanticVariant", 1)):
    for ch, val in rows("Unihan_Variants.txt", field):
        for t in targets(val):
            if t == ch:
                continue
            graphs[tier].setdefault(ch, set()).add(t)
            graphs[tier].setdefault(t, set()).add(ch)   # 방향과 상관없이 양쪽에서 찾는다

# 독음이 없는 글자는 변이형의 독음을 빌린다. 더 정확한 단계를 먼저 쓰고, 연쇄는 3번까지 따라간다.
derived = {}    # 한자 -> 독음을 빌려 온 글자
for _ in range(3):
    found = {}
    for g in graphs:
        for ch, nbrs in g.items():
            if ch in readings or ch in derived or ch in found:
                continue
            donors = sorted((n for n in nbrs if n in readings), key=rank)
            if donors:
                found[ch] = donors
    if not found:
        break
    for ch, donors in found.items():
        merged = []
        for d in donors:
            merged += [r for r in readings[d] if r not in merged]
        derived[ch] = donors[0]
        readings.setdefault(ch, merged[:5])
        variants.setdefault(ch, [])

# 일본 신자체가 다른 글자의 고유 음을 이미 갖고 있어도(医 예) 구자체의 음(醫 의)을 앞에 둔다
for ch, val in rows("Unihan_Variants.txt", "kJapaneseOldVariant"):
    if ch not in readings or ch in derived:
        continue
    front = [r for t in targets(val) for r in readings.get(t, [])]
    shared = [r for r in readings[ch] if r in front]     # 弁 변: 구자체 넷(辨辯瓣辦)과 겹치는 음이 우선
    ordered = shared + front + readings[ch]
    readings[ch] = list(dict.fromkeys(ordered))
    variants.setdefault(ch, [])
prefer_original_sound()      # 구자체의 음을 앞에 붙이다가 두음법칙형(朗 낭)이 다시 앞서는 것을 바로잡는다

# 정방향: 한자 -> "음1,음2,..." (첫 번째가 기본음)
chars = {ch: ",".join(r) for ch, r in sorted(readings.items(), key=lambda kv: ord(kv[0]))}

# 역방향: 음절 -> 후보 한자 문자열 (흔한 순)
rev = {}
for ch, rs in readings.items():
    if ch in derived or not is_candidate(ch):     # 빌려 온 독음은 한글→한자 후보에 넣지 않는다
        continue
    for syl in set(rs) | set(variants[ch]):
        rev.setdefault(syl, []).append(ch)
reverse = {syl: "".join(sorted(cs, key=rank)) for syl, cs in sorted(rev.items())}

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(
    json.dumps({"chars": chars, "reverse": reverse, "via": dict(sorted(derived.items()))}, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8",
)
multi = sum(1 for v in chars.values() if "," in v)
print(f"이체자 {len(derived)}자 추가, 한자 {len(chars)}자 (다음자 {multi}자), 음절 {len(reverse)}개 -> {out} ({out.stat().st_size // 1024} KB)")
