// 기사 분류(군사/일반)와 중복 묶기
// collect.mjs가 모든 피드를 모은 뒤 한 번 호출한다. 기사를 지우지 않고 아래 필드만 붙인다.
//   c  : "mil" | "gen"            최종 범주 (한 기사는 한 범주에만 들어감)
//   cx : 1                        군·민 겸용 또는 판정이 애매한 기사 (배지 표시용)
//   cs : [군사점수, 일반점수]       판정 근거 (조정할 때 확인용)
//   g  : "묶음 id"                 같은 사건을 다룬 기사끼리 같은 값 (대표 주소 해시라 실행마다 같음)
//   dp : "대표 기사 주소"           중복 기사에만 붙음 → 대시보드에서 숨기면 됨
//   nd : 숫자, dl : [{n,u}]        대표 기사에만 붙음 → "외 N건" 표시용
// 수동 보정은 scripts/news-overrides.json 에 { "기사 주소": "mil" | "gen" } 로 추가한다.

// ---------- 1. 분류 사전 ----------
// 강한 단서 3점, 약한 단서 1점, 제목에 나오면 3배. 한국어는 '군' 한 글자처럼 다른 낱말(위성군, 군집, 군산)에 섞이는 말을 쓰지 않는다.
const MIL_STRONG = [
  /\bspace force\b/i, /\bUSSF\b/, /\bUSSF-\d+/i, /\bspace command\b/i, /\bSPACECOM\b/i, /\bspace systems command\b/i,
  /\bspace operations command\b/i, /\bSpaceWERX\b/i, /\bNROL-?\d+/i, /\bNRO\b/, /\bnational reconnaissance office\b/i,
  /\bspace development agency\b/i, /\btranche [0-9]\b/i, /\bgolden dome\b/i,
  /\bmissile (warning|tracking|defen[cs]e|interceptor)s?\b/i, /\banti-satellite\b/i, /\bASAT\b/, /\bcounterspace\b/i,
  /\bpentagon\b/i, /\bdepartment of defen[cs]e\b/i, /\bDoD\b/, /\bdepartment of the air force\b/i, /\bministry of defen[cs]e\b/i,
  /\bair force\b/i, /\bU\.?S\.? army\b/i, /\bU\.?S\.? navy\b/i, /\bmarine corps\b/i, /\bNATO\b/, /\bbundeswehr\b/i,
  /\bPLA\b/, /\bstrategic support force\b/i, /\baerospace force\b/i, /\bwarfighter/i, /\bmilitary\b/i, /\bmilitaries\b/i,
  /\bspy satellite/i, /\breconnaissance satellite/i, /\bmissile\b/i, /\bhypersonic\b/i, /\bICBM\b/i, /\bwarfare\b/i,
  /\bdefen[cs]e (department|ministry|contractor|budget|secretary|bill)\b/i, /\b(space|nuclear) weapons?\b/i, /\bweapons?\b/i,
  /\bmunitions?\b/i, /\bammunition\b/i, /\bfrigates?\b/i, /\barmou?red\b/i, /\bcounter-drone\b/i, /\bF-(?:15|16|22|35|47)\b/,
  /\bNORAD\b/, /\b(?:CENT|NORTH|AFRI|INDOPA|EU|SOUTH|STRAT|CYBER|SPACE)COM\b/i, /\bLt\.? ?Gen\.?\s|\bGen\. [A-Z]/, /\btroops\b|\bsoldiers?\b/i,
  /국방부|국방장관|합참|합동참모|방위사업청|방사청|국방과학연구소|국방기술|군 ?정찰위성|정찰위성|425 ?사업|아나시스|군 통신위성|군위성|군 위성/,
  /공군|육군|해군|해병대|우주작전|전략사령부|우주사령부|우주군(?!집)|미사일|탄도|대륙간|극초음속|킬체인|한미 ?연합|주한미군|군사|전투기|무기체계|방산|국방/,
  /만리경|북한 ?(?:위성|발사)|중국군|인민해방군|방위성|방위청|자위대|핵무기|핵폭탄|우주무기|타격체계/,
];
const MIL_WEAK = [
  /\bdefen[cs]e\b/i, /\bnational security\b/i, /\bclassified\b/i, /\bsurveillance\b/i, /\bintelligence\b/i, /\bISR\b/,
  /\bDARPA\b/, /\bAFRL\b/i, /\bSDA\b/,  // SDA는 우주개발청과 우주영역인식(space domain awareness) 양쪽에 쓰여 약한 단서로 둠
  /\bradars?\b/i, /\bdrones?\b/i,
  /\b(?:Lockheed|Northrop|Raytheon|RTX|L3Harris|BAE Systems|Rheinmetall|Saab|General Dynamics|Anduril|Leonardo|Thales|Hanwha)\b/, /\bdual-use\b/i, /\bStarshield\b/i, /\bsovereign\b/i, /\bresilien(t|ce)\b/i,
  /안보|감시정찰|군 ?수요|국가안보|보안|타격|방위/,
];
const GEN_STRONG = [
  /\bNASA\b/, /\bartemis\b/i, /\btelescope\b/i, /\bJWST\b|\bWebb\b/, /\bHubble\b/i, /\bastronauts?\b/i, /\bcosmonauts?\b/i,
  /\bISS\b/, /\bspace station\b/i, /\bmars\b/i, /\basteroid/i, /\bcomet/i, /\bexoplanet/i, /\bgalax(y|ies)\b/i, /\bblack hole/i,
  /\baurora/i, /\beclipse/i, /\bmeteor/i, /\bnight sky\b/i, /\bscientists?\b/i, /\bESA\b/, /\bJAXA\b/i, /\bISRO\b/i,
  /\bIPO\b/, /\bfunding round\b/i, /\bseries [A-D]\b/i, /\btourism\b/i, /\bspace tourist/i,
  /천문|탐사선|탐사|우주정거장|누리호|다누리|항우연|항공우주연구원|천리안|아리랑|차세대중형위성|큐브위성|소행성|혜성|은하|블랙홀|망원경|오로라|일식|유성|우주인|우주비행사/,
  /스타트업|투자 유치|시리즈 ?[A-D]|우주관광|과학자|연구진/,
];
const GEN_WEAK = [
  /\bcommercial\b/i, /\bstartup/i, /\bStarship\b|\bSuper Heavy\b|\bNew Glenn\b|\bFalcon (?:9|Heavy)\b|\bElectron\b/, /\blanding\b|\breusab/i, /\bbroadband\b/i, /\bscience\b/i, /\bmoon\b|\blunar\b/i, /\bweather\b/i, /\bclimate\b/i,
  /우주항공청|우주청|민간|상업|기상|통신서비스|과학|상장/,
];

const count = (list, s) => { let n = 0; for (const re of list) if (re.test(s)) n++; return n; };
function score(text, title) {
  const mil = 3 * (3 * count(MIL_STRONG, title) + count(MIL_WEAK, title)) + 3 * count(MIL_STRONG, text) + count(MIL_WEAK, text);
  const gen = 3 * (3 * count(GEN_STRONG, title) + count(GEN_WEAK, title)) + 3 * count(GEN_STRONG, text) + count(GEN_WEAK, text);
  return [mil, gen];
}

// 출처 가산점: feeds.json의 prior("mil"/"gen") → 없으면 kind("usf","mil"이면 군사, 그 외 해외 피드는 일반)
const MIL_PRESS = /국방일보|국방신문|국방일보|Breaking Defense|DefenseScoop|Air & Space Forces|Defence Industry/i;
function priorOf(feed, item) {
  if (feed.prior) return feed.prior;
  if (feed.kind === "usf" || feed.kind === "mil") return "mil";
  if (item.sn && MIL_PRESS.test(item.sn)) return "mil";
  if (feed.kind === "kr" || feed.search) return "";          // 국내 종합지·검색 결과는 출처로 판단하지 않음
  return "gen";
}
const PRIOR_PTS = 3;

// 판정 규칙 (m, g는 출처 가산점을 더한 점수)
//   군사: m ≥ 4 이고 m - g ≥ 2. 단, 출처로 판단하지 않는 국내 종합지·검색 결과는 m ≥ 6, m - g ≥ 3 으로 더 엄격하게
//   일반: 군사 단서가 전혀 없거나, m < 3 이거나, g ≥ m
//   그 사이(회색지대)는 출처가 군사 매체면 군사, 아니면 일반으로 넣고 cx=1 표시
function decide(mil, gen, prior) {
  const m = mil + (prior === "mil" ? PRIOR_PTS : 0), g = gen + (prior === "gen" ? PRIOR_PTS : 0);
  const cs = [m, g];
  // 군사 단서가 하나도 없으면 일반. 단 군사 매체의 기사가 우주 일반 단서도 없으면(무기·방산 일반 기사) 군사로 둔다
  if (mil === 0) return prior === "mil" && gen === 0 ? { c: "mil", cx: 0, cs } : { c: "gen", cx: prior === "mil" ? 1 : 0, cs };
  const [need, gap] = prior === "" ? [6, 3] : [4, 2];
  if (m >= need && m - g >= gap) return { c: "mil", cx: m - g < gap + 2 && g >= 3 ? 1 : 0, cs };
  if (m < 3 || g >= m) return { c: "gen", cx: mil >= 3 ? 1 : 0, cs };
  return { c: prior === "mil" ? "mil" : "gen", cx: 1, cs };
}

// ---------- 2. 정규화 ----------
const DROP_Q = /^(utm_|fbclid$|gclid$|mc_|cmpid$|ocid$|cvid$|ei$|ref$|src$|from$|rss$|feed$|output$|sc$|sns$|_ga$)/i;
export function normUrl(u) {
  try {
    const x = new URL(u);
    x.protocol = "https:"; x.hash = "";
    x.hostname = x.hostname.toLowerCase().replace(/^(www|m|amp|mobile)\./, "");
    for (const k of [...x.searchParams.keys()]) if (DROP_Q.test(k)) x.searchParams.delete(k);
    x.pathname = x.pathname.replace(/\/amp\/?$/i, "").replace(/\/+$/, "");
    // msn.com 기사는 끝의 ar-XXXX 번호가 고유 id
    const ms = x.hostname.endsWith("msn.com") && x.pathname.match(/\/(ar-[A-Za-z0-9]+)$/);
    if (ms) return "msn:" + ms[1];
    return x.hostname + x.pathname + (x.search === "?" ? "" : x.search);
  } catch { return String(u || ""); }
}
const HG = /[가-힣]/;
export function normTitle(t) {
  return String(t || "").normalize("NFKC").toLowerCase()
    .replace(/^\s*(?:\[[^\]]{1,20}\]|【[^】]{1,20}】|<[^>]{1,20}>|\([^)]{1,10}\))\s*/g, "")   // [단독] [글로벌스타트업씬] (종합) 등
    .replace(/\((?:종합|\d보|속보|단독|update[d]?)\)/gi, "")
    .replace(/\s[-|–—:]\s[^-|–—]{2,40}$/, "")                                        // 끝의 " - 매체명"
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
const STOP = new Set("a an the of to in on for and or with at by from as is are be its it this that into after over new says said will its".split(" "));
function feats(s) {
  if (!s) return null;
  if (HG.test(s)) {                           // 한국어: 공백 없앤 글자 2-gram (조사·띄어쓰기 차이에 강함)
    const z = s.replace(/\s/g, ""), g = new Set();
    for (let i = 0; i < z.length - 1; i++) g.add(z.slice(i, i + 2));
    return { ko: 1, g };
  }
  const w = s.split(" ").filter(x => x.length > 1 && !STOP.has(x)), g = new Set(w);   // 영어: 낱말 집합
  return { ko: 0, g };
}
function jac(a, b) {
  if (!a || !b || a.ko !== b.ko || !a.g.size || !b.g.size) return 0;
  let i = 0; for (const x of a.g) if (b.g.has(x)) i++;
  return i / (a.g.size + b.g.size - i);
}
// 숫자·임무명 같은 고유 표지 (서로 다른 Falcon 9 발사 기사가 합쳐지는 것을 막는 데 씀)
function marks(s) {
  // 임무명(NROL-69, USSF-106, Starlink 10-12)과 '4차·3호' 같은 회차만 본다. 날짜·금액 같은 단순 숫자는 쓰지 않음
  return new Set((String(s || "").match(/\b[A-Za-z]+[- ]?\d+(?:-\d+)?[A-Z]?\b(?<!\b(?:19|20)\d\d)|\d+(?:호기|호|차)(?![가-힣])/g) || [])
    .map(x => x.toLowerCase().replace(/[\s-]/g, "")).filter(x => !/^(?:nov|oct|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|q|fy|no|top|series)\d/.test(x)));
}
function markClash(a, b) {                     // 둘 다 표지가 있는데 하나도 겹치지 않으면 다른 사건으로 본다
  if (!a.size || !b.size) return false;
  for (const x of a) if (b.has(x)) return false;
  return true;
}

// 대표 기사 주소로 만든 짧은 해시 → 수집할 때마다 같은 묶음은 같은 id (브라우저에 저장된 예전 목록과도 맞음)
function hid(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }

// ---------- 3. 실행 ----------
const WIN = 72 * 36e5;           // 72시간 안의 기사끼리만 비교
const SIM_KO = 0.42, SIM_EN = 0.6, SIM_X = 0.62;   // 한국어끼리, 영어끼리, 번역 제목(kt)과 한국어 제목 사이

export function classifyAndDedupe(feeds, FEEDS, overrides = {}) {
  const meta = {};
  for (const f of FEEDS) meta[f.url] = f;
  meta["bing:news"] = { name: "Bing 뉴스", kind: "kr", search: 1 };
  meta["naver:news"] = { name: "네이버 뉴스", kind: "kr", search: 1 };

  const all = [];
  for (const [url, f] of Object.entries(feeds)) {
    const fm = meta[url] || { name: url, kind: "" };
    for (const it of f.items || []) {
      for (const k of ["c", "cx", "cs", "g", "dp", "nd", "dl"]) delete it[k];   // 이전 실행의 판정 지우기
      const nt = normTitle(it.t), kt = it.kt ? normTitle(it.kt) : "";
      all.push({
        it, fm, nu: normUrl(it.u), nt, ts: Date.parse(it.p) || 0,
        f1: feats(nt), f2: kt && kt !== nt ? feats(kt) : null, mk: marks(it.t),
        rank: (fm.search ? 0 : 2) + (it.im ? 1 : 0),           // 대표 기사 우선순위: 원 피드 > 검색 결과, 이미지 있는 기사
      });
    }
  }
  // 대표 기사가 먼저 오도록 정렬: 우선순위 높은 순, 같으면 먼저 나온 기사
  all.sort((a, b) => b.rank - a.rank || a.ts - b.ts);

  const reps = [], byUrl = new Map(), byTitle = new Map();
  let nDupUrl = 0, nDupTitle = 0, nDupSim = 0;
  for (const a of all) {
    let rep = byUrl.get(a.nu) || (a.nt.length > 8 ? byTitle.get(a.nt) : null);
    if (rep) { rep === byUrl.get(a.nu) ? nDupUrl++ : nDupTitle++; }
    else {
      // 묶음의 대표뿐 아니라 이미 묶인 기사 모두와 비교한다 (단일 연결)
      const th = a.f1 && a.f1.ko ? SIM_KO : SIM_EN;
      search: for (const r of reps) {
        for (const b of [r, ...r.mem]) {
          if (Math.abs(b.ts - a.ts) > WIN) continue;
          const s = Math.max(
            jac(b.f1, a.f1),
            a.f2 ? jac(b.f1, a.f2) * (SIM_KO / SIM_X) : 0,        // a의 번역 제목 ↔ b의 한국어 제목
            b.f2 ? jac(b.f2, a.f1) * (SIM_KO / SIM_X) : 0,
          );
          if (s >= th && !markClash(b.mk, a.mk)) { rep = r; nDupSim++; break search; }
        }
      }
    }
    if (rep) { (rep.mem || (rep.mem = [])).push(a); }
    else { reps.push(a); a.mem = []; }
    if (!byUrl.has(a.nu)) byUrl.set(a.nu, rep || a);
    if (a.nt.length > 8 && !byTitle.has(a.nt)) byTitle.set(a.nt, rep || a);
  }

  // 묶음 단위로 분류: 묶음 안 기사의 점수를 합쳐 한 번만 판정 → 같은 사건이 두 목록에 갈리지 않음
  const cnt = { mil: 0, gen: 0, cx: 0, ovr: 0 };
  reps.forEach(r => {
    const grp = [r, ...r.mem];
    let mil = 0, gen = 0;
    for (const x of grp) {
      const title = x.it.t + " " + (x.it.kt || ""), text = (x.it.d || "") + " " + (x.it.cg || "");
      const [m, g] = score(text, title); mil += m; gen += g;
    }
    mil = Math.round(mil / grp.length * 10) / 10; gen = Math.round(gen / grp.length * 10) / 10;
    let res = decide(mil, gen, priorOf(r.fm, r.it));
    const ov = grp.map(x => overrides[x.it.u]).find(Boolean);
    if (ov === "mil" || ov === "gen") { res = { c: ov, cx: 0, cs: res.cs }; cnt.ovr++; }
    const gid = "g" + hid(r.nu);
    for (const x of grp) {
      x.it.c = res.c; if (res.cx) x.it.cx = 1; x.it.cs = res.cs; x.it.g = gid;
      if (x !== r) x.it.dp = r.it.u;
    }
    if (r.mem.length) {
      r.it.nd = r.mem.length;
      r.it.dl = r.mem.slice(0, 6).map(x => ({ n: x.it.sn || x.fm.name, u: x.it.u }));
    }
    cnt[res.c]++; if (res.cx) cnt.cx++;
  });
  return { total: all.length, groups: reps.length, dupUrl: nDupUrl, dupTitle: nDupTitle, dupSim: nDupSim, ...cnt };
}
