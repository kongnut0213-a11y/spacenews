# 우주 동향 대시보드

GitHub Actions가 3시간마다 기사·발사 일정·위성 집계를 모아 `data/` 폴더에 저장합니다. 대시보드(`index.html`)는 그 파일을 먼저 읽고, 받지 못하면 예전처럼 브라우저에서 직접 수집합니다. 별도의 서버 PC는 필요하지 않습니다.

## 파일 구성

| 경로 | 역할 |
|---|---|
| `index.html` | 대시보드 |
| `scripts/collect.mjs` | 수집 스크립트 (RSS, Launch Library 2, CelesTrak SATCAT) |
| `scripts/feeds.json` | 수집할 RSS 피드 목록 |
| `scripts/satcat-calc.mjs` | 위성 집계 계산 (대시보드와 같은 코드) |
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

이후에는 3시간마다 자동으로 수집됩니다. 대시보드를 열었을 때 새 수집 결과가 있으면 기사가 자동으로 갱신됩니다.

## PC에 저장한 파일로 열 때

`index.html`을 메모장 등으로 열어 `var DATA_URL="";`을 찾고, 다음처럼 바꿉니다.

```
var DATA_URL="https://아이디.github.io/space-dashboard/data/";
```

## 수집 결과 확인

`data/status.json`에 실행마다 피드별 성공 여부와 기사 수, 발사 일정과 위성 집계의 결과가 기록됩니다. 대시보드에 기사가 적게 보이면 이 파일부터 확인하면 됩니다.

- **위성 집계**: CelesTrak 요청 제한을 피하려고 20시간에 한 번만 받습니다. GitHub 쪽에서 받지 못해 36시간 넘게 갱신되지 않으면, 대시보드가 예전처럼 브라우저에서 직접 받기를 시도합니다.
- **기사 분류**: 논평·비기술·박물관류 제외, 일반/군사 구분, 중복 제거는 대시보드가 합니다. 수집 쪽은 피드별 최근 8일 기사만 그대로 저장합니다.

## 피드를 추가하거나 뺄 때

`index.html`의 `var FD=[...]`와 `scripts/feeds.json`을 **함께** 고칩니다. `feeds.json`에 없는 피드는 대시보드가 브라우저에서 직접 받습니다.

## 실행 주기 바꾸기

`collect.yml`의 `cron: "17 */3 * * *"`를 고칩니다. 시각은 UTC 기준입니다. 예를 들어 `*/3`을 `*/6`으로 바꾸면 6시간마다 실행됩니다.
