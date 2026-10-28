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
