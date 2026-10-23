// 대시보드 HTML의 pre()와 같은 코드: 번역할 기사 요약문(앞 2문장)을 고른다 (수정 시 양쪽을 함께 맞출 것)
export const HG=/[가-힣]/;
function pre(s){s=String(s||"").replace(/The post .*? appeared first on .*$/i,"").replace(/\s*(Continue reading|Read more|Read More|Click here|\[…\]|\[\.\.\.\]|\[&#8230;\]).*$/,"").replace(/\s+/g," ").trim();
var p=s.replace(/\b(U\.S|U\.K|U\.N|Mr|Ms|Dr|St|Inc|Corp|Co|Jr|No|vs|Lt|Gen|Col|Maj|Sgt|Capt|Adm|Rep|Sen|Gov|approx|e\.g|i\.e)\./g,"$1∯"),ss=p.match(/(?:[^.!?]|[.!?](?![\s"”’)]|$))+[.!?]+["”’)]?(?=\s|$)/g)||[];
ss=ss.map(function(x){return x.replace(/∯/g,".").trim()}).filter(function(x){return x.length>25});return(ss.length?ss.slice(0,2):[s.replace(/∯/g,".")]).join(" ")}
export { pre };
