// 한국 위성 근접접근 수집 (CelesTrak SOCRATES, GitHub Actions에서 3시간마다 실행)
//   입력: scripts/cdm-norads.txt
//   출력: data/cdm.json  { at, src, window:{start,stop}, events:[...], tle:{ NORAD:{n,l1,l2,f} } }
//         data/cdm-status.json (조회 성공/실패, 파싱 결과 0건일 때 응답 일부)
// - 위성마다 SOCRATES 표를 최소거리순 25건 조회 (요청 간격 3초)
// - 상대 물체 TLE는 CelesTrak CATNR로 받는다(가까운 TCA 순 최대 60기, 1.2초 간격, 24시간 안에 받은 것은 재사용)
import fs from "node:fs/promises";
import { parseSocrates, parseWindow } from "./socrates-parse.mjs";

const ROOT = new URL("../", import.meta.url), OUT = new URL("data/", ROOT);
const UA = "Mozilla/5.0 (compatible; SpaceTrendDashboard-CDM/1.0; GitHub Actions)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = Date.now();

async function get(url, ms = 60000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": UA } });
    const s = await r.text();
    if (!r.ok) throw new Error("HTTP " + r.status);
    return s;
  } catch (e) { throw new Error(e.name === "AbortError" ? "시간 초과" : e.message); }
  finally { clearTimeout(t); }
}
function parseTLE(txt, norad) {
  const L = String(txt || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  for (let i = 0; i < L.length - 1; i++)
    if (L[i].startsWith("1 ") && L[i + 1].startsWith("2 ") && String(parseInt(L[i].substring(2, 7), 10)) === String(norad))
      return { n: i > 0 && !/^[12] /.test(L[i - 1]) ? L[i - 1].replace(/^0\s+/, "") : "", l1: L[i], l2: L[i + 1] };
  return null;
}

const want = [...new Set((await fs.readFile(new URL("scripts/cdm-norads.txt", ROOT), "utf8"))
  .split(/\r?\n/).map(l => l.replace(/#.*/, "").trim()).filter(l => /^\d+$/.test(l)).map(Number))];
let old = {};
try { old = JSON.parse(await fs.readFile(new URL("cdm.json", OUT), "utf8")); } catch {}

const status = { at: now, want: want.length, ok: 0, fail: {}, empty: [], events: 0, tle: { tried: 0, ok: 0, reused: 0, err: null }, sample: null };
const events = []; let win = { start: null, stop: null };

for (const n of want) {
  try {
    const html = await get(`https://celestrak.org/SOCRATES/table-socrates.php?CATNR=${n}&ORDER=MINRANGE&MAX=25`);
    const ev = parseSocrates(html);
    if (!win.start) win = parseWindow(html);
    status.ok++;
    if (!ev.length) { status.empty.push(n); if (!status.sample) status.sample = html.replace(/\s+/g, " ").slice(0, 3000); }
    for (const e of ev) {
      // 한국 위성이 2번 물체로 나온 경우 1번으로 맞춘다
      if (e.p !== n && e.s === n) [e.p, e.pn, e.ps, e.s, e.sn, e.ss, e.dse1, e.dse2] = [e.s, e.sn, e.ss, e.p, e.pn, e.ps, e.dse2, e.dse1];
      events.push(e);
    }
  } catch (e) { status.fail[n] = e.message; if (/HTTP (403|429)/.test(e.message)) break; }
  await sleep(3000);
}

// 중복 제거(같은 두 물체·같은 TCA), TCA 순 정렬
const seen = new Set();
const uniq = events.filter(e => { const k = [Math.min(e.p, e.s), Math.max(e.p, e.s), e.tca.slice(0, 19)].join("|"); if (seen.has(k)) return false; seen.add(k); return true; })
  .sort((a, b) => a.tca.localeCompare(b.tca));
status.events = uniq.length;

// 상대 물체 TLE
const oldTle = old.tle || {}, tle = {};
const sec = [...new Set(uniq.filter(e => Date.parse(e.tca) > now - 3600e3).map(e => e.s))];
for (const k of sec) if (oldTle[k] && now - (oldTle[k].f || 0) < 864e5) { tle[k] = oldTle[k]; status.tle.reused++; }
for (const k of sec.filter(k => !tle[k]).slice(0, 60)) {
  status.tle.tried++;
  try {
    const v = parseTLE(await get(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${k}&FORMAT=TLE`, 30000), k);
    if (v) { tle[k] = { ...v, f: now }; status.tle.ok++; }
  } catch (e) { status.tle.err = e.message; if (/HTTP (403|429)/.test(e.message)) break; }
  await sleep(1200);
}
for (const k of sec) if (!tle[k] && oldTle[k]) tle[k] = oldTle[k];

await fs.mkdir(OUT, { recursive: true });
if (status.ok === 0 && old.events) {
  console.error("SOCRATES 조회가 모두 실패해 cdm.json을 바꾸지 않습니다.");
} else {
  const body = uniq.map(e => JSON.stringify(e)).join(",\n");
  const tbody = Object.keys(tle).sort((a, b) => a - b).map(k => JSON.stringify(k) + ":" + JSON.stringify(tle[k])).join(",\n");
  await fs.writeFile(new URL("cdm.json", OUT), `{"at":${now},"src":"CelesTrak SOCRATES","window":${JSON.stringify(win)},"events":[\n${body}\n],"tle":{\n${tbody}\n}}\n`);
}
await fs.writeFile(new URL("cdm-status.json", OUT), JSON.stringify(status) + "\n");
console.log(JSON.stringify({ ...status, sample: status.sample ? status.sample.slice(0, 200) : null }, null, 1));
