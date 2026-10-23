// 궤도분석 모델용 TLE 수집기 (GitHub Actions에서 3시간마다 실행)
//   입력: scripts/tle-norads.txt  (모델이 쓰는 NORAD 번호, 한 줄에 하나, # 뒤는 주석)
//   출력: data/tle.json           ({ at, count, missing, sats: { "NORAD": { n, l1, l2, s } } })
//         data/tle.txt            (같은 내용을 3행 TLE 텍스트로 — PC에 내려받아 수동 불러오기용)
// 순서: CelesTrak active 일괄 목록 1회 → 없는 번호만 CATNR 개별 조회(위성당 하루 1회, 실행당 최대 40기, 1.2초 간격)
//       → 그래도 없으면 직전 tle.json 값을 유지(s에 '이전값' 표시)
import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("data/", ROOT);
const UA = "Mozilla/5.0 (compatible; SpaceTrendDashboard-TLE/1.0; GitHub Actions)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = Date.now();

async function get(url, ms = 60000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": UA } });
    const s = await r.text();
    if (!r.ok) throw new Error("HTTP " + r.status);
    return s;
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "시간 초과" : e.message);
  } finally { clearTimeout(t); }
}

function parse3le(txt) {
  const L = String(txt || "").split(/\r?\n/).map(x => x.trimEnd()).filter(x => x.trim());
  const m = new Map();
  for (let i = 0; i < L.length - 1; i++) {
    const a = L[i].trim(), b = L[i + 1].trim();
    if (a.startsWith("1 ") && b.startsWith("2 ") && a.length >= 69 && b.length >= 69) {
      const norad = String(parseInt(a.substring(2, 7), 10));
      const prev = i > 0 ? L[i - 1].trim() : "";
      const n = prev && !prev.startsWith("1 ") && !prev.startsWith("2 ") ? prev.replace(/^0\s+/, "") : "";
      m.set(norad, { n, l1: a, l2: b });
      i++;
    }
  }
  return m;
}

const want = (await fs.readFile(new URL("scripts/tle-norads.txt", ROOT), "utf8"))
  .split(/\r?\n/).map(l => l.replace(/#.*/, "").trim()).filter(l => /^\d+$/.test(l)).map(l => String(+l));
const wantSet = [...new Set(want)];
let old = {}, oldTried = {};
try { const o = JSON.parse(await fs.readFile(new URL("tle.json", OUT), "utf8")); old = o.sats || {}; oldTried = o.tried || {}; } catch {}

const status = { at: now, want: wantSet.length, active: null, catnr: { tried: 0, ok: 0, err: null }, kept: 0, missing: [] };
const sats = {};

try {
  const act = parse3le(await get("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle", 120000));
  let hit = 0;
  for (const k of wantSet) { const v = act.get(k); if (v) { sats[k] = { ...v, s: "CelesTrak active", f: now }; hit++; } }
  status.active = { ok: 1, total: act.size, hit };
} catch (e) {
  status.active = { ok: 0, err: e.message };
}

// active 목록에 없는 번호(비활성 분류·분석대상 물체 등)만 개별 조회
// 직전 24시간 안에 개별 조회를 시도한 번호는 건너뛴다(CelesTrak 부담 줄이기)
const recent = k => now - ((old[k] && old[k].f) || oldTried[k] || 0) < 864e5;
const need = wantSet.filter(k => !sats[k] && !recent(k)).slice(0, 40);
const tried = new Set(need);
for (const k of need) {
  status.catnr.tried++;
  try {
    const v = parse3le(await get(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${k}&FORMAT=tle`, 30000)).get(k);
    if (v) { sats[k] = { ...v, s: "CelesTrak CATNR", f: now }; status.catnr.ok++; }
  } catch (e) {
    status.catnr.err = e.message;
    if (/HTTP (403|429)/.test(e.message)) break; // 요청 제한이면 이번 실행은 중단
  }
  await sleep(1200);
}

for (const k of wantSet) {
  if (sats[k]) continue;
  if (old[k]) { sats[k] = { ...old[k], s: String(old[k].s || "").replace(/ · 이전값$/, "") + " · 이전값" }; if (tried.has(k)) sats[k].f = now; status.kept++; }
  else status.missing.push(k);
}
// 어디에도 없는 번호는 마지막 조회 시각만 기록해 하루 동안 다시 묻지 않는다
const triedOut = {};
for (const k of status.missing) { const t = tried.has(k) ? now : oldTried[k]; if (t) triedOut[k] = t; }

const fresh = Object.values(sats).filter(v => !/이전값/.test(v.s)).length;
if (fresh === 0) {
  console.error("새로 받은 TLE가 없어 tle.json을 바꾸지 않습니다.", JSON.stringify(status));
} else {
  await fs.mkdir(OUT, { recursive: true });
  const keys = Object.keys(sats).sort((a, b) => a - b);
  // 위성 한 기를 한 줄로 써서 git 변경분을 작게 유지
  const body = keys.map(k => JSON.stringify(k) + ":" + JSON.stringify(sats[k])).join(",\n");
  await fs.writeFile(new URL("tle.json", OUT), `{"at":${now},"count":${keys.length},"missing":${JSON.stringify(status.missing)},"tried":${JSON.stringify(triedOut)},"sats":{\n${body}\n}}\n`);
  await fs.writeFile(new URL("tle.txt", OUT), keys.map(k => `${sats[k].n || "NORAD " + k}\n${sats[k].l1}\n${sats[k].l2}`).join("\n") + "\n");
}
await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(new URL("tle-status.json", OUT), JSON.stringify(status) + "\n");
console.log(JSON.stringify(status, null, 1));
