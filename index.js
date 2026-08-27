const http=require('http');const crypto=require('crypto');
const PORT=process.env.PORT||3000;const id=()=>crypto.randomBytes(8).toString('hex');
const MODE={aleatoire:'Aléatoire',bingo:'Bingo banque',gros_gain:'Gros gain',gain:'Gain banque',perte:'Perte 6',grosse_perte:'Joueur 7',pipo:'Joueur 9',maxi:'Joueur 10'};
let mode='aleatoire';let plan=[];const comptes=new Map();const sessions=new Map();
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function refillPlan(){
  const bank={bingo:8,gros_gain:7,gain:6}[mode];
  const ply={maxi:10,pipo:9,grosse_perte:7,perte:6}[mode];
  plan=[];
  if(mode==='aleatoire'||(!bank&&!ply))return;
  const n=bank||0, p=ply||0, rest=10-(n||p);
  if(bank){for(let i=0;i<n;i++)plan.push('bank');for(let i=0;i<rest;i++)plan.push('player');}
  else{for(let i=0;i<p;i++)plan.push('player');for(let i=0;i<rest;i++)plan.push('bank');}
  shuffle(plan);
}
let streak=[];
function takeFavor(){
  if(mode==='aleatoire')return null;
  if(!plan.length)refillPlan();
  let f=plan.pop()||null;
  if(f&&streak.length>=2&&streak.slice(-2).every(x=>x===f)){
    const o=f==='bank'?'player':'bank';
    const i=plan.lastIndexOf(o);
    if(i>=0){plan[i]=f;f=o;}else f=o;
  }
  return f;
}
function add(p,c,r,s){const x={id:id(),pseudo:p,code:c,role:r,solde:s};comptes.set(x.id,x);return x;}
add('Patron','admin21','admin',999999);add('maelu','tuleccc','joueur',5000);
function shoe(){const C=['♠','♥','♦','♣'],V=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];const a=[];for(let d=0;d<5;d++)for(const c of C)for(const v of V)a.push({v,c,id:id()});return shuffle(a);}
function val(c){if(['J','Q','K'].includes(c.v))return 10;if(c.v==='A')return 11;return +c.v;}
function tot(m){let t=0,a=0;for(const c of m||[]){t+=val(c);if(c.v==='A')a++;}while(t>21&&a){t-=10;a--;}return t;}
function bj(m){return m&&m.length===2&&tot(m)===21;}
function pair(m){const r=c=>['10','J','Q','K'].includes(c.v)?'10':c.v;return m&&m.length===2&&r(m[0])===r(m[1]);}
const g={sabot:shoe(),dealer:[],player:[],split:null,which:0,bet:0,bet2:0,phase:'bet',msg:'Choisis une mise',result:'',uid:null,gain:0};
function draw(forD,pTot){
  if(g.sabot.length<30)g.sabot=shoe();
  if(!g.favor||Math.random()<0.45)return g.sabot.pop();
  const bank=g.favor==='bank';
  const sl=g.sabot.slice(-14);
  const tgt=forD?(bank?18:17):(bank?16:18);
  const now=forD?tot(g.dealer):(pTot==null?tot(g.player):pTot);
  const score=c=>{
    const n=now+ (c.v==='A'?(now+11<=21?11:1):val(c));
    if(n>=20)return 30+n;
    if(n>21)return bank===forD?80:4;
    return Math.abs(n-tgt)+(n>19?2:0);
  };
  const pick=sl.slice().sort((a,b)=>score(a)-score(b))[Math.random()<0.5?0:Math.min(1,sl.length-1)];
  const i=g.sabot.lastIndexOf(pick);if(i>=0)g.sabot.splice(i,1);else return g.sabot.pop();return pick;
}
function pub(moi){const hide=g.phase==='play'&&g.dealer[1];return{phase:g.phase,msg:g.msg,result:g.result,bet:g.bet,dealer:g.dealer.map((c,i)=>hide&&i===1?{v:'?',c:'?'}:c),dtot:hide?val(g.dealer[0]||{v:'0'}):(g.dealer.length?tot(g.dealer):null),player:g.player,ptot:g.player.length?tot(g.player):null,split:g.split,stot:g.split?tot(g.split):null,bet2:g.bet2,which:g.which,canSplit:(()=>{const hs=g.hands&&g.hands.length?g.hands:[{cards:g.player,bet:g.bet}].concat(g.split?[{cards:g.split,bet:g.bet2}]:[]);const h=hs[g.which]||hs[0];return g.phase==='play'&&pair(h&&h.cards)&&hs.length<2;})(),canDouble:g.phase==='play'&&((g.which===1&&g.split)?g.split.length===2:g.player.length===2)&&moi.solde>=((g.which===1&&g.split)?(g.bet2||g.bet):g.bet),hands:(g.hands&&g.hands.length?g.hands:[{cards:g.player,bet:g.bet}].concat(g.split?[{cards:g.split,bet:g.bet2}]:[])).map(h=>({cards:h.cards,bet:h.bet,tot:tot(h.cards)})),gain:g.gain||0,solde:moi.solde,pseudo:moi.pseudo,role:moi.role};}
function settle(hand,bet,c,splitHand){const pj=tot(hand),dj=tot(g.dealer);if(pj>21){g.gain-=bet;return'perdu';}if(!splitHand&&bj(hand)&&!bj(g.dealer)){const w=Math.floor(bet*1.5);c.solde+=bet+w;g.gain+=w;return'blackjack';}if(dj>21||pj>dj){c.solde+=bet*2;g.gain+=bet;return'gagne';}if(pj===dj){c.solde+=bet;return'egalite';}g.gain-=bet;return'perdu';}
function finish(c){g.gain=0;const hs=g.hands&&g.hands.length?g.hands:[{cards:g.player,bet:g.bet}].concat(g.split?[{cards:g.split,bet:g.bet2}]:[]);const pOut=hs.every(h=>tot(h.cards)>21);if(!pOut){while(tot(g.dealer)<17)g.dealer.push(draw(true));}const ts=hs.map((h,i)=>settle(h.cards,h.bet,c,i>0||hs.length>1));g.phase='end';g.result=ts.join(' / ');g.msg=g.result.includes('gagne')||g.result.includes('blackjack')?'Gagné':g.result.includes('egalite')?'Égalité':'Perdu';if(g.result.includes('egalite')){}else if(g.result.includes('gagne')||g.result.includes('blackjack'))streak.push('player');else streak.push('bank');if(streak.length>8)streak=streak.slice(-8);}
function me(req){const h=req.headers.authorization||'';const t=h.startsWith('Bearer ')?h.slice(7):null;return t&&sessions.has(t)?comptes.get(sessions.get(t)):null;}
function read(req){return new Promise(r=>{let d='';req.on('data',x=>d+=x);req.on('end',()=>{try{r(JSON.parse(d||'{}'));}catch{r({});}});});}
function json(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(o));}
async function api(req,res,path){
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end();}
  const b=req.method==='POST'?await read(req):{};
  if(path==='/api/login'&&req.method==='POST'){let c=null;for(const x of comptes.values())if(x.pseudo.toLowerCase()===String(b.pseudo||'').toLowerCase()&&x.code===String(b.code||''))c=x;if(!c)return json(res,401,{err:'Code refusé'});if(c.solde<10)c.solde=3000;const t=id()+id();sessions.set(t,c.id);return json(res,200,{token:t,moi:{pseudo:c.pseudo,role:c.role,solde:c.solde}});}
  const u=me(req);if(!u)return json(res,401,{err:'Session'});
  if(path==='/api/etat')return json(res,200,pub(u));
  if(path==='/api/miser'&&req.method==='POST'){if(g.phase!=='bet'&&g.phase!=='end')return json(res,400,{err:'Attends la fin'});const m=+b.montant;if(!(m>=10&&m<=100))return json(res,400,{err:'Mise 10 a 100'});if(u.solde<m)return json(res,400,{err:'Solde'});g.uid=u.id;g.player=[];g.split=null;g.hands=[];g.dealer=[];g.which=0;g.result='';g.favor=takeFavor();u.solde-=m;g.bet=m;g.bet2=0;g.player.push(draw(false,0));g.dealer.push(draw(true));g.player.push(draw(false,tot(g.player)));g.dealer.push(draw(true));if(bj(g.player)){g.phase='end';if(!bj(g.dealer)){u.solde+=Math.floor(m*2.5);g.gain=Math.floor(m*1.5);g.msg='Blackjack';g.result='blackjack';}else{u.solde+=m;g.gain=0;g.msg='Égalité';g.result='egalite';}g.hands=[{cards:g.player,bet:g.bet}];}else{g.phase='play';g.msg='Ton tour : Tirer, Doubler ou Rester';g.hands=[{cards:g.player,bet:g.bet}];}return json(res,200,pub(u));}
  if(path==='/api/action'&&req.method==='POST'){if(g.phase!=='play')return json(res,400,{err:'Pas le moment de tirer'});g.uid=u.id;if(!g.hands||!g.hands.length)g.hands=[{cards:g.player,bet:g.bet}].concat(g.split?[{cards:g.split,bet:g.bet2||g.bet}]:[]);const H=g.hands[g.which]||g.hands[0];const hand=H.cards;const a=b.action;const next=()=>{g.player=g.hands[0].cards;g.bet=g.hands[0].bet;g.split=g.hands[1]?g.hands[1].cards:null;g.bet2=g.hands[1]?g.hands[1].bet:0;if(g.which<g.hands.length-1){g.which++;g.msg='Main '+(g.which+1);}else finish(u);};
    if(a==='hit'){hand.push(draw(false,tot(hand)));if(tot(hand)>21)next();}
    else if(a==='stand')next();
    else if(a==='double'){if(hand.length!==2)return json(res,400,{err:'2 cartes'});if(u.solde<H.bet)return json(res,400,{err:'Solde'});u.solde-=H.bet;H.bet*=2;hand.push(draw(false,tot(hand)));next();}
    else if(a==='split'){if(!g.hands||!g.hands.length)g.hands=[{cards:g.player,bet:g.bet}].concat(g.split?[{cards:g.split,bet:g.bet2||g.bet}]:[]);const h=g.hands[g.which];if(!pair(h.cards)||g.hands.length>=2)return json(res,400,{err:'Deja separe'});if(u.solde<h.bet)return json(res,400,{err:'Solde'});u.solde-=h.bet;const ace=h.cards[0].v==='A';const c2=h.cards.pop();const nh={cards:[c2],bet:h.bet};h.cards.push(draw(false,tot(h.cards)));nh.cards.push(draw(false,tot(nh.cards)));g.hands.splice(g.which+1,0,nh);g.player=g.hands[0].cards;g.bet=g.hands[0].bet;g.split=g.hands[1]?g.hands[1].cards:null;g.bet2=g.hands[1]?g.hands[1].bet:0;if(ace){g.msg='As separes';g.which=Math.min(g.which+1,g.hands.length-1);if(g.which>=g.hands.length-1)finish(u);}else{g.msg='Main '+(g.which+1);}}
    else return json(res,400,{err:'Action'});return json(res,200,pub(u));}
  if(path==='/api/quitter'&&req.method==='POST'){
    if(g.uid===u.id||!g.uid){
      if(g.phase==='play'){if(g.hands&&g.hands.length)g.hands.forEach(h=>u.solde+=(h.bet||0));else{u.solde+=g.bet||0;if(g.bet2)u.solde+=g.bet2;}}
      g.player=[];g.dealer=[];g.split=null;g.hands=[];g.bet=0;g.bet2=0;g.which=0;g.phase='bet';g.msg='Mise';g.result='';g.uid=null;g.gain=0;
    }
    return json(res,200,pub(u));
  }
  if(path==='/api/admin'&&u.role==='admin'){if(req.method==='GET')return json(res,200,{mode,modes:MODE,comptes:[...comptes.values()].map(c=>({id:c.id,pseudo:c.pseudo,code:c.code,role:c.role,solde:c.solde}))});if(b.mode&&MODE[b.mode]){mode=b.mode;plan=[];g.favor=null;refillPlan();}if(b.nouveau&&b.nouveau.pseudo&&b.nouveau.code)add(b.nouveau.pseudo,b.nouveau.code,'joueur',+b.nouveau.solde||2000);if(b.jetons&&b.jetons.id){const c=comptes.get(b.jetons.id);if(c)c.solde=Math.max(0,c.solde+(+b.jetons.delta||0));}return json(res,200,{ok:true,mode});}
  if(path==='/api/live'&&u.role==='admin'){
    const pl=g.uid?comptes.get(g.uid):null;
    return json(res,200,{
      phase:g.phase,msg:g.msg,bet:g.bet,bet2:g.bet2,result:g.result,
      joueur:pl?pl.pseudo:null,soldeJoueur:pl?pl.solde:null,
      dealer:g.dealer,player:g.player,split:g.split,ptot:g.player.length?tot(g.player):null,dtot:g.dealer.length?tot(g.dealer):null,
      comptes:[...comptes.values()].map(c=>({pseudo:c.pseudo,role:c.role,solde:c.solde}))
    });
  }
  return json(res,404,{err:'?'});
}
const PAGE=`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><title>Blackjack</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,-apple-system,sans-serif;background:#0c1812;color:#f4efe4}
.v{display:none;min-height:100dvh;flex-direction:column}.v.on{display:flex}
#login{align-items:center;justify-content:center;background:radial-gradient(circle at 30% 20%,#5a1212,#0a0404);padding:1.5rem;text-align:center}
h1{letter-spacing:.2em;font-weight:500;margin:.6rem 0 1.2rem}
input{width:100%;max-width:320px;padding:.8rem;margin:.3rem 0;border:1px solid #c9a22766;background:#1a0808;color:#fff;text-align:center;border-radius:8px}
button{border:0;border-radius:8px;padding:.7rem 1rem;font-weight:700}
.g{background:linear-gradient(#e8d48b,#b8860b);color:#1a1205}.err{color:#f87171;min-height:1.2em}
.bar{display:flex;justify-content:space-between;align-items:center;padding:.6rem .8rem;background:#07110c}
.felt{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:.5rem .5rem .3rem;display:flex;flex-direction:column;align-items:center;gap:.3rem;background:
radial-gradient(ellipse at 50% 12%,#3a9a68 0%,#1a6b44 42%,#0c3a28 100%);}

.hands-row{display:flex;justify-content:center;gap:1rem;width:100%;align-items:flex-start}
.col{min-width:120px;padding:.25rem;border-radius:10px}
.col.on{outline:2px solid #e8d48b;background:#0003}
.hlab{font-size:.58rem;letter-spacing:.12em;text-align:center;opacity:.7;margin-bottom:.2rem}
.lab{font-size:.65rem;letter-spacing:.18em;opacity:.7;color:#f0d9a0}
.hand{display:flex;gap:0;min-height:88px}
.card{width:66px;height:96px;margin-right:-16px;border-radius:7px;background:linear-gradient(#fffef6,#f4ead4 55%,#e8dcc0);color:#1a1208;position:relative;box-shadow:0 10px 16px #0007,0 1px 0 #fff8 inset,0 0 0 1px #cbb896;animation:deal .22s ease-out;flex-shrink:0}
.card .c1,.card .c2{position:absolute;width:18px;text-align:center;font-family:Georgia,'Times New Roman',serif;font-weight:800;line-height:1.05;font-size:.78rem}
.card .c1{top:5px;left:4px}.card .c2{bottom:5px;right:4px;transform:rotate(180deg)}
.card .pip{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);font-size:1.35rem;font-family:Georgia,serif}
.pips{position:absolute;left:16px;right:16px;top:16px;bottom:16px;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:repeat(3,1fr);place-items:center;font-size:.95rem}
.card.r{color:#c41e3a}
.card.x{background:repeating-linear-gradient(45deg,#6e1522 0 7px,#8b1e2d 7px 14px);color:transparent;border:2px solid #fff}
@keyframes deal{from{transform:translate(-40px,-18px) rotate(-8deg);opacity:.4}to{transform:none;opacity:1}}
.acts button,.chip{transition:transform .18s ease,box-shadow .18s ease,opacity .18s}
.acts button:active,.chip:active{transform:scale(.94)}
.tot{background:#0006;padding:.15rem .5rem;border-radius:99px;font-size:.8rem}
.seat{width:72px;height:72px;border-radius:50%;border:3px solid #2dff7a;box-shadow:0 0 14px #2dff7a66,inset 0 0 12px #0004;display:flex;align-items:center;justify-content:center;font-size:.58rem;letter-spacing:.06em;color:#d8ffe8;margin:.2rem auto;background:#0a2a18}
.seat.on{border-color:#f0c14a;color:#f0c14a;box-shadow:0 0 16px #f0c14a66}
.chipon{width:48px;height:48px;border-radius:50%;border:5px dotted #fff8;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;color:#fff;margin:.2rem auto;background:radial-gradient(circle at 35% 30%,#666,#111);box-shadow:0 4px 10px #0008}
.dock{flex-shrink:0;z-index:25;padding:.4rem .5rem calc(.55rem + env(safe-area-inset-bottom));background:repeating-linear-gradient(90deg,#4a2e1a 0 8px,#2a1810 8px 16px);border-top:3px solid #c9a22766}
.chips{display:flex;justify-content:center;gap:.5rem;margin-bottom:.5rem}
.chip{width:64px;height:64px;padding:0;border:0;background:transparent;border-radius:50%;box-shadow:none;-webkit-appearance:none;appearance:none}
.chip svg{width:64px;height:64px;display:block;filter:drop-shadow(0 6px 8px #0009)}
.chip.sel svg{transform:translateY(-5px) scale(1.08)}
.c10{color:#1e4ec4}.c25{color:#1a8a3a}.c50{color:#c42838}
.chipon{width:56px;height:56px;margin:.15rem auto;background:none;border:0}.chipon svg{width:56px;height:56px;filter:drop-shadow(0 4px 6px #0008)}
.chipon.on10{background:repeating-conic-gradient(#fff 0 14deg,#1a46b8 14deg 28deg)}
.chipon.on25{background:repeating-conic-gradient(#fff 0 14deg,#0f7a32 14deg 28deg)}
.chipon.on50{background:repeating-conic-gradient(#fff 0 14deg,#c41e3a 14deg 28deg)}
.banner{position:fixed;left:14%;right:14%;bottom:24%;z-index:30;background:#000b;border:1px solid #e8d48b;border-radius:10px;padding:.35rem .65rem;text-align:center;pointer-events:none}
.banner b{display:block;letter-spacing:.2em;color:#e8d48b;font-size:.55rem}
.banner span{font-size:1rem;font-weight:800;color:#fff}
.acts{display:flex;justify-content:center;gap:.4rem;flex-wrap:wrap}
.acts button{background:#c9a22722;color:#f4efe4;border:1px solid #c9a22755;min-height:44px;min-width:70px;-webkit-appearance:none}
.acts .p{background:linear-gradient(#e8d48b,#b8860b);color:#1a1205;border:0}

#game{background:#3a2418;padding:6px;height:100vh;height:100dvh;max-height:100dvh;overflow:hidden;position:relative;display:flex;flex-direction:column}
#game .bar{display:none}
.felt-top{width:100%;display:flex;justify-content:space-between;padding:0 .15rem .2rem}
.mini{text-align:center;opacity:.65}
.mini .mb{width:38px;height:10px;background:#4a2a1c;border-radius:2px;margin:0 auto .12rem}
.mini .mb.s{background:#6b5a28}
.mini span{font-size:.48rem;letter-spacing:.14em}
.arc{text-align:center;color:#c9b87a;opacity:.55;font-size:.62rem;letter-spacing:.07em;margin:.25rem 0;line-height:1.35}
.oval{width:130px;height:58px;border:2px solid rgba(201,176,90,.5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:.15rem auto}
.vous{font-size:.58rem;letter-spacing:.22em;opacity:.5;margin-top:.1rem}
.rail{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(#5a3a22,#2a1810);padding:.4rem .75rem calc(.4rem + env(safe-area-inset-bottom));border-top:2px solid #c9a22755;flex-shrink:0}
.rail-cell{text-align:center;min-width:72px}
.rail .rk{font-size:.52rem;letter-spacing:.16em;opacity:.65}
.rail .rv{font-size:1.1rem;font-weight:700;color:#f0e0a8}

.hud{display:none;position:absolute;top:6px;right:6px;left:auto;width:42%;max-width:168px;z-index:12;background:#0b0b0bd4;border:1px solid #c9a22766;border-radius:10px;padding:.3rem .4rem;font-size:.6rem;pointer-events:none;max-height:28%;overflow:auto}
.hud.on{display:block}
.hud b{color:#e8d48b}
.hud .line{display:flex;justify-content:space-between;gap:.5rem;padding:.12rem 0;border-bottom:1px solid #fff1}
.out2{background:#3a1212;color:#f4efe4;border:1px solid #c9a22744;padding:.35rem .55rem;border-radius:8px;font-size:.68rem}
.gear{width:40px;height:40px;border-radius:50%;background:#2a1810;border:1px solid #c9a22755;color:#e8d48b;font-size:1.1rem}
.livebox{background:#1a1a1a;border:1px solid #c9a22744;border-radius:10px;padding:.7rem;margin:.6rem 0}
.livebox .p{display:flex;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid #fff1}
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
<div class="bar"><b id="who"></b><span id="solde"></span><span><button class="g" id="admBtn" style="display:none;padding:.35rem .6rem">Admin</button> <button id="leave" style="background:#4a2a16;color:#f4efe4;padding:.35rem .55rem">Lever</button> <button id="out" style="background:#333;color:#fff;padding:.35rem .6rem">Déconnexion</button></span></div>
<div class="felt">
  <div class="felt-top"><div class="mini"><div class="mb"></div><span>TALON</span></div><div class="lab">CROUPIER</div><div class="mini"><div class="mb s"></div><span>SABOT</span></div></div>
  <div class="hand" id="dh"></div><div class="tot" id="dt"></div>
  <div class="arc">LE BLACKJACK PAIE 3 POUR 2<br><small>LA BANQUE TIRE A 16 · RESTE A 17</small></div>
  <div class="oval"><div class="chipon" id="chipon"></div></div>
  <div id="msg"></div>
  <div class="hands-row" id="handsRow"><div class="col" id="col1"><div class="hlab" id="lab1">VOUS</div><div class="hand" id="ph"></div><div class="tot" id="pt"></div></div><div class="col" id="col2" style="display:none"><div class="hlab" id="lab2">MAIN 2</div><div class="hand" id="sh"></div><div class="tot" id="st"></div></div></div>
  <div class="vous">VOUS</div>
  <div class="seat" id="seat">S ASSEOIR</div>
</div>
<div class="rail">
  <div class="rail-cell"><div class="rk">SOLDE</div><div class="rv" id="railSolde">0</div></div>
  <div class="rail-cell"><div class="rk">MISE</div><div class="rv" id="railMise">0</div></div>
  <div style="display:flex;gap:.35rem;align-items:center">
    <button class="out2" id="out2">Déconnexion</button>
    <button class="gear" id="gear">⚙</button>
  </div>
</div>
<div class="hud" id="hud"><div id="hudTxt">Live…</div></div>
<div class="dock"><div class="chips" id="chips"></div><div class="acts" id="acts"></div></div></div>
<div id="admin" class="v"><div class="bar"><b>Régie</b><button class="g" id="back">Retour</button></div>
<div class="livebox"><b>Live table</b><div id="liveGame">—</div></div>
<h2>Soldes en direct</h2><div id="liveSoldes"></div>
<div id="modes"></div><h2>Nouveau compte</h2>
<div class="row"><input id="np" placeholder="Pseudo"><input id="nc" placeholder="Code"><input id="ns" type="number" value="2000"><button class="g" id="ncBtn">Créer</button></div>
<h2>Comptes</h2><div id="clist"></div></div>
<script>
const $=i=>document.getElementById(i);let token=localStorage.getItem('bj.t'),moi=null;
function show(i){document.querySelectorAll('.v').forEach(x=>x.classList.remove('on'));$(i).classList.add('on');}
async function api(p,b){const o={method:b?'POST':'GET',headers:{'Content-Type':'application/json'}};if(token)o.headers.Authorization='Bearer '+token;if(b)o.body=JSON.stringify(b);const r=await fetch(p,o);const d=await r.json();if(r.status===401){token=null;localStorage.removeItem('bj.t');show('login');throw new Error('Session');}if(!r.ok)throw new Error(d.err||'Erreur');return d;}
let seated=false, dealing=false, lastBet=0, autoT=null, actx=null;
function beep(f,ms){try{if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();if(actx.state==='suspended')actx.resume();const t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.07,t);g.gain.exponentialRampToValueAtTime(.001,t+(ms||.12));o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+(ms||.14));}catch(e){}}
function noise(ms,freq,type,vol){try{if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();if(actx.state==='suspended')actx.resume();const n=actx.createBuffer(1,Math.max(1,Math.floor(actx.sampleRate*(ms||.06))),actx.sampleRate);const d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*.22));const s=actx.createBufferSource();s.buffer=n;const f=actx.createBiquadFilter();f.type=type||'bandpass';f.frequency.value=freq||1400;f.Q.value=0.8;const g=actx.createGain();g.gain.value=vol||.22;s.connect(f);f.connect(g);g.connect(actx.destination);s.start();}catch(e){}}
function sndCard(){noise(.07,900,'highpass',.16);setTimeout(()=>noise(.03,2200,'bandpass',.2),18);}
function sndChip(){noise(.04,700,'lowpass',.18);setTimeout(()=>beep(210,.04),25);}
function sndWin(){noise(.05,1800,'bandpass',.12);beep(980,.06);setTimeout(()=>beep(1320,.08),80);setTimeout(()=>beep(1760,.1),160);}
function sndLose(){noise(.08,400,'lowpass',.12);beep(160,.14);}
const PIPS={A:[5],'2':[2,8],'3':[2,5,8],'4':[1,3,7,9],'5':[1,3,5,7,9],'6':[1,3,4,6,7,9],'7':[1,3,4,5,6,7,9],'8':[1,3,4,5,6,7,8,9],'9':[1,2,3,4,6,7,8,9],'10':[1,2,3,4,5,6,7,8,9]};
function svgChip(v,col){const dash=[];for(let i=0;i<16;i++){const a=i*22.5;dash.push('<path d="M38 4 A34 34 0 0 1 38 4" stroke="none"/>');}
return '<svg viewBox="0 0 76 76" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g'+v+'" cx="35%" cy="30%"><stop offset="0%" stop-color="#fff6"/><stop offset="55%" stop-color="'+col+'"/><stop offset="100%" stop-color="#0006"/></radialGradient></defs><circle cx="38" cy="38" r="36" fill="#e8c76a"/><circle cx="38" cy="38" r="33" fill="'+col+'"/><g stroke="#fff" stroke-width="6" fill="none">'+Array.from({length:16},(_,i)=>{const a=i*22.5*Math.PI/180;const x1=38+Math.cos(a)*30,y1=38+Math.sin(a)*30,x2=38+Math.cos(a)*36,y2=38+Math.sin(a)*36;return '<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'"/>';}).join('')+'</g><circle cx="38" cy="38" r="24" fill="url(#g'+v+')"/><g stroke="#f1d48a" stroke-width=".6" opacity=".45">'+Array.from({length:16},(_,i)=>{const a=i*22.5*Math.PI/180;return '<line x1="38" y1="38" x2="'+(38+Math.cos(a)*23).toFixed(1)+'" y2="'+(38+Math.sin(a)*23).toFixed(1)+'"/>';}).join('')+'</g><path d="M28 28 L31 22 L34 28 L38 22 L42 28 L45 22 L48 28 L46 31 L30 31 Z" fill="#f3e2a6"/><text x="38" y="50" text-anchor="middle" font-size="16" font-weight="800" fill="#fff" font-family="Georgia,serif">'+v+'</text></svg>';}
function C(c){const d=document.createElement('div');const hid=!c||c.v==='?';d.className='card'+(hid?' x':((c.c==='♥'||c.c==='♦')?' r':''));
if(!hid){const k=c.v+'<br>'+c.c;let mid='';
if(PIPS[c.v]){mid='<div class="pips">'+[1,2,3,4,5,6,7,8,9].map(n=>'<span>'+(PIPS[c.v].includes(n)?c.c:'')+'</span>').join('')+'</div>';}
else mid='<div class="pip">'+(c.v==='J'?'V':c.v==='Q'?'D':c.v)+c.c+'</div>';
d.innerHTML='<div class="c1">'+k+'</div>'+mid+'<div class="c2">'+k+'</div>';}return d;}
function totC(m){let t=0,a=0;for(const c of m||[]){if(!c||c.v==="?")continue;const v=(c.v==="A"?11:["J","Q","K","V","D","R"].includes(c.v)?10:+c.v);t+=v;if(c.v==="A")a++;}while(t>21&&a){t-=10;a--;}return t;}
function banner(title,amt){const o=document.querySelector('.banner');if(o)o.remove();const b=document.createElement('div');b.className='banner';b.innerHTML='<b>'+title+'</b><span>'+amt+'</span>';document.body.appendChild(b);setTimeout(()=>b.remove(),1000);}
function fillHand(el,cards){el.innerHTML='';(cards||[]).forEach((c,i,a)=>{const d=C(c);if(i<a.length-1)d.style.animation='none';el.appendChild(d);});}
async function playBet(v){
  if(dealing) return;
  lastBet=v;
  try{const ns=await api('/api/miser',{montant:v});await dealSeq(ns);ui(ns,'keep');}catch(e){if(e.message!=='Attends la fin') alert(e.message);}
}
async function dealSeq(s){
  dealing=true;
  $('dh').innerHTML='';$('dt').textContent='';
  const row=$('handsRow');
  if(row)row.innerHTML='<div class="col"><div class="hlab">VOUS</div><div class="hand" id="ph"></div><div class="tot" id="pt"></div></div>';
  const D=s.dealer||[],P=s.player||[];
  const seq=[{w:'ph',c:P[0]},{w:'ph',c:P[1]},{w:'dh',c:D[0]},{w:'dh',c:D[1]}].filter(x=>x.c);
  const seenD=[],seenP=[];
  for(const step of seq){await new Promise(r=>setTimeout(r,280));sndCard();const box=$(step.w);if(box)box.appendChild(C(step.c));
    if(step.w==='ph'){seenP.push(step.c);if($('pt'))$('pt').textContent=totC(seenP);}
    else{seenD.push(step.c);$('dt').textContent=totC(seenD.filter(c=>c&&c.v!=='?'));}
  }
  dealing=false;
}
async function revealDealer(s){
  dealing=true;$('msg').textContent='La banque tire…';
  const D=s.dealer||[];
  const box=$('dh');
  const kids=[...box.children];
  const shown=[D[0]].filter(Boolean);
  if(D[1]){
    if(kids[1]){kids[1].replaceWith(C(D[1]));sndCard();}
    else {box.appendChild(C(D[1]));sndCard();}
    shown.push(D[1]);$('dt').textContent=totC(shown);
    await new Promise(r=>setTimeout(r,170));
  }
  for(let i=2;i<D.length;i++){
    if(box.children[i]) continue;
    await new Promise(r=>setTimeout(r,170));
    sndCard();box.appendChild(C(D[i]));shown.push(D[i]);$('dt').textContent=totC(shown);
  }
  $('dt').textContent=s.dtot!=null?s.dtot:totC(D);
  dealing=false;
}
function paintHands(s){
  const HS=s.hands&&s.hands.length?s.hands:[{cards:s.player,bet:s.bet}].concat(s.split?[{cards:s.split,bet:s.bet2}]:[]);
  const row=$('handsRow'); if(!row)return HS;
  row.innerHTML='';
  HS.slice(0,2).forEach((h,i)=>{
    const col=document.createElement('div');
    col.className='col'+(s.which===i&&s.phase==='play'?' on':'');
    const lab=document.createElement('div');lab.className='hlab';lab.textContent=HS.length>1?('MAIN '+(i+1)+' · €'+(h.bet||0)):'VOUS';
    const hd=document.createElement('div');hd.className='hand';fillHand(hd,h.cards||[]);
    const tt=document.createElement('div');tt.className='tot';tt.textContent=totC(h.cards||[]);
    col.appendChild(lab);col.appendChild(hd);col.appendChild(tt);row.appendChild(col);
  });
  return HS;
}
function ui(s,skipDeal){
  moi.solde=s.solde;$('solde').textContent='€'+s.solde;if($('railSolde'))$('railSolde').textContent=s.solde;if($('railMise'))$('railMise').textContent=s.bet||lastBet||0;$('who').textContent=s.pseudo;$('msg').textContent=s.msg||'';
  const mid=$('chipon');const shown=s.bet||lastBet||0;if(shown){mid.innerHTML=svgChip(shown,shown>=50?'#c42838':shown>=25?'#1a8a3a':'#1e4ec4');}else mid.innerHTML='';mid.className='chipon';
  const seat=$('seat');seat.className='seat'+(seated?' on':'');seat.textContent=seated?(moi.pseudo||'TOI'):"S'ASSEOIR";
  const HS=s.hands&&s.hands.length?s.hands:[{cards:s.player,bet:s.bet,tot:s.ptot}].concat(s.split?[{cards:s.split,bet:s.bet2,tot:s.stot}]:[]);
  if(!skipDeal){fillHand($('dh'),s.dealer);$('dt').textContent=s.dtot!=null?s.dtot:'';}
  const row=$('handsRow');
  if(row&&skipDeal!=='keep'){
    row.innerHTML='';
    HS.slice(0,2).forEach((h,i)=>{
      const col=document.createElement('div');
      col.className='col'+(s.which===i&&s.phase==='play'?' on':'');
      const lab=document.createElement('div');lab.className='hlab';lab.textContent=HS.length>1?('MAIN '+(i+1)+' · €'+(h.bet||0)):'VOUS';
      const hd=document.createElement('div');hd.className='hand';fillHand(hd,h.cards||[]);
      const tt=document.createElement('div');tt.className='tot';tt.textContent=totC(h.cards||[]);
      col.appendChild(lab);col.appendChild(hd);col.appendChild(tt);row.appendChild(col);
    });
  }
  if(HS.length>1&&s.phase==='play') $('msg').textContent='Tu joues la MAIN '+(Number(s.which)+1)+' / '+HS.length;
  const chips=$('chips'),acts=$('acts');chips.innerHTML='';acts.innerHTML='';
  const stake=(s.bet||0)+(s.split?(s.bet2||0):0);const aff=s.gain!=null?s.gain:(s.result==='perdu'?-stake:stake);
  if(s.phase==='end'&&(s.result==='gagne'||s.result==='blackjack'||(s.result||'').includes('gagne'))){sndWin();banner(s.result==='blackjack'?'BLACKJACK':'YOU WIN',(aff>=0?'+':'')+'€'+Math.abs(aff));}
  if(s.phase==='end'&&(s.result==='perdu'||((s.result||'').includes('perdu')&&!(s.result||'').includes('gagne')))){sndLose();banner('PERDU','-€'+Math.abs(aff||stake));}
  if((s.phase==='bet'||s.phase==='end')&&seated){
    [10,25,50].forEach(v=>{const b=document.createElement('button');b.className='chip c'+v;b.innerHTML=svgChip(v,v===10?'#1e4ec4':v===25?'#1a8a3a':'#c42838');b.onclick=()=>{if(lastBet+v>100){alert('Mise max 100');return;}lastBet+=v;sndChip();const mid=$('chipon');mid.innerHTML=svgChip(lastBet,v===10?'#1e4ec4':v===25?'#1a8a3a':'#c42838');mid.className='chipon';};chips.appendChild(b);});
    const clr=document.createElement('button');clr.textContent='Effacer';clr.onclick=()=>{lastBet=0;const mid=$('chipon');mid.textContent='';mid.className='chipon';};
    const go=document.createElement('button');go.className='p';go.style.minWidth='140px';go.style.fontSize='1rem';
    go.textContent=s.phase==='end'?'REJOUER':'JOUER';
    go.onclick=()=>{if(lastBet<10){alert('Mets au moins 10 au centre');return;}if(lastBet>100){alert('Max 100');return;}playBet(lastBet);};
    acts.appendChild(clr);
    acts.appendChild(go);
  }
  if(s.phase==='play'){window._hand=s.which||0;const actsList=[['Tirer','hit']];if(s.canDouble)actsList.push(['Doubler','double']);actsList.push(['Rester','stand']);actsList.forEach(([l,a],i)=>{const b=document.createElement('button');if(a==='stand')b.className='p';if(a==='double'){b.className='p';b.style.background='#1e5a9c';b.style.color='#fff';}b.textContent=l;b.onclick=async()=>{if(window._act)return;window._act=1;try{const ns=await api('/api/action',{action:a});sndCard();
      paintHands(ns);
      if(a==='double'||a==='hit')await new Promise(r=>setTimeout(r,420));
      if(ns.phase==='end'){await revealDealer(ns);ui(ns,'keep');}
      else ui(ns,'keep');
    }catch(e){alert(e.message);}window._act=0;};acts.appendChild(b);});
  const cur=HS[s.which]||HS[0];
  const canSp=s.phase==='play'&&HS.length<2&&cur&&cur.cards&&cur.cards.length===2&&cur.cards[0].v&&(cur.cards[0].v===cur.cards[1].v||['10','J','Q','K'].includes(cur.cards[0].v)&&['10','J','Q','K'].includes(cur.cards[1].v));
  if(canSp){const b=document.createElement('button');b.textContent='Séparer';b.onclick=async()=>{if(window._act)return;window._act=1;try{sndCard();ui(await api('/api/action',{action:'split'}),true);}catch(e){alert(e.message);}window._act=0;};acts.appendChild(b);}}}
function render(s){ui(s);}


$('gear').onclick=()=>{const b=document.querySelector('#game .bar');if(b)b.style.display=b.style.display==='flex'?'none':'flex';};
let liveT=null;

function startHud(){
  const h=$('hud'); if(h) h.classList.add('on');
  if(liveT) clearInterval(liveT);
  refreshLive(); liveT=setInterval(refreshLive,1000);
}

async function refreshLive(){
  try{
    const d=await api('/api/live');
    const gbox=$('liveGame');
    if(gbox) gbox.innerHTML=(d.joueur?('Joue: <b>'+d.joueur+'</b> · €'+(d.soldeJoueur||0)+' · mise €'+(d.bet||0)+' · '+d.phase+' · '+(d.msg||'')):'Personne a la table');
    const ls=$('liveSoldes'); if(ls){ls.innerHTML='';(d.comptes||[]).forEach(c=>{const r=document.createElement('div');r.className='p';r.innerHTML='<span>'+c.pseudo+(c.role==='admin'?' · admin':'')+'</span><b>€'+c.solde+'</b>';ls.appendChild(r);});}
    const hud=$('hudTxt');
    if(hud){
      const people=(d.comptes||[]).map(c=>'<div class="line"><span>'+c.pseudo+'</span><b>€'+c.solde+'</b></div>').join('');
      const play=d.joueur?('<div style="margin-bottom:.25rem">Table : <b>'+d.joueur+'</b> mise €'+(d.bet||0)+' · '+(d.phase||'')+' · '+(d.msg||'')+'</div>'):'<div style="margin-bottom:.25rem">Table libre</div>';
      hud.innerHTML=play+people;
    }
  }catch(e){}
}
$('go').onclick=async()=>{$('er').textContent='';try{const d=await api('/api/login',{pseudo:$('ps').value.trim(),code:$('cd').value});token=d.token;localStorage.setItem('bj.t',token);moi=d.moi;$('admBtn').style.display=moi.role==='admin'?'inline':'none';show('game');render(await api('/api/etat'));if(moi.role==='admin') startHud();}catch(e){$('er').textContent=e.message;}};
$('leave').onclick=async()=>{try{await api('/api/quitter',{});}catch(e){}seated=false;lastBet=0;if(autoT)clearTimeout(autoT);$('dh').innerHTML='';if($('handsRow'))$('handsRow').innerHTML='';$('dt').textContent='';$('msg').textContent='';if($('chipon'))$('chipon').innerHTML='';$('acts').innerHTML='';$('chips').innerHTML='';api('/api/etat').then(render);};
$('seat').onclick=()=>{seated=true;api('/api/etat').then(render);};
$('out2')&&($('out2').onclick=()=>$('out').click());
$('out').onclick=()=>{if(autoT)clearTimeout(autoT);if(liveT)clearInterval(liveT);const h=$('hud');if(h)h.classList.remove('on');lastBet=0;token=null;localStorage.removeItem('bj.t');show('login');};
$('admBtn').onclick=async()=>{show('admin');if(liveT)clearInterval(liveT);refreshLive();liveT=setInterval(refreshLive,1000);const d=await api('/api/admin');const m=$('modes');m.innerHTML='<h2>Mode</h2>';Object.entries(d.modes).forEach(([k,l])=>{const b=document.createElement('button');b.textContent=l;b.style.margin='.2rem';if(d.mode===k)b.className='g';b.onclick=async()=>{await api('/api/admin',{mode:k});$('admBtn').click();};m.appendChild(b);});
const list=$('clist');list.innerHTML='';d.comptes.forEach(c=>{const r=document.createElement('div');r.className='row';r.innerHTML='<span>'+c.pseudo+' / '+c.code+' · €'+c.solde+'</span>';const i=document.createElement('input');i.type='number';i.placeholder='+/-';const ok=document.createElement('button');ok.className='g';ok.textContent='OK';ok.onclick=async()=>{await api('/api/admin',{jetons:{id:c.id,delta:+i.value||0}});$('admBtn').click();};r.appendChild(i);r.appendChild(ok);list.appendChild(r);});};
$('ncBtn').onclick=async()=>{await api('/api/admin',{nouveau:{pseudo:$('np').value,code:$('nc').value,solde:+$('ns').value||2000}});$('admBtn').click();};
$('back').onclick=async()=>{if(liveT)clearInterval(liveT);show('game');render(await api('/api/etat'));};
if(token){api('/api/etat').then(s=>{moi={pseudo:s.pseudo,role:s.role,solde:s.solde};$('admBtn').style.display=s.role==='admin'?'inline':'none';show('game');render(s);if(s.role==='admin') startHud();}).catch(()=>{});}
</script></body></html>`;
http.createServer(async(req,res)=>{const p=new URL(req.url,'http://x').pathname;if(p.startsWith('/api/'))return api(req,res,p);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(PAGE);}).listen(PORT,()=>console.log('BJ',PORT));
