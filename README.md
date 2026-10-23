# 우주 동향 대시보드

GitHub Actions가 3시간마다 기사·발사 일정·위성 집계를 모아 `data/` 폴더에 저장합니다. 대시보드(`index.html`)는 그 파일을 먼저 읽고, 받지 못하면 예전처럼 브라우저에서 직접 수집합니다. 별도의 서버 PC는 필요하지 않습니다.

## 파일 구성

| 경로 | 역할 |
|---|---|
| `index.html` | 대시보드 |
| `scripts/collect.mjs` | 수집 스크립트 (RSS, Launch Library 2, CelesTrak SATCAT) |
| `scripts/feeds.json` | 수집할 RSS 피드 목록 |
| `scripts/satcat-calc.mjs` | 위성 집계 계산 (대시보드와 같은 코드) |
| `scripts/translate.mjs` | 기사 번역 (Google → DeepL 예비) |
| `scripts/text-prep.mjs` | 번역할 요약문 고르기 (대시보드와 같은 코드) |
| `.github/workflows/collect.yml` | 3시간마다 수집을 실행하는 설정 |
| `data/` | 수집 결과. 처음 실행하면 자동으로 생깁니다 |

## 설치 (웹 브라우저에서)

1. **저장소 만들기**
   GitHub 오른쪽 위 `+` → `New repository`를 누릅니다. 이름(예: `space-dashboard`)을 정하고 **Public**을 선택한 뒤 `Create repository`를 누릅니다.

2. **파일 올리기**
   새 저장소 화면의 `uploading an existing file`을 누르고, 압축을 푼 폴더 안의 내용을 모두 끌어다 놓은 뒤 `Commit changes`를 누릅니다.
   올린 뒤 저장소 첫 화면에 `.github` 폴더가 보이는지 확인합니다. 없다면 이렇게 만듭니다.
   - `Add file` → `Create new file`을 누릅니다.
   - 파일 이름 칸에 `.github/workflows/collect.yml`을 입력합니다.
   - `collect.yml` 내용을 붙여 넣고 저장합니다.

3. **쓰기 권한 주기**
   `Settings` → `Actions` → `General`로 가서, 맨 아래 `Workflow permissions`를 `Read and write permissions`로 바꾸고 `Save`를 누릅니다.

4. **Pages 켜기**
   `Settings` → `Pages`로 가서 `Source`를 `Deploy from a branch`, `Branch`를 `main` / `(root)`로 지정하고 `Save`를 누릅니다.

5. **첫 수집 실행**
   `Actions` 탭으로 갑니다. 활성화 버튼이 나오면 누릅니다. 왼쪽에서 `우주 동향 데이터 수집`을 고르고 `Run workflow`를 누르는데, 이때 `CelesTrak 위성 집계를 지금 다시 받기`에 체크합니다. 1~3분 뒤 초록색 체크가 뜨면 성공입니다.

6. **대시보드 열기**
   `https://아이디.github.io/space-dashboard/`로 접속합니다. Pages 반영에 몇 분 걸릴 수 있습니다.

이후에는 3시간마다 자동으로 수집됩니다. 대시보드는 열 때, 켜 둔 동안 30분마다, 다른 탭에 있다가 돌아올 때 새 수집 결과를 확인해 자동으로 반영합니다.

## ⚡ 직접 수집 버튼

서버 수집을 기다리지 않고 지금 브라우저에서 피드를 직접 받아 기존 기사와 합칩니다. 속보를 바로 보고 싶을 때만 쓰면 됩니다. 무료 중계 서비스를 거치므로 일부 피드는 실패할 수 있으며, 실패한 피드는 서버 수집 결과로 채웁니다. 상단 날짜 칸에 `직접 수집 n/17곳`처럼 성공한 피드 수가 표시됩니다.

## PC에 저장한 파일로 열 때

`index.html`을 메모장 등으로 열어 `var DATA_URL="";`을 찾고, 다음처럼 바꿉니다.

```
var DATA_URL="https://아이디.github.io/space-dashboard/data/";
```

## 수집 결과 확인

`data/status.json`에 실행마다 피드별 성공 여부와 기사 수, 발사 일정과 위성 집계의 결과가 기록됩니다. 대시보드에 기사가 적게 보이면 이 파일부터 확인하면 됩니다.

- **위성 집계**: CelesTrak 요청 제한을 피하려고 20시간에 한 번만 받습니다. GitHub 쪽에서 받지 못해 36시간 넘게 갱신되지 않으면, 대시보드가 예전처럼 브라우저에서 직접 받기를 시도합니다.
- **기사 분류**: 논평·비기술·박물관류 제외, 일반/군사 구분, 중복 제거는 대시보드가 합니다. 수집 쪽은 피드별 최근 8일 기사만 그대로 저장합니다.

## 번역

해외 기사의 제목과 요약은 수집할 때 서버에서 미리 한국어로 번역해 둡니다. 그래서 대시보드의 번역 버튼과 전체 번역은 대부분 바로 표시되고, 외부 번역 서비스에 따로 요청하지 않습니다.

- **서버 번역 순서**: 이전 실행에서 번역해 둔 결과를 먼저 재사용하므로, 새 기사만 번역합니다. 새 기사는 Google 번역을 쓰고, 막히면 DeepL을 씁니다(키를 등록했을 때만).
- **화면 번역 순서**: 직접 수집한 기사처럼 서버 번역이 없는 경우에만 화면에서 번역합니다. 서버 번역 → Google 번역 → MyMemory 순으로 시도합니다. MyMemory는 하루 사용량 제한이 있어 남은 기사만 최대 12건까지 씁니다. 막힌 경로는 10분 동안 건너뜁니다.
- 번역 결과는 `data/status.json`의 `translate` 항목에서 확인할 수 있습니다. 항목은 재사용(reused), Google, DeepL, 실패(fail) 건수입니다.

### DeepL 예비 번역 등록 (선택)

Google 번역이 GitHub 서버에서 막힐 때를 대비한 예비 경로입니다. 등록하지 않아도 동작합니다.

1. [DeepL API Free](https://www.deepl.com/pro-api)에 가입합니다. 월 50만 자까지 무료이고, 가입할 때 카드 인증이 필요합니다.
2. 계정 페이지에서 인증 키를 복사합니다. 키는 `:fx`로 끝납니다.
3. 저장소에서 `Settings` → `Secrets and variables` → `Actions` → `New repository secret`으로 갑니다. 이름에 `DEEPL_API_KEY`, 값에 키를 넣고 저장합니다.

키는 GitHub Secrets에만 저장되므로 대시보드 페이지나 공개 저장소에는 노출되지 않습니다.

## 피드를 추가하거나 뺄 때

`index.html`의 `var FD=[...]`와 `scripts/feeds.json`을 **함께** 고칩니다. `feeds.json`에 없는 피드는 대시보드가 브라우저에서 직접 받습니다.

## 실행 주기 바꾸기

`collect.yml`의 `cron: "17 */3 * * *"`를 고칩니다. 시각은 UTC 기준입니다. 예를 들어 `*/3`을 `*/6`으로 바꾸면 6시간마다 실행됩니다.
