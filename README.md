# hanja

한자 변환과 글자수·바이트 세기를 탭으로 묶은 정적 웹 도구입니다. GitHub Pages로 그대로 동작합니다.

- **글자수 · 바이트** (첫 화면): 나이스(NEIS)식 / EUC-KR(기업)식 바이트를 동시에 계산
- **한자 변환** (`#hanja`): 한자→한글(두음법칙, 렬·률, 不, 단어 사전, 일본 신자체·중국 간체·이체자), 한글→한자(후보 선택)

## 구조

| 경로 | 설명 |
| --- | --- |
| `index.html` | 탭 틀과 두 기능의 화면 |
| `js/convert.js` | 한자 변환 로직 (DOM 없음) |
| `js/count.js` | 글자수·바이트 계산 (DOM 없음) |
| `js/app.js`, `hanja-ui.js`, `count-ui.js` | 탭, 화면 동작 |
| `data/hanja.json` | 한자 독음 사전 (Unihan에서 생성) |
| `data/words.json` | 글자별로 읽으면 틀리는 단어 예외 사전 |
| `tools/build_dict.py` | `hanja.json` 생성 스크립트 |
| `tests/logic.test.js` | 변환·계산 테스트 |

## 개발

```
node --test tests/logic.test.js          # 테스트
python -m http.server                    # 로컬 확인 (data/*.json 을 fetch 하므로 서버 필요)
python tools/build_dict.py <Unihan 폴더>  # 사전 재생성
```

이체자는 Unihan의 변이 정보(정자·간체·신자체·Z변이 → 의미 변이, 최대 3단계 연쇄)로 정자의 음을 빌려 읽습니다. 의미 변이로 얻은 음은 부정확할 수 있어 다음자 선택 상자로 고를 수 있습니다.

단어 사전: `data/words.lib.json`은 [libhangul](https://github.com/libhangul/libhangul)의 `hanja.txt`(BSD 3-clause, 고지는 `data/words.lib.LICENSE.txt`)에서 글자별 변환과 결과가 달라지는 단어만 추린 것입니다(약 7천 개). `node tools/build_words.js <hanja.txt>`로 다시 만들고, `node tools/eval_words.js <hanja.txt>`로 정확도를 잽니다(사전 단어 23만 개 기준 오답 2.98% → 0.03%). 남는 오답은 대부분 낱말 경계를 알 수 없는 긴 복합어 속의 두음법칙(國際勞動組合 → 로동)이며, 이런 곳은 화면에 점선 밑줄로 표시합니다. 손으로 고친 `data/words.json`이 항상 우선합니다. `tests/cases.tsv`는 직접 모은 회귀 사례집입니다.

보정표: `tools/build_dict.py`의 `EXTRA_READINGS`(Unihan에 빠진 음, 예: 數 수·삭·촉)와 `data/words.json`(이름·단어)에 있습니다. 「원문 표기」를 켜면 두음법칙·렬률 규칙을 끄고(력사), 숫자 뒤 年(1948년)은 항상 두음법칙에서 제외합니다. 5자 이상 붙은 한자 속에서 두음법칙이 적용된 글자는 점선 밑줄로 표시합니다.

사전 원본: [Unicode Unihan](https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip) (`kHangul`), [이용 약관](https://www.unicode.org/terms_of_use.html)

## 바이트 계산 기준

- 나이스식: ASCII 외 문자는 UTF-8 길이(한글·한자 3바이트), 영문·숫자·기호·공백 1바이트, 줄바꿈 2바이트
- EUC-KR식: ASCII 외 문자는 2바이트, 영문·숫자·기호·공백 1바이트, 줄바꿈 2바이트
- 줄바꿈은 화면에서 1바이트로 바꿀 수 있습니다.
