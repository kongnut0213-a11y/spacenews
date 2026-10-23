// 대시보드 HTML과 같은 위성 집계 코드 (수정 시 양쪽을 함께 맞출 것)
export const CC=[["SKOR","한국"],["US","미국"],["PRC","중국"],["CIS","러시아"],["UK","영국"],["JPN","일본"],["IND","인도"],["FR","프랑스"],["ESA","ESA"],["GER","독일"]];
function csv(l){var o=[],c="",q=0;for(var i=0;i<l.length;i++){var ch=l[i];if(q){if(ch=='"'){if(l[i+1]=='"'){c+='"';i++}else q=0}else c+=ch}else if(ch=='"')q=1;else if(ch==","){o.push(c);c=""}else c+=ch}o.push(c);return o}
function mend(y,m){var d=new Date(Date.UTC(y,m+1,0));return d.toISOString().slice(0,10)}
function calc(txt){var ln=txt.split(/\r?\n/),h=csv(ln[0]),ix={};h.forEach(function(k,i){ix[k.trim()]=i});
var now=new Date(),P=[],lb=[];for(var k=12;k>=1;k--){var d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-k,1));P.push(mend(d.getUTCFullYear(),d.getUTCMonth()));lb.push(String(d.getUTCFullYear()).slice(2)+"."+("0"+(d.getUTCMonth()+1)).slice(-2))}
P.push(now.toISOString().slice(0,10));lb.push("현재");
var C={},LN={},SL={},keys={};CC.forEach(function(c){keys[c[0]]=1;C[c[0]]=P.map(function(){return 0});LN[c[0]]=P.map(function(){return 0})});SL=P.map(function(){return 0});
var TP=P.map(function(){return 0}),TN=P.map(function(){return 0}),KR=[],d7=new Date(now.getTime()-7*864e5).toISOString().slice(0,10),d30=new Date(now.getTime()-30*864e5).toISOString().slice(0,10),d365=new Date(now.getTime()-365*864e5).toISOString().slice(0,10),W={},WP=[0,0,0],WN=[0,0,0];CC.forEach(function(c){W[c[0]]=[0,0,0]});
for(var i=1;i<ln.length;i++){if(!ln[i])continue;var r=csv(ln[i]),pay=r[ix.OBJECT_TYPE]=="PAY",L1=r[ix.LAUNCH_DATE]||"",D1=r[ix.DECAY_DATE]||"";if(L1&&!/^\d{4}-/.test(L1))continue;
if(L1)for(var q=0;q<P.length;q++)if(L1<=P[q]&&(!D1||D1>P[q]))(pay?TP:TN)[q]++;
if(L1){var wt=pay?WP:WN;if(L1>d7)wt[0]++;if(L1>d30)wt[1]++;if(L1>d365)wt[2]++}
if(!pay)continue;var o=r[ix.OWNER];if(!keys[o])continue;
var L0=r[ix.LAUNCH_DATE]||"",D0=r[ix.DECAY_DATE]||"",st=o=="US"&&/^STARLINK/i.test(r[ix.OBJECT_NAME]||"");if(!L0)continue;if(L0>d7)W[o][0]++;if(L0>d30)W[o][1]++;if(L0>d365)W[o][2]++;if(o=="SKOR"&&(L0>P[0]||(D0&&D0>P[0])))KR.push({n:r[ix.OBJECT_NAME]||"",id:r[ix.OBJECT_ID]||"",l:L0,d:D0,s:r[ix.LAUNCH_SITE]||""});
for(var p=0;p<P.length;p++){if(L0<=P[p]&&(!D0||D0>P[p])){C[o][p]++;if(st)SL[p]++}
var a=p?P[p-1]:"0000";if(L0>a&&L0<=P[p])LN[o][p]++}}
if(!C.US[P.length-1])throw new Error("parse");return{at:Date.now(),lb:lb,P:P,c:C,ln:LN,sl:SL,tp:TP,tn:TN,kr:KR,w:W,wp:WP,wn:WN,wd:[d7,d30,d365]}}
export { calc };
