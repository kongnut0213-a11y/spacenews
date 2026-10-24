// 우주물체 재진입 자료 수집 (GitHub Actions에서 3시간마다 실행)
// 출력
//   data/reentry.json         재진입 임박 물체(CelesTrak DECAYING TLE) + 그 물체들의 SATCAT 행 + GCAT 행
//                             + 최근 10일 동안 목록에 있었던 물체의 마지막 TLE(이미 떨어진 물체의 마지막 위치 추정용)
//   data/reentry-recent.json  최근 7일 안에 재진입한 물체의 SATCAT 행
//   data/reentry-status.json  수집 결과와 실패 사유
// 원천: CelesTrak gp.php?SPECIAL=DECAYING, CelesTrak pub/satcat.csv, GCAT satcat.tsv(하루 1회, CC-BY)
// SATCAT·GCAT은 분석 파일의 기존 해석 코드가 그대로 읽도록 원래 형식(헤더 + 필요한 행만)으로 저장한다.
import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url), OUT = new URL("data/", ROOT);
const UA = "Mozilla/5.0 (compatible; SpaceTrendDashboard-Reentry/1.0; GitHub Actions)";
const now = Date.now();
const RECENT_DAYS = 7, LAST_KEEP_DAYS = 10, GCAT_EVERY_MS = 864e5;

async function get(url, ms = 120000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": UA } });
    const s = await r.text();
    if (!r.ok) throw new Error("HTTP " + r.status);
    if (/^\s*<(!doctype|html)/i.test(s.slice(0, 200))) throw new Error("HTML 응답(형식 변경 가능성)");
    return s;
  } catch (e) { throw new Error(e.name === "AbortError" ? "시간 초과" : e.message); }
  finally { clearTimeout(t); }
}
function csvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out;
}
function parse3le(txt) {
  const L = String(txt || "").replace(/\r/g, "").split("\n").map(x => x.trimEnd()).filter(x => x.trim());
  const out = [];
  for (let i = 0; i < L.length - 1; i++) {
    if (L[i].startsWith("1 ") && L[i + 1].startsWith("2 ")) {
      const nm = i > 0 && !/^[12] /.test(L[i - 1]) ? L[i - 1].replace(/^0\s+/, "").trim() : "";
      out.push({ norad: parseInt(L[i].substring(2, 7), 10), n: nm, l1: L[i].trim(), l2: L[i + 1].trim() });
      i++;
    }
  }
  return out;
}
const satcatDate = s => { let x = String(s || "").trim().replace(" ", "T"); if (!x) return NaN; if (!/T/.test(x)) x += "T00:00:00"; if (!/Z$|[+-]\d\d:?\d\d$/.test(x)) x += "Z"; return Date.parse(x); };

let old = {};
try { old = JSON.parse(await fs.readFile(new URL("reentry.json", OUT), "utf8")); } catch {}
const status = { at: now, decaying: null, satcat: null, gcat: null, recent: 0, last: 0, errors: {} };

// 1) 재진입 임박 물체
let decTle = null, dec = [];
try {
  decTle = (await get("https://celestrak.org/NORAD/elements/gp.php?SPECIAL=DECAYING&FORMAT=TLE")).replace(/\r/g, "").trim() + "\n";
  dec = parse3le(decTle);
  if (!dec.length) throw new Error("TLE를 찾지 못함");
  status.decaying = dec.length;
} catch (e) {
  status.errors.decaying = e.message;
  decTle = old.decaying_tle || null; dec = parse3le(decTle || "");
}

// 2) 마지막 TLE 보관(이미 떨어져 목록에서 빠진 물체의 마지막 위치 추정용)
const last = {};
for (const [k, v] of Object.entries(old.last_tle || {})) if (now - (v.seen || 0) < LAST_KEEP_DAYS * 864e5) last[k] = v;
if (!status.errors.decaying) for (const o of dec) last[o.norad] = { n: o.n, l1: o.l1, l2: o.l2, seen: now };
status.last = Object.keys(last).length;

// 3) SATCAT: 임박 물체 + 최근 재진입 물체 행만
let satHeader = null, satRows = {}, recentRows = [];
try {
  const txt = await get("https://celestrak.org/pub/satcat.csv", 180000);
  const lines = txt.replace(/\r/g, "").split("\n").filter(Boolean);
  satHeader = lines[0];
  const H = csvLine(satHeader).map(h => h.trim().toUpperCase()), I = {}; H.forEach((h, i) => (I[h] = i));
  if (!("NORAD_CAT_ID" in I) || !("DECAY_DATE" in I)) throw new Error("SATCAT 헤더 형식 변경: " + satHeader.slice(0, 80));
  const want = new Set([...dec.map(o => o.norad), ...Object.keys(last).map(Number)]);
  const cutoff = now - RECENT_DAYS * 864e5;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // 빠른 거르기: 쉼표로 나눈 뒤 필요한 열만 확인
    const c = csvLine(line);
    const n = parseInt(c[I.NORAD_CAT_ID], 10);
    if (!n) continue;
    if (want.has(n)) satRows[n] = line;
    const d = satcatDate(c[I.DECAY_DATE]);
    if (Number.isFinite(d) && d >= cutoff) { recentRows.push({ d, line }); satRows[n] = line; }
  }
  recentRows.sort((a, b) => b.d - a.d);
  status.satcat = Object.keys(satRows).length; status.recent = recentRows.length;
} catch (e) {
  status.errors.satcat = e.message;
  if (old.satcat_csv) { const L = old.satcat_csv.split("\n").filter(Boolean); satHeader = L[0]; const I0 = csvLine(L[0]).map(h => h.trim().toUpperCase()).indexOf("NORAD_CAT_ID"); for (const l of L.slice(1)) satRows[parseInt(csvLine(l)[I0], 10)] = l; }
}

// 4) GCAT: 하루 한 번 전체 목록을 받아 필요한 물체 행만 보관
let gHeader = old.gcat_header || null, gRows = {}, gAt = old.gcat_at || 0;
const needG = new Set(Object.keys(satRows).map(Number));
const parseG = (txt) => {
  const rows = {}; let head = null, si = -1;
  for (const raw of txt.replace(/\r/g, "").split("\n")) {
    if (!raw) continue;
    if (raw.startsWith("#")) { if (!head) { head = raw; si = raw.slice(1).split("\t").map(h => h.trim()).indexOf("Satcat"); } continue; }
    if (si < 0) continue;
    const n = parseInt((raw.split("\t")[si] || "").trim(), 10);
    if (n && needG.has(n)) rows[n] = raw;
  }
  return { head, rows };
};
if (old.gcat_tsv) { const g = parseG(old.gcat_tsv); gRows = g.rows; gHeader = g.head || gHeader; }
if (now - gAt > GCAT_EVERY_MS || Object.keys(gRows).length < needG.size * 0.5) {
  for (const u of ["https://planet4589.org/space/gcat/tsv/cat/satcat.tsv", "https://planet4589.org/space/gcat/data/cat/satcat.html"]) {
    try {
      const g = parseG(await get(u, 240000));
      if (!g.head || !Object.keys(g.rows).length) throw new Error("GCAT 형식 확인 필요");
      gHeader = g.head; gRows = g.rows; gAt = now; delete status.errors.gcat; break;
    } catch (e) { status.errors.gcat = u.split("/").pop() + ": " + e.message; }
  }
}
status.gcat = Object.keys(gRows).length;

// 저장
await fs.mkdir(OUT, { recursive: true });
const satcat_csv = satHeader ? [satHeader, ...Object.keys(satRows).sort((a, b) => a - b).map(k => satRows[k])].join("\n") + "\n" : "";
const gcat_tsv = gHeader ? [gHeader, ...Object.keys(gRows).sort((a, b) => a - b).map(k => gRows[k])].join("\n") + "\n" : "";
if (!decTle && !satcat_csv) {
  console.error("수집된 자료가 없어 reentry.json을 바꾸지 않습니다.");
} else {
  await fs.writeFile(new URL("reentry.json", OUT), JSON.stringify({
    at: now, src: "CelesTrak DECAYING · CelesTrak SATCAT · GCAT (CC-BY, J. McDowell)",
    decaying_at: status.errors.decaying ? (old.decaying_at || null) : now,
    decaying_tle: decTle || "", satcat_csv, gcat_at: gAt || null, gcat_tsv, last_tle: last
  }) + "\n");
  if (satHeader && !status.errors.satcat)
    await fs.writeFile(new URL("reentry-recent.json", OUT), JSON.stringify({ at: now, days: RECENT_DAYS, satcat_csv: [satHeader, ...recentRows.map(r => r.line)].join("\n") + "\n" }) + "\n");
}
await fs.writeFile(new URL("reentry-status.json", OUT), JSON.stringify(status) + "\n");
console.log(JSON.stringify(status, null, 1));
