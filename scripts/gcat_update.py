"""GCAT 위성 카탈로그(planet4589.org, CC-BY) 수집 → data/gcat.tsv, data/gcat-meta.json

재진입 분석 모델이 쓰는 열만 남기고, 궤도상 물체 + 최근 KEEP_YEARS년 안에 재진입한 물체만 남겨
용량을 줄인다. 형식은 원본 TSV와 같다(첫 줄 '#열이름', 이어서 '# Updated ...').
받아 온 자료가 비정상이면 기존 파일을 덮어쓰지 않고 실패로 끝낸다.
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.request

SRC = ['https://planet4589.org/space/gcat/tsv/cat/satcat.tsv',
       'https://www.planet4589.org/space/gcat/tsv/cat/satcat.tsv']
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else 'data'
KEEP_YEARS = 3          # 재진입 후 이 기간까지 보관
MIN_ROWS = 10000        # 이보다 적으면 비정상 응답으로 보고 중단
COLS = ['Satcat', 'Name', 'Type', 'State', 'Owner', 'LDate', 'DDate', 'Status',
        'Mass', 'MassFlag', 'DryMass', 'DryFlag', 'Length', 'LFlag',
        'Diameter', 'DFlag', 'Span', 'SpanFlag', 'Shape']


def download():
    last = None
    for attempt in range(3):
        for url in SRC:
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'spacenews-gcat-sync/1.0 (GitHub Actions)'})
                with urllib.request.urlopen(req, timeout=120) as r:
                    return r.read().decode('utf-8', 'replace'), url
            except Exception as e:  # noqa: BLE001
                last = e
                print(f'[GCAT] {url} 실패: {e}', file=sys.stderr)
        time.sleep(20 * (attempt + 1))
    raise SystemExit(f'GCAT 다운로드 실패: {last}')


def ddate_year(v):
    v = v.strip()
    if not v or v == '-':
        return None
    try:
        return int(v[:4])
    except ValueError:
        return None


def main():
    text, url = download()
    lines = text.replace('\r', '').split('\n')
    if not lines or not lines[0].startswith('#') or 'Satcat' not in lines[0]:
        raise SystemExit('GCAT 형식 오류: 첫 줄에 열 이름이 없음 (HTML 응답일 수 있음)')
    head = [h.strip() for h in lines[0][1:].split('\t')]
    miss = [c for c in COLS if c not in head]
    if miss:
        raise SystemExit(f'GCAT 형식 오류: 열 없음 {miss}')
    ix = [head.index(c) for c in COLS]
    updated = next((ln[1:].strip() for ln in lines[1:5] if ln.startswith('#')), '')
    cutoff = dt.date.today().year - KEEP_YEARS
    rows, total = [], 0
    for ln in lines[1:]:
        if not ln or ln.startswith('#'):
            continue
        c = ln.split('\t')
        if len(c) < len(head):
            c += [''] * (len(head) - len(c))
        sat = c[head.index('Satcat')].strip()
        if not sat.isdigit():
            continue
        total += 1
        y = ddate_year(c[head.index('DDate')])
        if y is not None and y < cutoff:
            continue
        rows.append('\t'.join(c[i].strip() for i in ix))
    if total < MIN_ROWS or len(rows) < MIN_ROWS // 4:
        raise SystemExit(f'GCAT 행 수 비정상(전체 {total}, 보관 {len(rows)}) — 기존 파일 유지')
    os.makedirs(OUT_DIR, exist_ok=True)
    body = '#' + '\t'.join(COLS) + '\n# ' + (updated or 'Updated ?') + '\n' + '\n'.join(rows) + '\n'
    path = os.path.join(OUT_DIR, 'gcat.tsv')
    old = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    if old == body:
        print('[GCAT] 변경 없음')
        return
    open(path, 'w', encoding='utf-8', newline='\n').write(body)
    meta = {'at': int(time.time() * 1000), 'gcat_updated': updated, 'rows': len(rows),
            'total': total, 'keep_years': KEEP_YEARS, 'src': url,
            'license': 'GCAT (J. McDowell, planet4589.org) CC-BY'}
    json.dump(meta, open(os.path.join(OUT_DIR, 'gcat-meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'[GCAT] 저장 {len(rows)}/{total}행, {len(body)/1e6:.2f} MB, {updated}')


main()
