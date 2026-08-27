const http=require('http');const crypto=require('crypto');
const PORT=process.env.PORT||3000;const id=()=>crypto.randomBytes(8).toString('hex');
const MODE={aleatoire:'Aléatoire',bingo:'Bingo banque 90%',gros_gain:'Gros gain banque 75%',gain:'Gain banque 65%',perte:'Perte joueurs 65%',grosse_perte:'Grosse perte joueurs 75%',pipo:'Pipo joueurs 90%'};
let mode='aleatoire';const comptes=new Map();const sessions=new Map();
function add(p,c,r,s){const x={id:id(),pseudo:p,code:c,role:r,solde:s};comptes.set(x.id,x);return x;}
add('Patron','admin21','admin',999999);add('maelu','tuleccc','joueur',5000);
function shoe(){const C=['♠','♥','♦','♣'],V=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];const a=[];for(let d=0;d<6;d++)for(const c of C)for(const v of V)a.push({v,c,id:id()});for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function val(c){if(['J','Q','K'].includes(c.v))return 10;if(c.v==='A')return 11;return +c.v;}
function tot(m){let t=0,a=0;for(const c of m||[]){t+=val(c);if(c.v==='A')a++;}while(t>21&&a){t-=10;a--;}return t;}
function bj(m){return m&&m.length===2&&tot(m)===21;}
function pair(m){const r=c=>['10','J','Q','K'].includes(c.v)?'10':c.v;return m&&m.length===2&&r(m[0])===r(m[1]);}
const g={sabot:shoe(),dealer:[],player:[],split:null,which:0,bet:0,bet2:0,phase:'bet',msg:'Choisis une mise',result:'',uid:null};
function draw(forD,pTot){if(g.sabot.length<30)g.sabot=shoe();const bh={bingo:.9,gros_gain:.75,gain:.65}[mode];const ph={pipo:.9,grosse_perte:.75,perte:.65}[mode];const p=bh||ph;if(!p||Math.random()>p)return g.sabot.pop();const want=!!bh;const sl=g.sabot.slice(-10);let pick;if(forD){const tc=tot(g.dealer);pick=sl.sort((a,b)=>want?(tc<17?val(b)-val(a):Math.abs(21-tc-val(a))-Math.abs(21-tc-val(b))):(tc>=12&&tc<=16?val(b)-val(a):val(a)-val(b)))[0];}else{const tj=pTot==null?tot(g.player):pTot;pick=sl.sort((a,b)=>want?(tj>=12&&tj<=16?val(b)-val(a):val(a)-val(b)):Math.abs(21-tj-val(a))-Math.abs(21-tj-val(b)))[0];}const i=g.sabot.lastIndexOf(pick);if(i>=0)g.sabot.splice(i,1);else return g.sabot.pop();return pick;}
function pub(moi){const hide=g.phase==='play'&&g.dealer[1];return{phase:g.phase,msg:g.msg,result:g.result,bet:g.bet,dealer:g.dealer.map((c,i)=>hide&&i===1?{v:'?',c:'?'}:c),dtot:hide?val(g.dealer[0]||{v:'0'}):(g.dealer.length?tot(g.dealer):null),player:g.player,ptot:g.player.length?tot(g.player):null,split:g.split,which:g.which,canSplit:pair(g.player)&&!g.split&&g.phase==='play'&&g.player.length===2,canDouble:g.phase==='play'&&((g.which===1&&g.split)?g.split.length===2:g.player.length===2)&&moi.solde>=((g.which===1&&g.split)?(g.bet2||g.bet):g.bet),solde:moi.solde,pseudo:moi.pseudo,role:moi.role};}
function settle(hand,bet,c){const pj=tot(hand),dj=tot(g.dealer);if(pj>21)return'perdu';if(bj(hand)&&!bj(g.dealer)){c.solde+=Math.floor(bet*2.5);return'blackjack';}if(dj>21||pj>dj){c.solde+=bet*2;return'gagne';}if(pj===dj){c.solde+=bet;return'egalite';}return'perdu';}
function finish(c){const pOut=tot(g.player)>21&&(!g.split||tot(g.split)>21);if(!pOut){while(tot(g.dealer)<17)g.dealer.push(draw(true));}let t=settle(g.player,g.bet,c);if(g.split)t+=' / '+settle(g.split,g.bet2,c);g.phase='end';g.result=t;g.msg=t.includes('gagne')||t.includes('blackjack')?'Gagné':t.includes('egalite')?'Égalité':'Perdu';}
function me(req){const h=req.headers.authorization||'';const t=h.startsWith('Bearer ')?h.slice(7):null;return t&&sessions.has(t)?comptes.get(sessions.get(t)):null;}
function read(req){return new Promise(r=>{let d='';req.on('data',x=>d+=x);req.on('end',()=>{try{r(JSON.parse(d||'{}'));}catch{r({});}});});}
function json(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(o));}
async function api(req,res,path){
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end();}
  const b=req.method==='POST'?await read(req):{};
  if(path==='/api/login'&&req.method==='POST'){let c=null;for(const x of comptes.values())if(x.pseudo.toLowerCase()===String(b.pseudo||'').toLowerCase()&&x.code===String(b.code||''))c=x;if(!c)return json(res,401,{err:'Code refusé'});if(c.solde<10)c.solde=3000;const t=id()+id();sessions.set(t,c.id);return json(res,200,{token:t,moi:{pseudo:c.pseudo,role:c.role,solde:c.solde}});}
  const u=me(req);if(!u)return json(res,401,{err:'Session'});
  if(path==='/api/etat')return json(res,200,pub(u));
  if(path==='/api/miser'&&req.method==='POST'){if(g.phase!=='bet'&&g.phase!=='end')return json(res,400,{err:'Attends la fin'});const m=+b.montant;if(![10,25,50].includes(m))return json(res,400,{err:'Mise 10 25 50'});if(u.solde<m)return json(res,400,{err:'Solde'});g.uid=u.id;g.player=[];g.split=null;g.dealer=[];g.which=0;g.result='';u.solde-=m;g.bet=m;g.bet2=0;g.player.push(draw(false,0));g.dealer.push(draw(true));g.player.push(draw(false,tot(g.player)));g.dealer.push(draw(true));if(bj(g.player)){g.phase='end';if(!bj(g.dealer)){u.solde+=Math.floor(m*2.5);g.msg='Blackjack';g.result='blackjack';}else{u.solde+=m;g.msg='Égalité';g.result='egalite';}}else{g.phase='play';g.msg='Ton tour : Tirer, Doubler ou Rester';}return json(res,200,pub(u));}
  if(path==='/api/action'&&req.method==='POST'){if(g.phase!=='play')return json(res,400,{err:'Pas le moment de tirer'});g.uid=u.id;const hand=g.which===1&&g.split?g.split:g.player;const a=b.action;
    if(a==='hit'){hand.push(draw(false,tot(hand)));if(tot(hand)>21){if(g.which===0&&g.split){g.which=1;g.msg='Main 2';}else finish(u);}}
    else if(a==='stand'){if(g.which===0&&g.split){g.which=1;g.msg='Main 2';}else finish(u);}
    else if(a==='double'){if(hand.length!==2)return json(res,400,{err:'2 cartes'});const need=g.which===1?(g.bet2||g.bet):g.bet;if(u.solde<need)return json(res,400,{err:'Solde'});u.solde-=need;if(g.which===1)g.bet2=need*2;else g.bet*=2;hand.push(draw(false,tot(hand)));if(g.which===0&&g.split){g.which=1;g.msg='Main 2';}else finish(u);}
    else if(a==='split'){if(!pair(g.player)||g.split)return json(res,400,{err:'Pas de paire'});if(u.solde<g.bet)return json(res,400,{err:'Solde'});u.solde-=g.bet;g.bet2=g.bet;g.split=[g.player.pop()];g.player.push(draw(false,tot(g.player)));g.split.push(draw(false,tot(g.split)));g.which=0;g.msg='Main 1';}
    else return json(res,400,{err:'Action'});return json(res,200,pub(u));}
  if(path==='/api/quitter'&&req.method==='POST'){
    if(g.phase==='play'&&g.bet){u.solde+=g.bet;if(g.bet2)u.solde+=g.bet2;}
    g.player=[];g.dealer=[];g.split=null;g.bet=0;g.bet2=0;g.phase='bet';g.msg='Mise';g.result='';g.uid=null;
    return json(res,200,pub(u));
  }
  if(path==='/api/admin'&&u.role==='admin'){if(req.method==='GET')return json(res,200,{mode,modes:MODE,comptes:[...comptes.values()].map(c=>({id:c.id,pseudo:c.pseudo,code:c.code,role:c.role,solde:c.solde}))});if(b.mode&&MODE[b.mode])mode=b.mode;if(b.nouveau&&b.nouveau.pseudo&&b.nouveau.code)add(b.nouveau.pseudo,b.nouveau.code,'joueur',+b.nouveau.solde||2000);if(b.jetons&&b.jetons.id){const c=comptes.get(b.jetons.id);if(c)c.solde=Math.max(0,c.solde+(+b.jetons.delta||0));}return json(res,200,{ok:true,mode});}
  return json(res,404,{err:'?'});
}
const PAGE=`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>Blackjack</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,-apple-system,sans-serif;background:#0c1812;color:#f4efe4}
.v{display:none;min-height:100dvh;flex-direction:column}.v.on{display:flex}
#login{align-items:center;justify-content:center;background:radial-gradient(circle at 30% 20%,#5a1212,#0a0404);padding:1.5rem;text-align:center}
h1{letter-spacing:.2em;font-weight:500;margin:.6rem 0 1.2rem}
input{width:100%;max-width:320px;padding:.8rem;margin:.3rem 0;border:1px solid #c9a22766;background:#1a0808;color:#fff;text-align:center;border-radius:8px}
button{border:0;border-radius:8px;padding:.7rem 1rem;font-weight:700}
.g{background:linear-gradient(#e8d48b,#b8860b);color:#1a1205}.err{color:#f87171;min-height:1.2em}
.bar{display:flex;justify-content:space-between;align-items:center;padding:.6rem .8rem;background:#07110c}
.felt{flex:1;padding:.7rem .6rem .4rem;display:flex;flex-direction:column;align-items:center;gap:.35rem;background:radial-gradient(ellipse at 50% 30%,#1f6b48,#0d3a2a 55%,#08241a)}
.lab{font-size:.65rem;letter-spacing:.18em;opacity:.7;color:#f0d9a0}
.hand{display:flex;gap:.3rem;min-height:82px}
.card{width:62px;height:90px;border-radius:8px;background:linear-gradient(#fff,#f6f0e4);color:#1a1208;position:relative;box-shadow:0 10px 16px #0007,inset 0 0 0 1px #e4d9c4;animation:deal .4s ease}
.card .c1,.card .c2{position:absolute;width:18px;text-align:center;font-family:Georgia,'Times New Roman',serif;font-weight:800;line-height:1.05;font-size:.78rem}
.card .c1{top:5px;left:4px}.card .c2{bottom:5px;right:4px;transform:rotate(180deg)}
.card .pip{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);font-size:1.35rem;font-family:Georgia,serif}
.pips{position:absolute;left:16px;right:16px;top:16px;bottom:16px;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:repeat(3,1fr);place-items:center;font-size:.95rem}
.card.r{color:#c41e3a}
.card.x{background:repeating-linear-gradient(45deg,#6e1522 0 7px,#8b1e2d 7px 14px);color:transparent;border:2px solid #fff}
@keyframes deal{from{transform:translateY(-28px) rotate(-8deg);opacity:0}to{transform:none;opacity:1}}
.tot{background:#0006;padding:.15rem .5rem;border-radius:99px;font-size:.8rem}
.seat{width:72px;height:72px;border-radius:50%;border:3px solid #2dff7a;box-shadow:0 0 14px #2dff7a66,inset 0 0 12px #0004;display:flex;align-items:center;justify-content:center;font-size:.58rem;letter-spacing:.06em;color:#d8ffe8;margin:.2rem auto;background:#0a2a18}
.seat.on{border-color:#f0c14a;color:#f0c14a;box-shadow:0 0 16px #f0c14a66}
.chipon{width:48px;height:48px;border-radius:50%;border:5px dotted #fff8;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;color:#fff;margin:.2rem auto;background:radial-gradient(circle at 35% 30%,#666,#111);box-shadow:0 4px 10px #0008}
.dock{padding:.55rem .6rem calc(.75rem + env(safe-area-inset-bottom));background:repeating-linear-gradient(90deg,#3a2416 0 8px,#2a1810 8px 16px);border-top:3px solid #5a3a22}
.chips{display:flex;justify-content:center;gap:.5rem;margin-bottom:.5rem}
.chip{width:58px;height:58px;border-radius:50%;color:#fff;font-weight:800;font-size:.85rem;position:relative;border:0;box-shadow:0 6px 12px #0009;
background-image:radial-gradient(circle,#fff 0 9px,transparent 10px 13px,currentColor 14px 22px,transparent 23px),repeating-conic-gradient(#fff 0 16deg,currentColor 16deg 32deg);background-color:currentColor}
.chip.sel{transform:translateY(-5px) scale(1.08)}
.c10{color:#1e4cad}.c25{color:#157a38}.c50{color:#b41c2a}
.chipon.on10{background:radial-gradient(circle at 35% 30%,#6aa8f0,#163a8a)}
.chipon.on25{background:radial-gradient(circle at 35% 30%,#6ae09a,#0a5a30)}
.chipon.on50{background:radial-gradient(circle at 35% 30%,#f2c75a,#8a6010)}
.banner{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:40;background:#000c;border:2px solid #e8d48b;border-radius:14px;padding:.9rem 1.4rem;text-align:center;animation:in .3s ease}
.banner b{display:block;letter-spacing:.2em;color:#e8d48b;font-size:.7rem}
.banner span{font-size:1.6rem;font-weight:800}
.acts{display:flex;justify-content:center;gap:.4rem;flex-wrap:wrap}
.acts button{background:#c9a22722;color:#f4efe4;border:1px solid #c9a22755}
.acts .p{background:linear-gradient(#e8d48b,#b8860b);color:#1a1205;border:0}
#admin{background:#111;padding:1rem;overflow:auto}#admin h2{margin:.8rem 0 .4rem;color:#e8d48b;font-size:1rem}
.row{display:flex;gap:.4rem;align-items:center;margin:.35rem 0;flex-wrap:wrap}.row input{max-width:110px;text-align:left;padding:.4rem}
</style></head><body>
<div id="login" class="v on"><div>
<div style="width:70px;height:70px;border:2px solid #c9a227;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;color:#c9a227;font-size:1.4rem">21</div>
<h1>BLACKJACK</h1>
<p style="opacity:.5;font-size:.7rem;letter-spacing:.18em;margin:-.6rem 0 .8rem">V4 · JETON PUIS JOUER</p>
<input id="ps" placeholder="Pseudo"><input id="cd" type="password" placeholder="Code">
<button class="g" id="go" style="width:100%;max-width:320px;margin-top:.5rem">Entrer</button>
<p class="err" id="er"></p></div></div>
<div id="game" class="v">
<div class="bar"><b id="who"></b><span id="solde"></span><span><button class="g" id="admBtn" style="display:none;padding:.35rem .6rem">Admin</button> <button id="leave" style="background:#4a2a16;color:#f4efe4;padding:.35rem .55rem">Lever</button> <button id="out" style="background:#333;color:#fff;padding:.35rem .6rem">Quitter</button></span></div>
<div class="felt"><div class="lab">CROUPIER</div><div class="hand" id="dh"></div><div class="tot" id="dt"></div>
<div id="msg"></div>
<div class="chipon" id="chipon"></div>
<div class="hand" id="ph"></div><div class="tot" id="pt"></div><div id="sh"></div>
<div class="seat" id="seat">S'ASSEOIR</div>
</div>
<div class="dock"><div style="text-align:center;font-size:.68rem;letter-spacing:.12em;opacity:.7;margin-bottom:.35rem">1. JETON &nbsp; 2. JOUER / REJOUER</div><div class="chips" id="chips"></div><div class="acts" id="acts"></div></div></div>
<div id="admin" class="v"><div class="bar"><b>Régie</b><button class="g" id="back">Retour</button></div>
<div id="modes"></div><h2>Nouveau compte</h2>
<div class="row"><input id="np" placeholder="Pseudo"><input id="nc" placeholder="Code"><input id="ns" type="number" value="2000"><button class="g" id="ncBtn">Créer</button></div>
<h2>Comptes</h2><div id="clist"></div></div>
<script>
const $=i=>document.getElementById(i);let token=localStorage.getItem('bj.t'),moi=null;
function show(i){document.querySelectorAll('.v').forEach(x=>x.classList.remove('on'));$(i).classList.add('on');}
async function api(p,b){const o={method:b?'POST':'GET',headers:{'Content-Type':'application/json'}};if(token)o.headers.Authorization='Bearer '+token;if(b)o.body=JSON.stringify(b);const r=await fetch(p,o);const d=await r.json();if(r.status===401){token=null;localStorage.removeItem('bj.t');show('login');throw new Error('Session');}if(!r.ok)throw new Error(d.err||'Erreur');return d;}
let seated=false, dealing=false, lastBet=0, autoT=null, actx=null;
function beep(f,ms){try{if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();if(actx.state==='suspended')actx.resume();const t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.07,t);g.gain.exponentialRampToValueAtTime(.001,t+(ms||.12));o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+(ms||.14));}catch(e){}}
function sndCard(){beep(340,.11);}function sndChip(){beep(180,.08);setTimeout(()=>beep(220,.08),50);}function sndWin(){beep(523,.1);setTimeout(()=>beep(659,.12),80);}
const PIPS={A:[5],'2':[2,8],'3':[2,5,8],'4':[1,3,7,9],'5':[1,3,5,7,9],'6':[1,3,4,6,7,9],'7':[1,3,4,5,6,7,9],'8':[1,3,4,5,6,7,8,9],'9':[1,2,3,4,6,7,8,9],'10':[1,2,3,4,5,6,7,8,9]};
function C(c){const d=document.createElement('div');const hid=!c||c.v==='?';d.className='card'+(hid?' x':((c.c==='♥'||c.c==='♦')?' r':''));
if(!hid){const k=c.v+'<br>'+c.c;let mid='';
if(PIPS[c.v]){mid='<div class="pips">'+[1,2,3,4,5,6,7,8,9].map(n=>'<span>'+(PIPS[c.v].includes(n)?c.c:'')+'</span>').join('')+'</div>';}
else mid='<div class="pip">'+(c.v==='J'?'V':c.v==='Q'?'D':c.v)+c.c+'</div>';
d.innerHTML='<div class="c1">'+k+'</div>'+mid+'<div class="c2">'+k+'</div>';}return d;}
function banner(title,amt){const o=document.querySelector('.banner');if(o)o.remove();const b=document.createElement('div');b.className='banner';b.innerHTML='<b>'+title+'</b><span>€'+amt+'</span>';document.body.appendChild(b);setTimeout(()=>b.remove(),1400);}
function fillHand(el,cards){el.innerHTML='';(cards||[]).forEach(c=>el.appendChild(C(c)));}
async function playBet(v){
  if(dealing) return;
  lastBet=v;
  try{const ns=await api('/api/miser',{montant:v});await dealSeq(ns);ui(ns,true);}catch(e){if(e.message!=='Attends la fin') alert(e.message);}
}
async function dealSeq(s){
  dealing=true;$('dh').innerHTML='';$('ph').innerHTML='';$('dt').textContent='';$('pt').textContent='';
  const D=s.dealer||[],P=s.player||[];
  const seq=[{w:'ph',c:P[0]},{w:'dh',c:D[0]},{w:'ph',c:P[1]},{w:'dh',c:D[1]}].filter(x=>x.c);
  for(const step of seq){await new Promise(r=>setTimeout(r,430));sndCard();$(step.w).appendChild(C(step.c));}
  $('dt').textContent=s.dtot!=null?s.dtot:'';$('pt').textContent=s.ptot!=null?s.ptot:'';
  dealing=false;
}
async function revealDealer(s){
  dealing=true;$('msg').textContent='La banque tire…';$('dh').innerHTML='';
  for(const c of (s.dealer||[])){await new Promise(r=>setTimeout(r,480));sndCard();$('dh').appendChild(C(c));}
  $('dt').textContent=s.dtot!=null?s.dtot:'';
  dealing=false;
}
function ui(s,skipDeal){
  moi.solde=s.solde;$('solde').textContent='€'+s.solde;$('who').textContent=s.pseudo;$('msg').textContent=s.msg||'';
  const mid=$('chipon');const shown=s.bet||lastBet||'';mid.textContent=shown||'';mid.className='chipon'+(shown?' on'+shown:'');
  const seat=$('seat');seat.className='seat'+(seated?' on':'');seat.textContent=seated?(moi.pseudo||'TOI'):"S'ASSEOIR";
  if(!skipDeal){fillHand($('dh'),s.dealer);fillHand($('ph'),s.player);$('dt').textContent=s.dtot!=null?s.dtot:'';$('pt').textContent=s.ptot!=null?s.ptot:'';}
  $('sh').innerHTML='';if(s.split){const w=document.createElement('div');w.className='hand';s.split.forEach(c=>w.appendChild(C(c)));$('sh').appendChild(w);}
  const chips=$('chips'),acts=$('acts');chips.innerHTML='';acts.innerHTML='';
  if(s.phase==='end'&&(s.result==='gagne'||s.result==='blackjack')){sndWin();banner(s.result==='blackjack'?'BLACKJACK':'YOU WIN',s.bet||0);}
  if(s.phase==='end'&&s.result==='perdu') banner('YOU LOSE',0);
  if((s.phase==='bet'||s.phase==='end')&&seated){
    [10,25,50].forEach(v=>{const b=document.createElement('button');b.className='chip c'+v+(lastBet===v?' sel':'');b.textContent='♛ '+v;b.onclick=()=>{lastBet=v;sndChip();const mid=$('chipon');mid.textContent=v;mid.className='chipon on'+v;};chips.appendChild(b);});
    const go=document.createElement('button');go.className='p';go.style.minWidth='160px';go.style.fontSize='1rem';
    go.textContent=s.phase==='end'?'REJOUER':'JOUER';
    go.onclick=()=>{if(!lastBet){alert('Tape d abord un jeton (10 25 50)');return;}playBet(lastBet);};
    acts.appendChild(go);
  }
  if(s.phase==='play'){const actsList=[['Tirer','hit']];if(s.canDouble)actsList.push(['Doubler','double']);actsList.push(['Rester','stand']);actsList.forEach(([l,a],i)=>{const b=document.createElement('button');if(a==='stand')b.className='p';if(a==='double'){b.className='p';b.style.background='#1e5a9c';b.style.color='#fff';}b.textContent=l;b.onclick=async()=>{if(window._act)return;window._act=1;try{const ns=await api('/api/action',{action:a});
      const hand=ns.which===1&&ns.split?ns.split:ns.player;const last=hand&&hand[hand.length-1];
      if((a==='hit'||a==='double')&&last){sndCard();$('ph').appendChild(C(last));$('pt').textContent=ns.ptot!=null?ns.ptot:'';}
      if(a==='double'){const mid=$('chipon');mid.textContent=ns.bet||lastBet;mid.className='chipon on'+(ns.bet||lastBet);}
      moi.solde=ns.solde;$('solde').textContent='€'+ns.solde;
      if(ns.phase==='end'){await new Promise(r=>setTimeout(r,450));await revealDealer(ns);ui(ns,true);}
      else if(a!=='hit') ui(ns);
    }catch(e){alert(e.message);}window._act=0;};acts.appendChild(b);});
  if(s.canSplit){const b=document.createElement('button');b.textContent='Séparer';b.onclick=async()=>{try{ui(await api('/api/action',{action:'split'}));}catch(e){alert(e.message);}};acts.appendChild(b);}}}
function render(s){ui(s);}

$('go').onclick=async()=>{$('er').textContent='';try{const d=await api('/api/login',{pseudo:$('ps').value.trim(),code:$('cd').value});token=d.token;localStorage.setItem('bj.t',token);moi=d.moi;$('admBtn').style.display=moi.role==='admin'?'inline':'none';show('game');render(await api('/api/etat'));}catch(e){$('er').textContent=e.message;}};
$('leave').onclick=async()=>{try{await api('/api/quitter',{});}catch(e){}seated=false;lastBet=0;if(autoT)clearTimeout(autoT);$('dh').innerHTML='';$('ph').innerHTML='';$('dt').textContent='';$('pt').textContent='';$('acts').innerHTML='';$('chips').innerHTML='';api('/api/etat').then(render);};
$('seat').onclick=()=>{seated=true;api('/api/etat').then(render);};
$('out').onclick=()=>{if(autoT)clearTimeout(autoT);lastBet=0;token=null;localStorage.removeItem('bj.t');show('login');};
$('admBtn').onclick=async()=>{show('admin');const d=await api('/api/admin');const m=$('modes');m.innerHTML='<h2>Mode</h2>';Object.entries(d.modes).forEach(([k,l])=>{const b=document.createElement('button');b.textContent=l;b.style.margin='.2rem';if(d.mode===k)b.className='g';b.onclick=async()=>{await api('/api/admin',{mode:k});$('admBtn').click();};m.appendChild(b);});
const list=$('clist');list.innerHTML='';d.comptes.forEach(c=>{const r=document.createElement('div');r.className='row';r.innerHTML='<span>'+c.pseudo+' / '+c.code+' · €'+c.solde+'</span>';const i=document.createElement('input');i.type='number';i.placeholder='+/-';const ok=document.createElement('button');ok.className='g';ok.textContent='OK';ok.onclick=async()=>{await api('/api/admin',{jetons:{id:c.id,delta:+i.value||0}});$('admBtn').click();};r.appendChild(i);r.appendChild(ok);list.appendChild(r);});};
$('ncBtn').onclick=async()=>{await api('/api/admin',{nouveau:{pseudo:$('np').value,code:$('nc').value,solde:+$('ns').value||2000}});$('admBtn').click();};
$('back').onclick=async()=>{show('game');render(await api('/api/etat'));};
if(token){api('/api/etat').then(s=>{moi={pseudo:s.pseudo,role:s.role,solde:s.solde};$('admBtn').style.display=s.role==='admin'?'inline':'none';show('game');render(s);}).catch(()=>{});}
</script></body></html>`;
http.createServer(async(req,res)=>{const p=new URL(req.url,'http://x').pathname;if(p.startsWith('/api/'))return api(req,res,p);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(PAGE);}).listen(PORT,()=>console.log('BJ',PORT));
