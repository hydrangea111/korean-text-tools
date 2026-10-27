# hanja

한자 변환과 글자수·바이트 세기를 탭으로 묶은 정적 웹 도구입니다. GitHub Pages로 그대로 동작합니다.

- **한자 변환**: 한자→한글(두음법칙, 렬·률, 不, 단어 사전), 한글→한자(후보 선택)
- **글자수 · 바이트**: 나이스(NEIS)식 / EUC-KR(기업)식 바이트를 동시에 계산

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

사전 원본: [Unicode Unihan](https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip) (`kHangul`), [이용 약관](https://www.unicode.org/terms_of_use.html)

## 바이트 계산 기준

- 나이스식: ASCII 외 문자는 UTF-8 길이(한글·한자 3바이트), 영문·숫자·기호·공백 1바이트, 줄바꿈 2바이트
- EUC-KR식: ASCII 외 문자는 2바이트, 영문·숫자·기호·공백 1바이트, 줄바꿈 2바이트
- 줄바꿈은 화면에서 1바이트로 바꿀 수 있습니다.
