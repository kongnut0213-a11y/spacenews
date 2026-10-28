// 우주 동향 대시보드 데이터 수집기
// GitHub Actions에서 3시간마다 실행되어 data/ 폴더에 JSON을 만든다.
//   data/news.json      : RSS 피드별 최근 기사 (필터링·분류는 대시보드가 담당)
//   data/launches.json  : Launch Library 2 예정/최근 발사
//   data/satcat.json    : CelesTrak SATCAT 국가별 위성 집계 (하루 1회)
//   data/status.json    : 각 수집 단계의 성공/실패 기록
import { XMLParser } from "fast-xml-parser";
import fs from "node:fs/promises";
import { calc } from "./satcat-calc.mjs";
import { pre, HG } from "./text-prep.mjs";
import { translateAll } from "./translate.mjs";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("data/", ROOT);
const FEEDS = JSON.parse(await fs.readFile(new URL("scripts/feeds.json", ROOT), "utf8"));
const UA = "Mozilla/5.0 (compatible; SpaceTrendDashboard/1.0; GitHub Actions)";
const DAYS = 8;          // 대시보드는 7일 기준, 경계 여유 1일
const PER_FEED = 30;     // 피드 1회 수집 시 최대 기사 수
const KEEP = 60;         // 피드별로 누적 보관하는 최대 기사 수 (3시간마다 수집한 기사를 8일간 이어 붙임)
// 국내 종합지(kind "kr")는 제목에 우주 관련 낱말이 있는 기사만 남긴다 (대시보드 SPK와 같음)
const SPK = /우주|위성|궤도|발사체|누리호|로켓|우주항공청|우주청|항우연|천리안|아리랑|다누리|\bKPS\b|425 ?사업|아나시스|정찰위성|통신위성/;
// 네이버 뉴스 검색 API (선택): 저장소 Secrets에 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET이 있으면 사용
const NAVER_ID = process.env.NAVER_CLIENT_ID || "", NAVER_SECRET = process.env.NAVER_CLIENT_SECRET || "";
const NAVER_Q = ["정찰위성", "군 통신위성", "425사업", "아나시스", "군 위성", "우주작전", "우주항공청", "누리호", "발사체", "인공위성",
  "위성 발사", "차세대중형위성", "아리랑위성", "천리안위성", "초소형위성", "큐브위성", "한국형위성항법", "우주산업", "항공우주연구원", "우주 스타트업"];
const PRESS = { "yna.co.kr": "연합뉴스", "yonhapnewstv.co.kr": "연합뉴스TV", "newsis.com": "뉴시스", "news1.kr": "뉴스1", "chosun.com": "조선일보", "joongang.co.kr": "중앙일보",
  "donga.com": "동아일보", "hani.co.kr": "한겨레", "khan.co.kr": "경향신문", "hankookilbo.com": "한국일보", "seoul.co.kr": "서울신문", "kmib.co.kr": "국민일보",
  "segye.com": "세계일보", "munhwa.com": "문화일보", "mk.co.kr": "매일경제", "hankyung.com": "한국경제", "sedaily.com": "서울경제", "mt.co.kr": "머니투데이",
  "edaily.co.kr": "이데일리", "asiae.co.kr": "아시아경제", "fnnews.com": "파이낸셜뉴스", "heraldcorp.com": "헤럴드경제", "etnews.com": "전자신문", "dt.co.kr": "디지털타임스",
  "zdnet.co.kr": "지디넷코리아", "hellodd.com": "헬로디디", "dongascience.com": "동아사이언스", "kookbang.dema.mil.kr": "국방일보", "gukbangnews.com": "국방신문",
  "kbs.co.kr": "KBS", "imbc.com": "MBC", "sbs.co.kr": "SBS", "ytn.co.kr": "YTN", "jtbc.co.kr": "JTBC", "ichannela.com": "채널A", "mbn.co.kr": "MBN",
  "nocutnews.co.kr": "노컷뉴스", "ohmynews.com": "오마이뉴스", "pressian.com": "프레시안", "dailian.co.kr": "데일리안", "newspim.com": "뉴스핌", "ajunews.com": "아주경제",
  "bloter.net": "블로터", "aitimes.com": "AI타임스", "sciencetimes.co.kr": "사이언스타임즈", "newsspace.kr": "뉴스스페이스", "n.news.naver.com": "네이버 뉴스" };
const pressOf = u => { try { const h = new URL(u).hostname.replace(/^(www|m|news|biz|en)\./, ""); for (const k in PRESS) if (h === k || h.endsWith("." + k)) return PRESS[k]; return h; } catch { return ""; } };
const SATCAT_EVERY = 20 * 36e5; // SATCAT은 20시간에 한 번만 (CelesTrak 요청 제한 대비)
const now = Date.now();
const status = { at: now, feeds: [], translate: null, launches: null, satcat: null };

async function fetchText(url, ms = 30000, accept = "*/*") {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": UA, Accept: accept } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "시간 초과" : e.message);
  } finally {
    clearTimeout(t);
  }
}
async function readJSON(name) {
  try { return JSON.parse(await fs.readFile(new URL(name, OUT), "utf8")); } catch { return null; }
}
async function writeJSON(name, obj) {
  await fs.writeFile(new URL(name, OUT), JSON.stringify(obj) + "\n");
}
// 기사 한 건을 한 줄로 쓰면 실행마다 바뀐 기사만 git 변경분이 된다
async function writeNews(obj) {
  const J = JSON.stringify;
  const body = Object.entries(obj.feeds).map(([u, f]) =>
    J(u) + ':{"ok":' + f.ok + (f.err ? ',"err":' + J(f.err) : "") + ',"items":[' +
    f.items.map(i => "\n" + J(i)).join(",") + "]}").join(",\n");
  await fs.writeFile(new URL("news.json", OUT), '{"at":' + obj.at + ',"feeds":{\n' + body + "\n}}\n");
}

// ---------- RSS ----------
const xp = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#t", processEntities: true, htmlEntities: true });
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const txt = v => {
  if (v == null) return "";
  if (Array.isArray(v)) return txt(v[0]);
  if (typeof v === "object") return String(v["#t"] ?? "");
  return String(v);
};
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", middot: "·", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—" };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isNaN(n) ? m : String.fromCodePoint(n); }
    return ENT[e.toLowerCase()] ?? m;
  });
}
function plain(html, max = 600) {
  let s = decode(String(html || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>/gi, " ").replace(/<[^>]+>/g, " "));
  s = decode(s).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) : s;
}
function firstImg(html) {
  const m = String(html || "").match(/<img[^>]+src=["']([^"']+)/i);
  return m ? decode(m[1]) : "";
}
function toISO(s, tz) {
  s = String(s || "").trim();
  if (!s) return "";
  // 국내 CMS의 "2026-10-22 18:05:00" 형식은 시간대가 없으므로 피드 시간대(KST)를 붙인다
  if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?$/.test(s)) s = s.replace(" ", "T") + (s.length === 16 ? ":00" : "") + (tz || "Z");
  // "Tue,20 Oct 2026" 처럼 쉼표 뒤 공백이 빠진 경우 보정
  s = s.replace(/^([A-Za-z]{3}),(\S)/, "$1, $2");
  const d = new Date(s);
  return isNaN(d) ? "" : d.toISOString();
}
function parseFeed(xml, feed) {
  const doc = xp.parse(xml);
  const out = [];
  const rssItems = arr(doc?.rss?.channel?.item ?? doc?.["rdf:RDF"]?.item);
  for (const i of rssItems) {
    const desc = txt(i.description) || txt(i["content:encoded"]);
    const encl = arr(i.enclosure).find(e => /image/.test(e?.["@type"] || "") || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(e?.["@url"] || ""));
    const media = arr(i["media:content"])[0]?.["@url"] || arr(i["media:thumbnail"])[0]?.["@url"];
    out.push({
      t: plain(txt(i.title), 300),
      d: plain(desc),
      u: txt(i.link).trim() || txt(i.guid).trim(),
      p: toISO(txt(i.pubDate) || txt(i["dc:date"]), feed.tz),
      im: media || encl?.["@url"] || firstImg(desc) || firstImg(txt(i["content:encoded"])),
      cg: arr(i.category).map(txt).join(" "),
    });
  }
  for (const e of arr(doc?.feed?.entry)) { // Atom
    const link = arr(e.link).find(l => !l["@rel"] || l["@rel"] === "alternate")?.["@href"] || arr(e.link)[0]?.["@href"] || "";
    const body = txt(e.summary) || txt(e.content);
    out.push({
      t: plain(txt(e.title), 300), d: plain(body), u: link,
      p: toISO(txt(e.published) || txt(e.updated), feed.tz),
      im: arr(e["media:thumbnail"])[0]?.["@url"] || firstImg(txt(e.content)),
      cg: arr(e.category).map(c => c?.["@term"] || txt(c)).join(" "),
    });
  }
  const cut = now - DAYS * 864e5;
  return out
    .filter(x => x.t && /^https?:\/\//.test(x.u) && x.p && Date.parse(x.p) >= cut && (feed.kind !== "kr" || SPK.test(x.t)))
    .sort((a, b) => (a.p < b.p ? 1 : -1))
    .slice(0, PER_FEED);
}
// 이전 실행에서 모은 기사와 합친다: 주소 기준 중복 제거, 8일 이내, 최신순 KEEP건
function mergeOld(items, oldItems) {
  const cut = now - DAYS * 864e5, seen = new Set(), out = [];
  for (const x of items.concat(oldItems || [])) {
    if (!x || !x.u || seen.has(x.u) || !x.p || Date.parse(x.p) < cut) continue;
    seen.add(x.u); out.push(x);
  }
  return out.sort((a, b) => (a.p < b.p ? 1 : -1)).slice(0, KEEP);
}
async function naverNews() {
  const out = [], seenT = new Set(), cut = now - DAYS * 864e5;
  for (const q of NAVER_Q) {
    const r = await fetch("https://openapi.naver.com/v1/search/news.json?display=30&sort=date&query=" + encodeURIComponent(q), {
      headers: { "X-Naver-Client-Id": NAVER_ID, "X-Naver-Client-Secret": NAVER_SECRET } });
    if (!r.ok) throw new Error("네이버 HTTP " + r.status);
    for (const i of (await r.json()).items || []) {
      const t = plain(i.title, 300), u = (i.originallink || i.link || "").trim(), p = toISO(i.pubDate);
      const tk = t.replace(/\s+/g, "");
      if (!t || !/^https?:\/\//.test(u) || !p || Date.parse(p) < cut || !SPK.test(t) || seenT.has(tk)) continue;
      seenT.add(tk);
      out.push({ t, d: plain(i.description), u, p, im: "", cg: q, sn: pressOf(u) });
    }
  }
  return out;
}
async function collectNews() {
  const feeds = {}, old = (await readJSON("news.json"))?.feeds || {};
  const jobs = FEEDS.map(f => [f.url, f.name, () => fetchText(f.url, 30000, "application/rss+xml, application/atom+xml, application/xml, text/xml, */*").then(x => parseFeed(x, f))]);
  if (NAVER_ID && NAVER_SECRET) jobs.push(["naver:news", "네이버 뉴스 검색", naverNews]);
  await Promise.all(jobs.map(async ([url, name, run]) => {
    try {
      const items = mergeOld(await run(), old[url]?.items);
      feeds[url] = { ok: 1, items };
      status.feeds.push({ name, ok: 1, n: items.length });
    } catch (e) {
      // 수집 실패 시 이전에 모은 기사를 그대로 유지
      const items = mergeOld([], old[url]?.items);
      feeds[url] = { ok: items.length ? 1 : 0, err: e.message, items };
      status.feeds.push({ name, ok: 0, err: e.message, kept: items.length });
    }
  }));
  // 전체 실패면 이전 파일을 지우지 않는다
  if (!Object.values(feeds).some(f => f.ok)) throw new Error("모든 피드 수집 실패");
  await translateNews(feeds);
  await writeNews({ at: now, feeds });
}

// ---------- 번역 ----------
// 대시보드가 번역에 쓰는 원문과 똑같이 만든다: 제목 그대로, 요약은 앞 220자에서 앞 2문장
const descSrc = d => pre(String(d || "").trim().slice(0, 220));
async function translateNews(feeds) {
  try {
    const old = await readJSON("news.json"), cache = new Map();
    for (const f of Object.values(old?.feeds || {})) for (const i of f.items || []) if (i.kt) cache.set(i.u, i);
    const items = Object.values(feeds).flatMap(f => f.items).filter(i => !HG.test(i.t));
    const jobs = [];
    let reused = 0;
    for (const i of items) {
      const c = cache.get(i.u);
      if (c && c.t === i.t) { i.kt = c.kt; if (c.kd) i.kd = c.kd; reused++; continue; }
      jobs.push({ key: "t:" + i.t, text: i.t });
      const ds = descSrc(i.d);
      if (ds) jobs.push({ key: "d:" + ds, text: ds });
    }
    const { map, stat } = await translateAll(jobs);
    for (const i of items) {
      if (i.kt) continue;
      const kt = map.get("t:" + i.t);
      if (!kt) continue;
      i.kt = kt;
      const kd = map.get("d:" + descSrc(i.d));
      if (kd) i.kd = kd;
    }
    status.translate = { ok: 1, reused, ...stat };
  } catch (e) {
    status.translate = { ok: 0, err: e.message }; // 번역 실패해도 기사 저장은 계속
  }
}

// ---------- 발사 일정 ----------
async function collectLaunches() {
  const LU = "https://ll.thespacedevs.com/2.2.0/launch/";
  const trim = x => ({
    id: x.id, name: x.name, net: x.net,
    status: x.status ? { abbrev: x.status.abbrev, name: x.status.name } : null,
    rocket: { configuration: { name: x.rocket?.configuration?.name || "" } },
    mission: x.mission ? { name: x.mission.name } : null,
    pad: x.pad ? { latitude: x.pad.latitude, longitude: x.pad.longitude, name: x.pad.name, location: { name: x.pad.location?.name || "" } } : null,
  });
  const [up, prev] = await Promise.all([
    fetchText(LU + "upcoming/?limit=40&mode=normal", 40000, "application/json"),
    fetchText(LU + "previous/?limit=40&mode=normal", 40000, "application/json"),
  ]);
  const U = JSON.parse(up).results.map(trim), V = JSON.parse(prev).results.map(trim);
  await writeJSON("launches.json", { at: now, up: U, prev: V });
  status.launches = { ok: 1, up: U.length, prev: V.length };
}

// ---------- SATCAT ----------
async function collectSatcat() {
  const old = await readJSON("satcat.json");
  const force = /^(1|true|yes)$/i.test(process.env.FORCE_SATCAT || "");
  if (old?.at && now - old.at < SATCAT_EVERY && !force) {
    status.satcat = { ok: 1, skip: "최근 집계 유지", at: old.at };
    return;
  }
  const csv = await fetchText("https://celestrak.org/pub/satcat.csv", 180000, "text/csv, */*");
  if (csv.indexOf("OBJECT_TYPE") < 0 || csv.length < 1e6) throw new Error("응답 이상 (" + (csv.length / 1e6).toFixed(1) + "MB)");
  const D = calc(csv);
  await writeJSON("satcat.json", D);
  status.satcat = { ok: 1, at: D.at };
}

await fs.mkdir(OUT, { recursive: true });
const steps = [["news", collectNews], ["launches", collectLaunches], ["satcat", collectSatcat]];
for (const [k, fn] of steps) {
  try { await fn(); }
  catch (e) {
    console.error(k, "실패:", e.message);
    if (k !== "news") status[k] = { ok: 0, err: e.message };
    else status.news = { ok: 0, err: e.message };
  }
}
await writeJSON("status.json", status);
console.log(JSON.stringify(status, null, 1));
