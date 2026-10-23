// 우주 동향 대시보드 데이터 수집기
// GitHub Actions에서 3시간마다 실행되어 data/ 폴더에 JSON을 만든다.
//   data/news.json      : RSS 피드별 최근 기사 (필터링·분류는 대시보드가 담당)
//   data/launches.json  : Launch Library 2 예정/최근 발사
//   data/satcat.json    : CelesTrak SATCAT 국가별 위성 집계 (하루 1회)
//   data/status.json    : 각 수집 단계의 성공/실패 기록
import { XMLParser } from "fast-xml-parser";
import fs from "node:fs/promises";
import { calc } from "./satcat-calc.mjs";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("data/", ROOT);
const FEEDS = JSON.parse(await fs.readFile(new URL("scripts/feeds.json", ROOT), "utf8"));
const UA = "Mozilla/5.0 (compatible; SpaceTrendDashboard/1.0; GitHub Actions)";
const DAYS = 8;          // 대시보드는 7일 기준, 경계 여유 1일
const PER_FEED = 30;     // 피드당 최대 기사 수
const SATCAT_EVERY = 20 * 36e5; // SATCAT은 20시간에 한 번만 (CelesTrak 요청 제한 대비)
const now = Date.now();
const status = { at: now, feeds: [], launches: null, satcat: null };

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
    .filter(x => x.t && /^https?:\/\//.test(x.u) && x.p && Date.parse(x.p) >= cut)
    .sort((a, b) => (a.p < b.p ? 1 : -1))
    .slice(0, PER_FEED);
}
async function collectNews() {
  const feeds = {};
  await Promise.all(FEEDS.map(async f => {
    try {
      const items = parseFeed(await fetchText(f.url, 30000, "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"), f);
      feeds[f.url] = { ok: 1, items };
      status.feeds.push({ name: f.name, ok: 1, n: items.length });
    } catch (e) {
      feeds[f.url] = { ok: 0, err: e.message, items: [] };
      status.feeds.push({ name: f.name, ok: 0, err: e.message });
    }
  }));
  // 전체 실패면 이전 파일을 지우지 않는다
  if (!Object.values(feeds).some(f => f.ok)) throw new Error("모든 피드 수집 실패");
  await writeNews({ at: now, feeds });
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
