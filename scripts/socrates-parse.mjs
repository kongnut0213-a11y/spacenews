// CelesTrak SOCRATES 결과표(HTML) → 접근 이벤트 배열
// 표는 한 이벤트가 두 줄: 1행(1번 물체: NORAD, 이름, DSE, TCA, 최소거리, 상대속도), 2행(2번 물체: NORAD, 이름, DSE, 최대확률, 희석임계거리)
const ent = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const INT = /^\d{1,6}$/, NUM = /^-?\d+(\.\d+)?$/, TCA = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(\.\d+)?)$/, PROB = /^\d+(\.\d+)?E[-+]\d+$/i;

export function htmlRows(html) {
  const body = String(html || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const rows = [];
  for (const tr of body.split(/<tr[\s>]/i).slice(1)) {
    const seg = tr.split(/<\/tr>/i)[0];
    const cells = [];
    const re = /<t[dh][^>]*>([\s\S]*?)(?=<t[dh][\s>]|<\/t[dh]>|$)/gi;
    let m;
    while ((m = re.exec(seg))) cells.push(ent(m[1].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim());
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function splitName(s) {
  const m = String(s).match(/^(.*?)\s*\[([^\]]*)\]\s*$/);
  return m ? { n: m[1].trim(), st: m[2].trim() } : { n: String(s).trim(), st: "" };
}

export function parseSocrates(html) {
  const rows = htmlRows(html), out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const ti = r.findIndex(c => TCA.test(c));
    if (ti < 0) continue;
    const ni = r.findIndex(c => INT.test(c));
    if (ni < 0 || ni > ti) continue;
    const a = splitName(r[ni + 1] || "");
    const dse1 = NUM.test(r[ti - 1] || "") ? +r[ti - 1] : null;
    const rng = +r[ti + 1], vrel = +r[ti + 2];
    // 2행
    const s = rows[i + 1] || [];
    const si = s.findIndex(c => INT.test(c));
    if (si < 0) continue;
    const b = splitName(s[si + 1] || "");
    const pi = s.findIndex(c => PROB.test(c));
    const dse2 = NUM.test(s[si + 2] || "") ? +s[si + 2] : null;
    const m = r[ti].match(TCA);
    out.push({
      p: +r[ni], pn: a.n, ps: a.st, s: +s[si], sn: b.n, ss: b.st,
      tca: `${m[1]}T${m[2]}Z`, rng, vrel,
      prob: pi >= 0 ? +s[pi] : null, dil: pi >= 0 && NUM.test(s[pi + 1] || "") ? +s[pi + 1] : null,
      dse1, dse2
    });
    i++;
  }
  return out.filter(e => Number.isFinite(e.rng) && Number.isFinite(e.p) && Number.isFinite(e.s));
}

// 계산 구간: "Start = 2026 Oct 23 11:00:00 UTC, Stop = 2026 Oct 30 11:00:00 UTC"
export function parseWindow(html) {
  const t = ent(String(html || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const M = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const f = k => { const m = t.match(new RegExp(k + "\\s*=\\s*(\\d{4}) (\\w{3}) (\\d{1,2}) (\\d{2}):(\\d{2}):(\\d{2})")); return m ? Date.UTC(+m[1], M[m[2]], +m[3], +m[4], +m[5], +m[6]) : null; };
  return { start: f("Start"), stop: f("Stop") };
}
