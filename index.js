/**
 * Salon Privé Blackjack - 1 fichier
 * Admin: Patron / admin21
 */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),{URL}=require('url');
const PORT=process.env.PORT||3000;
const uuid=()=>crypto.randomBytes(8).toString('hex');
const comptes=new Map(),sessions=new Map();
let mode='perdant';
let table={phase:'mise',joueur:null,mainJ:[],mainC:[],mise:0,resultat:null,message:'Faites vos jeux',sabot:null,hist:[]};
function sabot(){const C=['♠','♥','♦','♣'],V=['A','2','3','4','5','6','7','8','9','10','J','Q','K'],a=[];for(let d=0;d<4;d++)for(const c of C)for(const v of V)a.push({v,c,id:uuid()});for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
table.sabot=sabot();
const AID=uuid();
comptes.set(AID,{id:AID,pseudo:'Patron',code:'admin21',role:'admin',solde:999999,actif:true});
function val(c){if(['J','Q','K'].includes(c.v))return 10;if(c.v==='A')return 11;return+c.v;}
function tot(m){let t=0,a=0;for(const c of m){t+=val(c);if(c.v==='A')a++;}while(t>21&&a>0){t-=10;a--;}return t;}
function bj(m){return m.length===2&&tot(m)===21;}
function tirer(pourC){if(table.sabot.length<20)table.sabot=sabot();
if(mode==='normal'||mode==='juste')return table.sabot.pop();
const p=mode==='tres_perdant'?6:mode==='gagnant'?6:3;const cand=table.sabot.slice(-p);
const tj=tot(table.mainJ);
if(mode==='gagnant'){if(!pourC&&tj>=12&&tj<=16)cand.sort((a,b)=>val(a)-val(b));else if(pourC)cand.sort((a,b)=>val(b)-val(a));}
else{if(pourC)cand.sort((a,b)=>val(b)-val(a));else if(tj>=12&&tj<=16)cand.sort((a,b)=>val(b)-val(a));else cand.sort((a,b)=>val(a)-val(b));}
const proba=mode==='tres_perdant'||mode==='gagnant'?0.65:0.4;
if(Math.random()<proba&&cand.length){const ch=cand[0],i=table.sabot.findIndex(x=>x.id===ch.id);if(i>=0){table.sabot.splice(i,1);return ch;}}
return table.sabot.pop();}
function finir(c){const tj=tot(table.mainJ),tc=tot(table.mainC);let gain=0,r='perdu';
if(tj>21){r='perdu';table.message='Perdu · crevé';}
else if(bj(table.mainJ)&&!bj(table.mainC)){r='blackjack';gain=Math.floor(table.mise*2.5);table.message='Blackjack !';}
else if(tc>21){r='gagne';gain=table.mise*2;table.message='Gagné · banque crevée';}
else if(tj>tc){r='gagne';gain=table.mise*2;table.message='Gagné';}
else if(tj===tc){r='egalite';gain=table.mise;table.message='Égalité';}
else{r='perdu';table.message='Perdu';}
c.solde+=gain;table.resultat=r;table.phase='fin';
table.hist.unshift({pseudo:c.pseudo,mise:table.mise,resultat:r,gain:gain-table.mise});if(table.hist.length>30)table.hist.pop();}
function body(req){return new Promise(res=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>{try{res(d?JSON.parse(d):{});}catch{res({});}});});}
function send(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'});res.end(JSON.stringify(o));}
function token(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):null;}
function compte(req){const t=token(req);if(!t||!sessions.has(t))return null;const c=comptes.get(sessions.get(t));if(!c||!c.actif){sessions.delete(t);return null;}return c;}

const HTML=`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>Salon Privé</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f0e6;min-height:100vh}
#porte{position:fixed;inset:0;background:radial-gradient(ellipse,#3a0a14,#0a0203);display:flex;align-items:center;justify-content:center;z-index:50}
#porte.ok{opacity:0;pointer-events:none;transition:.5s}
.box{text-align:center;padding:1.5rem;width:min(300px,90vw)}
.box h1{font-size:1.4rem;letter-spacing:.3em;color:#e8d48b;margin-bottom:.3rem}
.box p{font-size:.7rem;opacity:.5;margin-bottom:1.5rem;letter-spacing:.1em}
.box input{display:block;width:100%;margin:.5rem 0;padding:.8rem;background:rgba(0,0,0,.4);border:1px solid rgba(201,162,39,.4);border-radius:6px;color:#fff;text-align:center}
.box button,.btn{background:linear-gradient(#d4b03a,#a07818);border:none;border-radius:6px;padding:.8rem 1.2rem;font-weight:600;color:#1a1205;cursor:pointer;width:100%;margin-top:.5rem}
.err{color:#f87171;font-size:.85rem;min-height:1.2em;margin-top:.4rem}
#app{display:none;flex-direction:column;min-height:100vh}
#app.on{display:flex}
.top{display:flex;justify-content:space-between;align-items:center;padding:.7rem 1rem;background:rgba(0,0,0,.4);border-bottom:1px solid rgba(201,162,39,.2)}
.solde{color:#c9a227;font-weight:600}
.feutre{flex:1;background:radial-gradient(ellipse at 50% 30%,#124536,#0a2f24,#061c16);padding:1rem;display:flex;flex-direction:column;align-items:center;justify-content:space-around}
.lib{font-size:.65rem;letter-spacing:.15em;opacity:.5;text-transform:uppercase;margin-bottom:.3rem}
.cartes{display:flex;gap:.3rem;justify-content:center;min-height:70px;flex-wrap:wrap}
.carte{width:48px;height:68px;border-radius:5px;background:#f8f5ef;color:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:700;font-size:1rem;box-shadow:0 2px 6px rgba(0,0,0,.4)}
.carte.r{color:#b91c1c}.carte.x{background:#1e3a5f;color:transparent;border:1px solid rgba(201,162,39,.4)}
.tot{color:#e8d48b;margin-top:.2rem;font-size:1rem}
.msg{color:#e8d48b;text-align:center;padding:.5rem;min-height:2em}
.mise-c{width:80px;height:80px;border-radius:50%;border:2px solid rgba(201,162,39,.5);display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:#c9a227;margin:.5rem auto}
.rack{display:flex;justify-content:center;gap:.5rem;padding:.7rem;background:rgba(0,0,0,.25)}
.jeton{width:44px;height:44px;border-radius:50%;border:2px dashed rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem;color:#fff;cursor:pointer}
.jeton.d{opacity:.35;pointer-events:none}
.j5{background:#b4172c}.j25{background:#12784a}.j100{background:#1b4a8a}.j500{background:#161616;color:#c9a227}
.acts{display:flex;justify-content:center;gap:.5rem;padding:.8rem;background:rgba(0,0,0,.4);flex-wrap:wrap}
.acts button{min-width:80px;padding:.65rem .9rem;border-radius:6px;border:1px solid rgba(201,162,39,.4);background:rgba(201,162,39,.15);color:#f5f0e6;cursor:pointer}
.acts button.p{background:linear-gradient(#d4b03a,#a07818);color:#1a1205;border:none;font-weight:600}
#regie{display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:100;align-items:flex-end;justify-content:center}
#regie.on{display:flex}
.rp{width:100%;max-width:420px;max-height:85vh;overflow-y:auto;background:#14110e;border-radius:14px 14px 0 0;padding:1.2rem;border:1px solid rgba(201,162,39,.25)}
.rp h2{color:#c9a227;margin-bottom:1rem}
.rp h3{font-size:.8rem;opacity:.6;text-transform:uppercase;letter-spacing:.1em;margin:1rem 0 .5rem}
.modes{display:grid;grid-template-columns:1fr 1fr;gap:.4rem}
.modes button{padding:.55rem;border-radius:5px;border:1px solid rgba(201,162,39,.3);background:transparent;color:#f5f0e6;cursor:pointer;font-size:.8rem}
.modes button.on{background:rgba(201,162,39,.25);border-color:#c9a227;color:#c9a227}
.fl{display:flex;flex-wrap:wrap;gap:.35rem;margin:.4rem 0}
.fl input{flex:1;min-width:70px;padding:.45rem;background:rgba(0,0,0,.4);border:1px solid rgba(201,162,39,.25);border-radius:4px;color:#fff;font-size:.85rem}
.fl button,.sm{padding:.45rem .7rem;background:#c9a227;color:#1a1205;border:none;border-radius:4px;font-weight:600;font-size:.8rem;cursor:pointer}
.cl{display:flex;align-items:center;gap:.4rem;padding:.4rem;background:rgba(0,0,0,.3);border-radius:5px;margin:.3rem 0;font-size:.85rem}
.cl input{width:60px;padding:.25rem;background:rgba(0,0,0,.4);border:1px solid rgba(201,162,39,.25);border-radius:3px;color:#fff;text-align:center}
.icon{width:34px;height:34px;border-radius:50%;border:1px solid rgba(201,162,39,.3);background:rgba(0,0,0,.3);color:#fff;cursor:pointer}
</style></head><body>
<div id="porte"><div class="box"><div style="width:60px;height:60px;border:2px solid #c9a227;border-radius:50%;margin:0 auto 1rem;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:#c9a227">21</div>
<h1>SALON PRIVÉ</h1><p>BLACKJACK · ACCÈS SUR CODE</p>
<input id="pseudo" placeholder="PSEUDO" autocomplete="username"><input id="code" type="password" placeholder="CODE" autocomplete="current-password">
<button id="entrer">Entrer</button><p class="err" id="err"></p></div></div>
<div id="app"><div class="top"><div><span id="lp">—</span> <span class="solde" id="ls">0</span></div>
<div style="display:flex;gap:.4rem"><button class="icon" id="btnR" style="display:none">⚙</button><button class="icon" id="btnQ">✕</button></div></div>
<div class="feutre"><div><div class="lib">Croupier</div><div class="cartes" id="mc"></div><div class="tot" id="tc"></div></div>
<div class="msg" id="msg">Faites vos jeux</div>
<div><div class="lib">Vous</div><div class="cartes" id="mj"></div><div class="tot" id="tj"></div></div>
<div class="mise-c" id="am">0</div></div>
<div class="rack" id="rack"></div><div class="acts" id="acts"></div></div>
<div id="regie"><div class="rp"><div style="display:flex;justify-content:space-between"><h2>Régie</h2><button class="icon" id="fermerR">✕</button></div>
<h3>Mode (invisible joueurs)</h3><div class="modes" id="modes">
<button data-m="juste">Juste</button><button data-m="normal">Normal</button>
<button data-m="perdant" class="on">Perdant</button><button data-m="tres_perdant">Très perdant</button>
<button data-m="gagnant">Ils gagnent</button></div>
<p id="ml" style="margin-top:.5rem;font-size:.85rem;opacity:.7">Mode : <b>Perdant</b></p>
<h3>Créer compte</h3><div class="fl"><input id="np" placeholder="Pseudo"><input id="nc" placeholder="Code"><input id="ns" type="number" value="2000" placeholder="Jetons"><button id="bc">Créer</button></div>
<p id="mcmsg" style="font-size:.8rem;color:#86efac"></p>
<h3>Comptes</h3><div id="lc"></div>
<h3>Historique</h3><div id="lh" style="font-size:.8rem;max-height:120px;overflow-y:auto"></div>
</div></div>
<script>
const API='';let token=localStorage.getItem('bj.t'),moi=null,etat=null,mise=0,timer=null;
const $=id=>document.getElementById(id);
async function api(m,p,b){const o={method:m,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}};if(b!==undefined)o.body=JSON.stringify(b);
const r=await fetch(API+p,o);const d=await r.json().catch(()=>({}));if(r.status===401){out();throw new Error(d.erreur||'Session');}if(!r.ok)throw new Error(d.erreur||'Erreur');return d;}
function out(){token=null;moi=null;localStorage.removeItem('bj.t');if(timer)clearInterval(timer);$('porte').classList.remove('ok');$('app').classList.remove('on');$('regie').classList.remove('on');}
function carte(c){const e=document.createElement('div');e.className='carte';if(c.cachee){e.classList.add('x');e.textContent='?';return e;}
if(c.c==='♥'||c.c==='♦')e.classList.add('r');e.innerHTML='<span>'+c.v+'</span><span style="font-size:.9rem">'+c.c+'</span>';return e;}
function paint(){if(!etat||!moi)return;$('lp').textContent=moi.pseudo;$('ls').textContent=moi.solde.toLocaleString('fr-FR');
$('mj').innerHTML='';$('mc').innerHTML='';(etat.mainJ||[]).forEach(c=>$('mj').appendChild(carte(c)));(etat.mainC||[]).forEach(c=>$('mc').appendChild(carte(c)));
$('tj').textContent=etat.totJ!=null?etat.totJ:'';$('tc').textContent=etat.totC!=null?etat.totC:'';$('msg').textContent=etat.message||'';$('am').textContent=etat.mise||mise||0;
$('btnR').style.display=moi.role==='admin'?'':'none';rack();acts();}
function rack(){const r=$('rack');r.innerHTML='';const vs=[{v:5,c:'j5'},{v:25,c:'j25'},{v:100,c:'j100'},{v:500,c:'j500'}];const ok=etat&&etat.phase==='mise';
vs.forEach(({v,c})=>{const b=document.createElement('div');b.className='jeton '+c+(ok&&moi.solde>=mise+v?'':' d');b.textContent=v;
if(ok&&moi.solde>=mise+v)b.onclick=()=>{mise+=v;$('am').textContent=mise;rack();acts();};r.appendChild(b);});}
function acts(){const z=$('acts');z.innerHTML='';if(!etat)return;
if(etat.phase==='mise'){const a=document.createElement('button');a.textContent='Effacer';a.onclick=()=>{mise=0;$('am').textContent=0;rack();acts();};z.appendChild(a);
const b=document.createElement('button');b.textContent='Miser';b.className='p';b.disabled=mise<10;b.onclick=async()=>{try{await api('POST','/api/action',{action:'miser',montant:mise});mise=0;await raf();}catch(e){alert(e.message);}};z.appendChild(b);}
else if(etat.phase==='jeu'){[['Tirer','tirer'],['Rester','rester',1],['Doubler','doubler']].forEach(([l,a,p])=>{const b=document.createElement('button');b.textContent=l;if(p)b.className='p';
b.onclick=async()=>{try{await api('POST','/api/action',{action:a});await raf();}catch(e){alert(e.message);}};z.appendChild(b);});}
else if(etat.phase==='fin'){const b=document.createElement('button');b.textContent='Nouvelle main';b.className='p';
b.onclick=async()=>{try{await api('POST','/api/action',{action:'nouvelle'});mise=0;await raf();}catch(e){alert(e.message);}};z.appendChild(b);}}
async function raf(){try{const d=await api('GET','/api/etat');moi=d.moi;etat=d.etat;if(d.mode){document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.m===d.mode));
const L={juste:'Juste',normal:'Normal',perdant:'Perdant',tres_perdant:'Très perdant',gagnant:'Ils gagnent'};$('ml').innerHTML='Mode : <b>'+(L[d.mode]||d.mode)+'</b>';}paint();}catch(e){console.warn(e);}}
async function loadR(){try{const d=await api('GET','/api/regie');document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.m===d.mode));
const L={juste:'Juste',normal:'Normal',perdant:'Perdant',tres_perdant:'Très perdant',gagnant:'Ils gagnent'};$('ml').innerHTML='Mode : <b>'+(L[d.mode]||d.mode)+'</b>';
const lc=$('lc');lc.innerHTML='';d.comptes.forEach(c=>{if(c.role==='admin')return;const el=document.createElement('div');el.className='cl';
el.innerHTML='<span style="flex:1">'+c.pseudo+'</span><span style="color:#c9a227">'+c.solde+'</span><input type="number" placeholder="+/-" data-id="'+c.id+'"><button data-a="cr" data-id="'+c.id+'">OK</button><button data-a="tg" data-id="'+c.id+'" data-act="'+c.actif+'">'+(c.actif?'Off':'On')+'</button>';
lc.appendChild(el);});
const lh=$('lh');lh.innerHTML='';(d.historique||[]).slice(0,12).forEach(h=>{const el=document.createElement('div');el.style.cssText='display:flex;justify-content:space-between;padding:.25rem 0;border-bottom:1px solid rgba(255,255,255,.05)';
el.innerHTML='<span>'+h.pseudo+' · '+h.resultat+'</span><span style="color:'+(h.gain>=0?'#86efac':'#fca5a5')+'">'+(h.gain>=0?'+':'')+h.gain+'</span>';lh.appendChild(el);});}catch(e){console.warn(e);}}
$('entrer').onclick=async()=>{const p=$('pseudo').value.trim(),c=$('code').value;$('err').textContent='';
try{const d=await api('POST','/api/session',{pseudo:p,code:c});token=d.jeton;localStorage.setItem('bj.t',token);moi=d.moi;$('porte').classList.add('ok');$('app').classList.add('on');await raf();timer=setInterval(raf,2000);}catch(e){$('err').textContent=e.message||'Code refusé';}};
$('code').onkeydown=e=>{if(e.key==='Enter')$('entrer').click();};
$('btnQ').onclick=async()=>{try{await api('DELETE','/api/session');}catch{}out();};
$('btnR').onclick=()=>{$('regie').classList.add('on');loadR();};
$('fermerR').onclick=()=>$('regie').classList.remove('on');
document.querySelectorAll('#modes button').forEach(b=>b.onclick=async()=>{try{await api('POST','/api/regie/mode',{mode:b.dataset.m});loadR();}catch(e){alert(e.message);}});
$('bc').onclick=async()=>{try{await api('POST','/api/regie/compte',{pseudo:$('np').value.trim(),code:$('nc').value.trim(),solde:+$('ns').value||2000});$('mcmsg').textContent='Compte créé';$('np').value='';$('nc').value='';loadR();}catch(e){$('mcmsg').textContent=e.message;$('mcmsg').style.color='#fca5a5';}};
$('lc').onclick=async e=>{const btn=e.target.closest('button');if(!btn)return;const id=btn.dataset.id,a=btn.dataset.a;
if(a==='cr'){const inp=btn.parentElement.querySelector('input');const m=+inp.value;if(!m)return;try{await api('POST','/api/regie/mouvement',{compteId:id,montant:m});inp.value='';loadR();raf();}catch(err){alert(err.message);}}
if(a==='tg'){try{await api('POST','/api/regie/compte/actif',{compteId:id,actif:btn.dataset.act!=='true'});loadR();}catch(err){alert(err.message);}}};
(async()=>{if(token){try{await raf();$('porte').classList.add('ok');$('app').classList.add('on');timer=setInterval(raf,2000);}catch{out();}}})();
</script></body></html>`;

async function handle(req,res,pathn){
if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'});return res.end();}
const b=['POST','PUT'].includes(req.method)?await body(req):{};
if(pathn==='/api/session'&&req.method==='POST'){
const{pseudo,code}=b;if(!pseudo||!code)return send(res,400,{erreur:'Pseudo et code requis'});
let c=null;for(const x of comptes.values()){if(x.pseudo.toLowerCase()===String(pseudo).toLowerCase()&&x.code===String(code)){c=x;break;}}
if(!c)return send(res,401,{erreur:'Code refusé'});if(!c.actif)return send(res,401,{erreur:'Compte désactivé'});
const t=uuid();sessions.set(t,c.id);return send(res,200,{jeton:t,moi:{id:c.id,pseudo:c.pseudo,role:c.role,solde:c.solde}});}
if(pathn==='/api/session'&&req.method==='DELETE'){const t=token(req);if(t)sessions.delete(t);return send(res,200,{ok:true});}
const c=compte(req);if(!c&&pathn.startsWith('/api/'))return send(res,401,{erreur:'Session expirée'});
if(pathn==='/api/etat'&&req.method==='GET'){
const est=table.joueur===c.id,adm=c.role==='admin';
return send(res,200,{moi:{id:c.id,pseudo:c.pseudo,role:c.role,solde:c.solde},etat:{
phase:table.phase,message:table.message,mise:table.mise,
mainJ:(est||adm)?table.mainJ:[],
mainC:table.mainC.map((x,i)=>table.phase==='jeu'&&i===1&&!adm?{v:'?',c:'?',cachee:true}:x),
totJ:(est||adm)?tot(table.mainJ):null,
totC:(table.phase!=='jeu'||adm)?tot(table.mainC):(table.mainC[0]?val(table.mainC[0]):0),
resultat:table.resultat},...(adm?{mode}:{})});}
if(pathn==='/api/action'&&req.method==='POST'){
const{action,montant}=b;
try{
if(action==='miser'){if(table.phase!=='mise')throw new Error('Pas le moment');if(table.joueur&&table.joueur!==c.id)throw new Error('Autre joueur');
const m=Math.floor(+montant||0);if(m<10)throw new Error('Min 10');if(m>c.solde)throw new Error('Solde insuffisant');if(m>5000)throw new Error('Max 5000');
c.solde-=m;table.joueur=c.id;table.mise=m;table.mainJ=[];table.mainC=[];table.resultat=null;table.phase='jeu';table.message='Rien ne va plus';
table.mainJ.push(tirer(false));table.mainC.push(tirer(true));table.mainJ.push(tirer(false));table.mainC.push(tirer(true));
if(bj(table.mainJ))finir(c);}
else if(action==='tirer'){if(table.phase!=='jeu'||table.joueur!==c.id)throw new Error('Impossible');table.mainJ.push(tirer(false));if(tot(table.mainJ)>21)finir(c);}
else if(action==='rester'){if(table.phase!=='jeu'||table.joueur!==c.id)throw new Error('Impossible');while(tot(table.mainC)<17)table.mainC.push(tirer(true));finir(c);}
else if(action==='doubler'){if(table.phase!=='jeu'||table.joueur!==c.id)throw new Error('Impossible');if(table.mainJ.length!==2)throw new Error('Double sur 2 cartes');if(c.solde<table.mise)throw new Error('Solde insuffisant');
c.solde-=table.mise;table.mise*=2;table.mainJ.push(tirer(false));if(tot(table.mainJ)<=21)while(tot(table.mainC)<17)table.mainC.push(tirer(true));finir(c);}
else if(action==='nouvelle'){table.phase='mise';table.joueur=null;table.mainJ=[];table.mainC=[];table.mise=0;table.resultat=null;table.message='Faites vos jeux';}
else throw new Error('Action inconnue');
return send(res,200,{ok:true});}catch(e){return send(res,400,{erreur:e.message});}}
if(c.role!=='admin'&&pathn.startsWith('/api/regie'))return send(res,403,{erreur:'Réservé'});
if(pathn==='/api/regie'&&req.method==='GET')return send(res,200,{comptes:[...comptes.values()].map(x=>({id:x.id,pseudo:x.pseudo,code:x.code,role:x.role,solde:x.solde,actif:x.actif})),mode,historique:table.hist});
if(pathn==='/api/regie/compte'&&req.method==='POST'){const{pseudo,code,solde=2000}=b;if(!pseudo||!code)return send(res,400,{erreur:'Requis'});
for(const x of comptes.values())if(x.pseudo.toLowerCase()===String(pseudo).toLowerCase())return send(res,400,{erreur:'Pseudo existe'});
const id=uuid();comptes.set(id,{id,pseudo:String(pseudo).trim(),code:String(code),role:'joueur',solde:Math.max(0,Math.floor(+solde||0)),actif:true});return send(res,200,{ok:true});}
if(pathn==='/api/regie/mouvement'&&req.method==='POST'){const t=comptes.get(b.compteId);if(!t)return send(res,404,{erreur:'Introuvable'});const m=Math.floor(+b.montant||0);if(!m)return send(res,400,{erreur:'Montant'});t.solde=Math.max(0,t.solde+m);return send(res,200,{ok:true,nouveauSolde:t.solde});}
if(pathn==='/api/regie/compte/actif'&&req.method==='POST'){const t=comptes.get(b.compteId);if(!t)return send(res,404,{erreur:'Introuvable'});if(t.role==='admin')return send(res,400,{erreur:'Impossible'});t.actif=!!b.actif;return send(res,200,{ok:true});}
if(pathn==='/api/regie/mode'&&req.method==='POST'){const modes=['juste','normal','perdant','tres_perdant','gagnant'];if(!modes.includes(b.mode))return send(res,400,{erreur:'Mode invalide'});mode=b.mode;console.log('[REGIE] mode='+mode);return send(res,200,{ok:true,mode});}
return send(res,404,{erreur:'Route inconnue'});
}
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url||'/','http://'+req.headers.host);
if(u.pathname.startsWith('/api/'))await handle(req,res,u.pathname);
else{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(HTML);}}
catch(e){console.error(e);send(res,500,{erreur:'Erreur serveur'});}});
server.listen(PORT,()=>{console.log('Salon Privé → port '+PORT);console.log('Admin: Patron / admin21');});
