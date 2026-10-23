// 서버 쪽 기사 번역 (영어 등 → 한국어)
// 순서: 1) 이전 실행 번역 재사용(collect.mjs)  2) Google 번역 경로 4가지 중 지금 되는 것  3) DeepL Free(DEEPL_API_KEY가 있을 때)
//       4) MyMemory(공개 API, 하루 제한이 있어 남은 것 일부만)
// 실행 시작 때 각 경로에 짧은 문장을 보내 보고, 되는 경로만 쓴다. 실패 사유는 status.json의 translate.errors에 남는다.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HG = /[가-힣]/;

async function req(url, opt = {}, ms = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { ...opt, headers: { "User-Agent": UA, "Accept-Language": "ko,en;q=0.8", ...(opt.headers || {}) }, signal: ac.signal });
    const body = await r.text();
    if (!r.ok) throw new Error("HTTP " + r.status);
    return body;
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "시간 초과" : e.message);
  } finally { clearTimeout(t); }
}
const json = s => { try { return JSON.parse(s); } catch { throw new Error("응답 형식 오류(" + s.slice(0, 40).replace(/\s+/g, " ") + ")"); } };
const unhtml = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// 각 경로: 줄바꿈으로 묶은 텍스트 하나를 받아 번역문을 돌려준다
const G = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t";
const ENGINES = [
  { name: "google-post", max: 4000, run: async q => json(await req(G, { method: "POST", body: "q=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" } }))[0].map(x => x[0]).join("") },
  { name: "google-get", max: 1500, run: async q => json(await req(G + "&q=" + encodeURIComponent(q)))[0].map(x => x[0]).join("") },
  { name: "google-dict", max: 1500, run: async q => {
      const j = json(await req("https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=ko&q=" + encodeURIComponent(q)));
      const f = Array.isArray(j[0]) ? j[0][0] : j[0];
      if (typeof f !== "string") throw new Error("응답 형식 오류");
      return f;
    } },
  { name: "google-mobile", max: 1500, run: async q => {
      const h = await req("https://translate.google.com/m?sl=auto&tl=ko&hl=ko&q=" + encodeURIComponent(q));
      const m = h.match(/class="result-container">([\s\S]*?)<\/div>/);
      if (!m) throw new Error("결과 없음");
      return unhtml(m[1]);
    } },
];

async function probe(errors) {
  const ok = [];
  for (const e of ENGINES) {
    try {
      const t = await e.run("The rocket launched the satellite.");
      if (HG.test(t)) ok.push(e); else errors[e.name] = "번역되지 않은 응답";
    } catch (x) { errors[e.name] = x.message; }
    await sleep(300);
  }
  return ok;
}

// 묶음으로 보내고, 줄 수가 어긋나면 한 건씩
async function viaEngines(texts, engines, out, errors) {
  let ei = 0;
  for (let c = 0; c < texts.length && ei < engines.length;) {
    if (out[c] != null) { c++; continue; }
    const e = engines[ei];
    let n = 0, len = 0;
    while (c + n < texts.length && n < 15 && out[c + n] == null && len + texts[c + n].length < e.max) len += texts[c + n++].length + 1;
    n = Math.max(n, 1);
    const ch = texts.slice(c, c + n).map(s => s.replace(/\n/g, " ").slice(0, e.max));
    try {
      const t = (await e.run(ch.join("\n"))).split("\n").filter(x => x.trim());
      if (t.length === ch.length) t.forEach((x, k) => (out[c + k] = x.trim()));
      else for (let k = 0; k < ch.length; k++) { try { out[c + k] = (await e.run(ch[k])).trim(); } catch {} await sleep(250); }
      c += n;
    } catch (x) {
      errors[e.name] = x.message;
      if (/HTTP (403|429)|시간 초과/.test(x.message)) { ei++; continue; } // 막히면 다음 경로로 같은 묶음 재시도
      c += n;
    }
    await sleep(350);
  }
}

async function deepl(texts, idx, out, key, errors) {
  const host = /:fx$/.test(key) ? "https://api-free.deepl.com" : "https://api.deepl.com";
  for (let c = 0; c < idx.length; c += 40) {
    const ch = idx.slice(c, c + 40);
    try {
      const j = json(await req(host + "/v2/translate", { method: "POST", body: JSON.stringify({ text: ch.map(i => texts[i]), target_lang: "KO" }),
        headers: { "Content-Type": "application/json", Authorization: "DeepL-Auth-Key " + key } }));
      j.translations.forEach((x, k) => (out[ch[k]] = x.text));
    } catch (e) { errors.deepl = e.message; if (/HTTP (456|403)/.test(e.message)) break; }
  }
}

async function mymemory(texts, idx, out, errors, budget = 4500) {
  for (const i of idx) {
    const q = texts[i].slice(0, 480);
    if ((budget -= q.length) < 0) break;
    try {
      const j = json(await req("https://api.mymemory.translated.net/get?langpair=en|ko&q=" + encodeURIComponent(q)));
      const t = j?.responseData?.translatedText;
      if (j.responseStatus != 200 || !t || /MYMEMORY WARNING/i.test(t)) { errors.mymemory = String(j.responseDetails || j.responseStatus).slice(0, 80); break; }
      out[i] = t;
    } catch (e) { errors.mymemory = e.message; break; }
    await sleep(300);
  }
}

/**
 * jobs: [{ key, text }] 중복 key는 한 번만 번역
 * 반환: { map: Map(key → 번역문), stat }
 */
export async function translateAll(jobs, { max = 400 } = {}) {
  const uniq = [...new Map(jobs.filter(j => j.text).map(j => [j.key, j.text])).entries()].slice(0, max);
  const keys = uniq.map(u => u[0]), texts = uniq.map(u => u[1]);
  const out = new Array(texts.length).fill(null), errors = {};
  const stat = { asked: texts.length, engines: [], google: 0, deepl: 0, mymemory: 0, fail: 0, errors };
  const map = new Map();
  if (!texts.length) return { map, stat };
  const count = () => out.filter(x => x != null).length;

  const ok = await probe(errors);
  stat.engines = ok.map(e => e.name);
  if (ok.length) await viaEngines(texts, ok, out, errors);
  stat.google = count();

  const left = () => out.map((x, i) => (x == null ? i : -1)).filter(i => i >= 0);
  const key = process.env.DEEPL_API_KEY;
  if (left().length && key) { await deepl(texts, left(), out, key, errors); stat.deepl = count() - stat.google; }
  if (left().length) { const b = count(); await mymemory(texts, left(), out, errors); stat.mymemory = count() - b; }

  out.forEach((t, i) => { if (t) map.set(keys[i], t); });
  stat.fail = texts.length - map.size;
  return { map, stat };
}
