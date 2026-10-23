// 서버 쪽 기사 번역 (영어 등 → 한국어)
// 순서: 1) 이전 실행에서 번역해 둔 결과 재사용  2) Google 번역(비공식 경로)  3) DeepL Free API (DEEPL_API_KEY가 있을 때만)
// 번역 결과는 news.json 기사 항목의 kt(제목), kd(요약)로 저장된다.
const UA = "Mozilla/5.0 (compatible; SpaceTrendDashboard/1.0; GitHub Actions)";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(url, body, headers, ms = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", body, headers: { "User-Agent": UA, ...headers }, signal: ac.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Google: 여러 문장을 줄바꿈으로 묶어 한 번에 보내고, 줄 수가 맞지 않으면 한 건씩 다시 보낸다
async function gtxOne(text) {
  const j = await post("https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t",
    "q=" + encodeURIComponent(text), { "Content-Type": "application/x-www-form-urlencoded" });
  return j[0].map(x => x[0]).join("");
}
async function gtx(texts) {
  const out = new Array(texts.length).fill(null);
  for (let c = 0; c < texts.length;) {
    let n = 0, len = 0;
    while (c + n < texts.length && n < 15 && len + texts[c + n].length < 4000) len += texts[c + n++].length + 1;
    n = Math.max(n, 1);
    const ch = texts.slice(c, c + n).map(s => s.replace(/\n/g, " "));
    try {
      const t = (await gtxOne(ch.join("\n"))).split("\n").filter(x => x.trim());
      if (t.length === ch.length) t.forEach((x, k) => (out[c + k] = x.trim()));
      else for (let k = 0; k < ch.length; k++) { try { out[c + k] = (await gtxOne(ch[k])).trim(); } catch {} await sleep(300); }
    } catch (e) {
      if (/HTTP 429|HTTP 403/.test(e.message)) break; // 차단되면 남은 건 다음 경로로
    }
    c += n;
    await sleep(400);
  }
  return out;
}

async function deepl(texts, key) {
  const host = /:fx$/.test(key) ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const out = new Array(texts.length).fill(null);
  for (let c = 0; c < texts.length; c += 40) {
    const ch = texts.slice(c, c + 40);
    try {
      const j = await post(host + "/v2/translate", JSON.stringify({ text: ch, target_lang: "KO" }),
        { "Content-Type": "application/json", Authorization: "DeepL-Auth-Key " + key });
      j.translations.forEach((x, k) => (out[c + k] = x.text));
    } catch (e) {
      if (/HTTP 456|HTTP 403/.test(e.message)) break; // 월 한도 초과 또는 키 오류
    }
  }
  return out;
}

/**
 * jobs: [{ key, text }] 중복 key는 한 번만 번역
 * 반환: { map: Map(key → 번역문), stat }
 */
export async function translateAll(jobs, { max = 400 } = {}) {
  const uniq = [...new Map(jobs.filter(j => j.text).map(j => [j.key, j.text])).entries()].slice(0, max);
  const keys = uniq.map(u => u[0]), texts = uniq.map(u => u[1]);
  const map = new Map(), stat = { asked: texts.length, google: 0, deepl: 0, fail: 0 };
  if (!texts.length) return { map, stat };

  const g = await gtx(texts);
  g.forEach((t, i) => { if (t) { map.set(keys[i], t); stat.google++; } });

  const left = keys.map((k, i) => i).filter(i => !map.has(keys[i]));
  const key = process.env.DEEPL_API_KEY;
  if (left.length && key) {
    const d = await deepl(left.map(i => texts[i]), key);
    d.forEach((t, k) => { if (t) { map.set(keys[left[k]], t); stat.deepl++; } });
  }
  stat.fail = texts.length - map.size;
  return { map, stat };
}
