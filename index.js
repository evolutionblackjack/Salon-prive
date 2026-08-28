const http=require('http');const crypto=require('crypto');
const PORT=process.env.PORT||3000;const id=()=>crypto.randomBytes(8).toString('hex');
const MODE={aleatoire:'Aléatoire',bingo:'Bingo banque',gros_gain:'Gros gain',gain:'Gain banque',perte:'Perte 6',grosse_perte:'Joueur 7',pipo:'Joueur 9',maxi:'Joueur 10'};
const comptes=new Map();const sessions=new Map();
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function refillPlan(){
  const bank={sure:15,bingo:14,gros_gain:14,gain:12}[g.mode];
  const ply={maxi:15,pipo:14,grosse_perte:13,perte:13}[g.mode];
  g.plan=[];
  if(g.mode==='aleatoire'||(!bank&&!ply))return;
  let b=bank||0, pl=ply||0;
  if(!b)b=20-pl; if(!pl)pl=20-b;
  const maxRun=2;
  const bag=[];
  for(let i=0;i<b;i++)bag.push('bank');
  for(let i=0;i<pl;i++)bag.push('player');
  shuffle(bag);
  const out=[];
  let run=0, last='';
  while(bag.length){
    let i=bag.findIndex(x=>run<maxRun||x!==last);
    if(i<0)i=0;
    const x=bag.splice(i,1)[0];
    if(x===last)run++; else {run=1;last=x;}
    out.push(x);
  }
  g.plan=out;
}
function takeFavor(){
  if(g.mode==='aleatoire')return null;
  if(!g.plan.length)refillPlan();
  let f=g.plan.pop()||null;
  const a=g.streak[g.streak.length-1], b=g.streak[g.streak.length-2];
  if(a&&a===b)f=(a==='bank'?'player':'bank');
  return f;
}
function add(p,c,r,s){
  const pseudo=String(p||'').trim();
  if(!pseudo||!String(c||'').trim())return null;
  for(const x of comptes.values())if(x.pseudo.toLowerCase()===pseudo.toLowerCase())return null;
  const solde=Number(s);
  const x={id:id(),pseudo,code:String(c),role:r,solde:Number.isFinite(solde)?Math.max(0,solde):0};
  comptes.set(x.id,x);return x;
}
add('Patron','admin21','admin',999999);add('gio','gio1','admin',999999);add('maelu','tuleccc','joueur',5000);
const histo=[];
function logH(p,delta,res,bet,solde,by){
  histo.unshift({t:Date.now(),p,delta:+delta||0,res:res||'',bet:+bet||0,solde:+solde||0,by:by||p});
  if(histo.length>150)histo.pop();
}
function shoe(){const C=['♠','♥','♦','♣'],V=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];const a=[];for(let d=0;d<5;d++)for(const c of C)for(const v of V)a.push({v,c,id:id()});return shuffle(a);}
function val(c){if(['J','Q','K'].includes(c.v))return 10;if(c.v==='A')return 11;return +c.v;}
function tot(m){let t=0,a=0;for(const c of m||[]){t+=val(c);if(c.v==='A')a++;}while(t>21&&a){t-=10;a--;}return t;}
function bj(m){return m&&m.length===2&&tot(m)===21;}
function pair(m){const r=c=>['10','J','Q','K'].includes(c.v)?'10':c.v;return m&&m.length===2&&r(m[0])===r(m[1]);}
function makeRoom(n){return {n,mode:'aleatoire',plan:[],streak:[],favor:null,sabot:shoe(),dealer:[],player:[],split:null,which:0,bet:0,bet2:0,phase:'bet',msg:'Mise',result:'',uid:null,gain:0,actAt:0,hands:[]};}
const rooms=[1,2,3,4].map(makeRoom);
let g=rooms[0];
function useRoom(n){g=rooms[(+n||1)-1]||rooms[0];}
function addVal(now,c){return now+(c.v==='A'?(now+11<=21?11:1):val(c));}
function draw(forD,pTot){
  if(g.sabot.length<30)g.sabot=shoe();
  const bruit={sure:0.20,bingo:0.30,gros_gain:0.28,gain:0.46,perte:0.30,grosse_perte:0.28,pipo:0.30,maxi:0.26}[g.mode]||0.36;
  if(!g.favor||Math.random()<bruit)return g.sabot.pop();
  const bank=g.favor==='bank'||g.mode==='sure';
  const sl=g.sabot.slice(-22);
  const now=forD?tot(g.dealer):(pTot==null?tot(g.player):pTot);
  const pj=tot(g.player);
  const sure=g.mode==='sure';
  const score=c=>{
    const n=addVal(now,c);
    if(sure){
      if(forD){
        if(pj>21)return Math.abs(n-18);
        if(n>21)return 80;
        if(pj<=21&&n>=17&&n>pj&&n<=21)return 0;
        if(n>=17&&n===pj)return 20;
        if(n<17)return 18+Math.abs(18-n);
        return 10+Math.abs(20-n);
      }
      if(n>21)return 50;
      if(n>=18&&n<=20)return 0;
      if(n===21)return 8;
      if(n>=12&&n<=17)return 4;
      return Math.abs(19-n);
    }
    if(forD){
      if(bank){
        if(n>21)return 40;
        if(pj>21)return Math.abs(n-18);
        if(pj>=17&&pj<=20&&n===pj+1)return 0;
        if(n>=17&&n<=20&&n>=pj)return 2;
        if(n===pj)return 28;
        if(n<17)return 12+Math.abs(18-n);
        return 8+Math.abs(19-n);
      }
      if(n===pj)return 16;
      if(n>21)return 7;
      if(pj<=21&&n<pj&&n>=17)return 1;
      if(n>=17&&n<=19)return 3;
      if(pj<=21&&n>pj)return 6;
      return Math.abs(18-n);
    }
    if(bank){
      if(n>21)return 12;
      if(n===21)return 14;
      if(n>=17&&n<=19)return 1;
      if(n===20)return 6;
      return Math.abs(18-n);
    }
    if(n>21)return 14;
    if(n===21)return 12;
    if(n>=17&&n<=19)return 1;
    if(n===20)return 5;
    return Math.abs(18-n);
  };
  const ranked=sl.slice().sort((a,b)=>score(a)-score(b));
  const pick=ranked[0]||g.sabot[g.sabot.length-1];
  const i=g.sabot.lastIndexOf(pick);if(i>=0)g.sabot.splice(i,1);else return g.sabot.pop();return pick;
}
function pub(moi){const hide=g.phase==='play'&&g.dealer[1];return{phase:g.phase,msg:g.msg,result:g.result,bet:g.bet,dealer:g.dealer.map((c,i)=>hide&&i===1?{v:'?',c:'?'}:c),dtot:hide?val(g.dealer[0]||{v:'0'}):(g.dealer.length?tot(g.dealer):null),player:g.player,ptot:g.player.length?tot(g.player):null,split:g.split,stot:g.split?tot(g.split):null,bet2:g.bet2,which:g.which,canSplit:(()=>{const hs=g.hands&&g.hands.length?g.hands:[{cards:g.player,bet:g.bet}].concat(g.split?[{cards:g.split,bet:g.bet2}]:[]);const h=hs[g.which]||hs[0];return g.phase==='play'&&pair(h&&h.cards)&&hs.length<2;})(),canDouble:g.phase==='play'&&((g.which===1&&g.split)?g.split.length===2:g.player.length===2)&&moi.solde>=((g.which===1&&g.split)?(g.bet2||g.bet):g.bet),hands:(g.hands&&g.hands.length?g.hands:[{cards:g.player,bet:g.bet}].concat(g.split?[{cards:g.split,bet:g.bet2}]:[])).map(h=>({cards:h.cards,bet:h.bet,tot:tot(h.cards)})),gain:g.gain||0,solde:moi.solde,pseudo:moi.pseudo,role:moi.role};}
function settle(hand,bet,c,splitHand){const pj=tot(hand),dj=tot(g.dealer);if(pj>21){g.gain-=bet;return'perdu';}if(!splitHand&&bj(hand)&&!bj(g.dealer)){const w=Math.floor(bet*1.5);c.solde+=bet+w;g.gain+=w;return'blackjack';}if(dj>21||pj>dj){c.solde+=bet*2;g.gain+=bet;return'gagne';}if(pj===dj){c.solde+=bet;return'egalite';}g.gain-=bet;return'perdu';}
g.actAt=0;
function touch(){g.actAt=Date.now();}
function clearSeat(u){
  if(u&&g.phase==='play'){
    if(g.hands&&g.hands.length)g.hands.forEach(h=>u.solde+=(h.bet||0));
    else{u.solde+=g.bet||0;if(g.bet2)u.solde+=g.bet2;}
  }
  g.player=[];g.dealer=[];g.split=null;g.hands=[];g.bet=0;g.bet2=0;g.which=0;g.phase='bet';g.msg='Mise';g.result='';g.uid=null;g.gain=0;g.actAt=0;
  pushLive();
}
setInterval(()=>{
  rooms.forEach(r=>{
    if(!r.uid||!r.actAt)return;
    if(Date.now()-r.actAt<30000)return;
    g=r;clearSeat(comptes.get(r.uid));
  });
},2000);
function finish(c){g.gain=0;const hs=g.hands&&g.hands.length?g.hands:[{cards:g.player,bet:g.bet}].concat(g.split?[{cards:g.split,bet:g.bet2}]:[]);const pOut=hs.every(h=>tot(h.cards)>21);if(!pOut){const pBest=Math.max(0,...hs.map(h=>{const t=tot(h.cards);return t>21?0:t;}));while(tot(g.dealer)<17)g.dealer.push(draw(true,pBest));}const ts=hs.map((h,i)=>settle(h.cards,h.bet,c,i>0||hs.length>1));g.phase='end';g.result=ts.join(' / ');g.msg=g.result.includes('gagne')||g.result.includes('blackjack')?'Gagné':g.result.includes('egalite')?'Égalité':'Perdu';if(g.result.includes('egalite')){}else if(g.result.includes('gagne')||g.result.includes('blackjack'))g.streak.push('player');else g.streak.push('bank');if(g.streak.length>8)g.streak=g.streak.slice(-8);logH(c.pseudo,g.gain,g.result,(g.bet||0)+(g.bet2||0),c.solde);pushLive();}
function roomSnap(r){
  const pl=r.uid?comptes.get(r.uid):null;
  return {n:r.n,mode:r.mode,phase:r.phase,msg:r.msg,bet:r.bet,bet2:r.bet2,result:r.result,joueur:pl?pl.pseudo:null,soldeJoueur:pl?pl.solde:null,dealer:r.dealer,player:r.player,split:r.split,ptot:r.player.length?tot(r.player):null,dtot:r.dealer.length?tot(r.dealer):null};
}
function liveSnap(){
  const pl=g.uid?comptes.get(g.uid):null;
  return {
    room:g.n,phase:g.phase,msg:g.msg,bet:g.bet,bet2:g.bet2,result:g.result,
    joueur:pl?pl.pseudo:null,soldeJoueur:pl?pl.solde:null,
    dealer:g.dealer,player:g.player,split:g.split,
    ptot:g.player.length?tot(g.player):null,dtot:g.dealer.length?tot(g.dealer):null,
    rooms:rooms.map(roomSnap),
    comptes:[...comptes.values()].map(c=>({pseudo:c.pseudo,role:c.role,solde:c.solde})),
    histo:histo.slice(0,30)
  };
}
const watchers=new Set();
function pushLive(){
  const payload='data:'+JSON.stringify(liveSnap())+'\n\n';
  for(const w of [...watchers]){try{w.write(payload);}catch(e){watchers.delete(w);}}
}
setInterval(()=>{if(watchers.size)pushLive();},350);
function me(req){const h=req.headers.authorization||'';const t=h.startsWith('Bearer ')?h.slice(7):null;return t&&sessions.has(t)?comptes.get(sessions.get(t)):null;}
function read(req){return new Promise(r=>{let d='';req.on('data',x=>d+=x);req.on('end',()=>{try{r(JSON.parse(d||'{}'));}catch{r({});}});});}
function json(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(o));}
async function api(req,res,path){
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end();}
  if(path==='/api/stream'){
    const t=new URL(req.url,'http://x').searchParams.get('t');
    const u=t&&sessions.has(t)?comptes.get(sessions.get(t)):null;
    if(!u||u.role!=='admin')return json(res,401,{err:'Session'});
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});
    watchers.add(res);
    res.write('data:'+JSON.stringify(liveSnap())+'\n\n');
    req.on('close',()=>watchers.delete(res));
    return;
  }
  const b=req.method==='POST'?await read(req):{};
  if(path==='/api/login'&&req.method==='POST'){let c=null;for(const x of comptes.values())if(x.pseudo.toLowerCase()===String(b.pseudo||'').toLowerCase()&&x.code===String(b.code||''))c=x;if(!c)return json(res,401,{err:'Code refusé'});const t=id()+id();sessions.set(t,c.id);return json(res,200,{token:t,moi:{pseudo:c.pseudo,role:c.role,solde:c.solde}});}
  const u=me(req);if(!u)return json(res,401,{err:'Session'});
  if(path==='/api/rooms')return json(res,200,{rooms:rooms.map(roomSnap)});
  if(path==='/api/entrer'&&req.method==='POST'){
    const n=+b.room;if(n<1||n>4)return json(res,400,{err:'Room'});
    rooms.forEach(r=>{if(r.uid===u.id){const prev=g;g=r;if(u.role!=='admin')clearSeat(u);g=prev;}});
    const R=rooms[n-1];
    if(u.role!=='admin'&&R.uid&&R.uid!==u.id)return json(res,400,{err:'Table occupée'});
    u.room=n;useRoom(n);
    if(u.role!=='admin'){R.uid=u.id;R.actAt=Date.now();}
    pushLive();return json(res,200,Object.assign(pub(u),{room:n}));
  }
  if(u.room)useRoom(u.room);
  if(path==='/api/etat')return json(res,200,Object.assign(pub(u),{room:u.room||0,rooms:rooms.map(roomSnap)}));
  if(path==='/api/miser'&&req.method==='POST'){if(!u.room)return json(res,400,{err:'Choisis une table'});if(g.phase!=='bet'&&g.phase!=='end')return json(res,400,{err:'Attends la fin'});const m=+b.montant;if(!(m>=10&&m<=100))return json(res,400,{err:'Mise 10 a 100'});if(u.solde<m)return json(res,400,{err:'Solde'});g.uid=u.id;g.player=[];g.split=null;g.hands=[];g.dealer=[];g.which=0;g.result='';g.favor=takeFavor();touch();u.solde-=m;g.bet=m;g.bet2=0;g.player.push(draw(false,0));g.dealer.push(draw(true));g.player.push(draw(false,tot(g.player)));g.dealer.push(draw(true));if(bj(g.player)){g.phase='end';if(!bj(g.dealer)){u.solde+=Math.floor(m*2.5);g.gain=Math.floor(m*1.5);g.msg='Blackjack';g.result='blackjack';}else{u.solde+=m;g.gain=0;g.msg='Égalité';g.result='egalite';}g.hands=[{cards:g.player,bet:g.bet}];logH(u.pseudo,g.gain,g.result,m,u.solde);}else{g.phase='play';g.msg='Ton tour : Tirer, Doubler ou Rester';g.hands=[{cards:g.player,bet:g.bet}];}pushLive();return json(res,200,pub(u));}
  if(path==='/api/action'&&req.method==='POST'){if(!u.room)return json(res,400,{err:'Choisis une table'});if(g.phase!=='play')return json(res,400,{err:'Pas le moment de tirer'});g.uid=u.id;touch();if(!g.hands||!g.hands.length)g.hands=[{cards:g.player,bet:g.bet}].concat(g.split?[{cards:g.split,bet:g.bet2||g.bet}]:[]);const H=g.hands[g.which]||g.hands[0];const hand=H.cards;const a=b.action;const next=()=>{g.player=g.hands[0].cards;g.bet=g.hands[0].bet;g.split=g.hands[1]?g.hands[1].cards:null;g.bet2=g.hands[1]?g.hands[1].bet:0;if(g.which<g.hands.length-1){g.which++;g.msg='Main '+(g.which+1);}else finish(u);};
    if(a==='hit'){hand.push(draw(false,tot(hand)));if(tot(hand)>21)next();}
    else if(a==='stand')next();
    else if(a==='double'){if(hand.length!==2)return json(res,400,{err:'2 cartes'});if(u.solde<H.bet)return json(res,400,{err:'Solde'});u.solde-=H.bet;H.bet*=2;hand.push(draw(false,tot(hand)));next();}
    else if(a==='split'){if(!g.hands||!g.hands.length)g.hands=[{cards:g.player,bet:g.bet}].concat(g.split?[{cards:g.split,bet:g.bet2||g.bet}]:[]);const h=g.hands[g.which];if(!pair(h.cards)||g.hands.length>=2)return json(res,400,{err:'Deja separe'});if(u.solde<h.bet)return json(res,400,{err:'Solde'});u.solde-=h.bet;const ace=h.cards[0].v==='A';const c2=h.cards.pop();const nh={cards:[c2],bet:h.bet};h.cards.push(draw(false,tot(h.cards)));nh.cards.push(draw(false,tot(nh.cards)));g.hands.splice(g.which+1,0,nh);g.player=g.hands[0].cards;g.bet=g.hands[0].bet;g.split=g.hands[1]?g.hands[1].cards:null;g.bet2=g.hands[1]?g.hands[1].bet:0;if(ace){g.msg='As separes';g.which=Math.min(g.which+1,g.hands.length-1);if(g.which>=g.hands.length-1)finish(u);}else{g.msg='Main '+(g.which+1);}}
    else return json(res,400,{err:'Action'});pushLive();return json(res,200,pub(u));}
  if(path==='/api/quitter'&&req.method==='POST'){
    if(g.uid===u.id||!g.uid)clearSeat(u);
    return json(res,200,pub(u));
  }
  if(path==='/api/admin'&&u.role==='admin'){if(req.method==='GET')return json(res,200,{modes:MODE,histo,rooms:rooms.map(r=>({n:r.n,mode:r.mode,joueur:(r.uid&&comptes.get(r.uid))?comptes.get(r.uid).pseudo:null})),comptes:[...comptes.values()].map(c=>({id:c.id,pseudo:c.pseudo,code:c.code,role:c.role,solde:c.solde}))});if(b.mode&&MODE[b.mode]){const R=rooms[(+b.room||u.room||1)-1]||g;R.mode=b.mode;R.plan=[];R.favor=null;const prev=g;g=R;refillPlan();g=prev;logH('Table '+R.n,0,'mode '+MODE[b.mode],0,0,u.pseudo);}if(b.nouveau&&b.nouveau.pseudo&&b.nouveau.code){const n=add(b.nouveau.pseudo,b.nouveau.code,'joueur',b.nouveau.solde);if(!n)return json(res,400,{err:'Pseudo deja pris'});logH(n.pseudo,n.solde,'compte créé',0,n.solde,u.pseudo);}if(b.jetons&&b.jetons.id){const c=comptes.get(b.jetons.id);if(c){c.solde=Math.max(0,c.solde+(+b.jetons.delta||0));logH(c.pseudo,+b.jetons.delta||0,'ajustement',0,c.solde,u.pseudo);}}if(b.supprimer){const c=comptes.get(b.supprimer);if(c&&c.role!=="admin"){rooms.forEach(r=>{if(r.uid===c.id){r.uid=null;r.phase='bet';r.player=[];r.dealer=[];}});for(const [tk,uid] of [...sessions])if(uid===c.id)sessions.delete(tk);logH(c.pseudo,0,'compte supprimé',0,0,u.pseudo);comptes.delete(c.id);}}return json(res,200,{ok:true});}
  if(path==='/api/live'&&u.role==='admin')return json(res,200,liveSnap());
  return json(res,404,{err:'?'});
}
const PAGE=`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><title>Blackjack</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,'Times New Roman',serif;background:#1a1008;color:#f4efe4}
.v{display:none;min-height:100dvh;flex-direction:column}.v.on{display:flex}
#login{align-items:center;justify-content:center;background:radial-gradient(circle at 30% 20%,#5a1212,#0a0404);padding:1.5rem;text-align:center;position:relative;z-index:5}
h1{letter-spacing:.2em;font-weight:500;margin:.6rem 0 1.2rem}
input{width:100%;max-width:320px;padding:.8rem;margin:.3rem 0;border:1px solid #c9a22766;background:#1a0808;color:#fff;text-align:center;border-radius:8px}
button{border:0;border-radius:8px;padding:.7rem 1rem;font-weight:700}
.g{background:linear-gradient(#e8d48b,#b8860b);color:#1a1205}.err{color:#f87171;min-height:1.2em}.note{max-width:360px;margin:1.1rem auto 0;padding:.75rem .85rem;border:1px solid #c9a22744;border-radius:10px;font-size:.72rem;line-height:1.45;color:#c8c0b0;text-align:left}.note b{color:#e8d48b;font-weight:600}
.rcard{background:radial-gradient(ellipse at 50% 0,#1f5c3a,#0a2a1c);border:1px solid #c9a22755;border-radius:14px;padding:1rem .85rem;margin:.45rem 0;display:flex;justify-content:space-between;align-items:center;min-height:64px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.rcard b{letter-spacing:.16em;color:#e8d48b}
.rcard span{font-size:.78rem;opacity:.85}
.bar{display:flex;justify-content:space-between;align-items:center;padding:.6rem .8rem;background:#07110c}
.felt{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:.45rem .5rem .3rem;display:flex;flex-direction:column;align-items:center;gap:.28rem;background:
radial-gradient(ellipse at 50% 8%,#1f5c3a 0%,#0f3d28 55%,#0a2a1c 100%);border-radius:10px;}
.brand{letter-spacing:.28em;font-size:.72rem;color:#e8d48b;margin:.15rem 0 .2rem}

 .hands-row{display:flex;justify-content:center;gap:.6rem;width:100%;align-items:flex-start}
.col{width:46%;max-width:200px;min-width:130px;padding:.25rem;border-radius:10px;flex:0 0 auto}
.col.on{box-shadow:inset 0 0 0 2px #e8d48b;background:#0003}
.hlab{font-size:.58rem;letter-spacing:.12em;text-align:center;opacity:.7;margin-bottom:.2rem}
.lab{font-size:.65rem;letter-spacing:.18em;opacity:.7;color:#f0d9a0}
.hand{display:flex;gap:0;min-height:88px;perspective:500px;justify-content:center}
.card{width:58px;height:84px;margin-right:-18px;border-radius:6px;background:#fff;color:#151515;position:relative;box-shadow:0 8px 14px #0006;border:1px solid #d0d0d0;animation:deal .42s cubic-bezier(.2,.7,.2,1);flex-shrink:0}
.card .idx{position:absolute;top:3px;left:4px;line-height:1;text-align:center;font-weight:800;font-family:Arial,Helvetica,sans-serif}
.card .idx b{display:block;font-size:.78rem}
.card .idx i{display:block;font-style:normal;font-size:.7rem}
.card .idx.bot{top:auto;bottom:3px;left:auto;right:4px;transform:rotate(180deg)}
.card .ctr{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);font-size:1.35rem}
.pips{position:absolute;left:14px;right:14px;top:16px;bottom:16px;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:repeat(3,1fr);place-items:center;font-size:.85rem}
.card.flip{animation:flip .38s ease-out}.card.r{color:#d32f2f}
.card.x{background:
repeating-linear-gradient(45deg,#0b2a6b 0 6px,#123a86 6px 12px);
border:2px solid #f0d78a;color:transparent}
@keyframes deal{from{transform:translate(70px,-80px) rotate(16deg);opacity:0}to{transform:none;opacity:1}}
@keyframes flip{from{transform:rotateY(90deg) scale(.92)}to{transform:none}}
.acts button,.chip{transition:transform .18s ease,box-shadow .18s ease,opacity .18s}
.acts button:active,.chip:active{transform:scale(.94)}
.tot{background:#0006;padding:.15rem .5rem;border-radius:99px;font-size:.8rem}
.seat{width:72px;height:72px;border-radius:50%;border:3px solid #2dff7a;box-shadow:0 0 14px #2dff7a66,inset 0 0 12px #0004;display:flex;align-items:center;justify-content:center;font-size:.58rem;letter-spacing:.06em;color:#d8ffe8;margin:.2rem auto;background:#0a2a18}
.seat.on{border-color:#f0c14a;color:#f0c14a;box-shadow:0 0 16px #f0c14a66}
.chipon{width:48px;height:48px;border-radius:50%;border:5px dotted #fff8;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;color:#fff;margin:.2rem auto;background:radial-gradient(circle at 35% 30%,#666,#111);box-shadow:0 4px 10px #0008}
.dock{flex-shrink:0;z-index:25;padding:.5rem .6rem calc(.55rem + env(safe-area-inset-bottom));background:radial-gradient(ellipse at 50% 0%,#5c3c26,transparent 60%),linear-gradient(#3a2418,#23150e);border-top:2px solid #c9a22766}
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
.acts button{background:linear-gradient(#1c3d2a,#0e2418);color:#e8d48b;border:1px solid #c9a22777;min-height:52px;min-width:96px;border-radius:10px;font-weight:700;font-family:Georgia,serif;letter-spacing:.04em;-webkit-appearance:none;box-shadow:inset 0 1px 0 #fff2,0 4px 8px #0006}
.acts .hit,.acts .dbl,.acts .p{background:linear-gradient(#1c3d2a,#0e2418);color:#e8d48b}
.acts .undo{min-width:72px;background:linear-gradient(#3a2418,#22140c);color:#e8d48b}

#game{background:linear-gradient(#4a301c,#2a1810);padding:8px;height:100vh;height:100dvh;max-height:100dvh;overflow:hidden;position:relative;flex-direction:column}
#game .bar{display:none}
.felt-top{width:100%;display:flex;justify-content:space-between;padding:0 .15rem .2rem}
.mini{text-align:center;opacity:.65}
.mini .mb{width:38px;height:10px;background:#4a2a1c;border-radius:2px;margin:0 auto .12rem}
.mini .mb.s{background:#6b5a28}
.mini span{font-size:.48rem;letter-spacing:.14em}
.arc{text-align:center;color:#c9b87a;opacity:.55;font-size:.62rem;letter-spacing:.07em;margin:.25rem 0;line-height:1.35}
.oval{width:130px;height:58px;border:2px solid rgba(201,176,90,.5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:.15rem auto}
.vous{font-size:.58rem;letter-spacing:.22em;opacity:.5;margin-top:.1rem}
.place{letter-spacing:.22em;font-size:.78rem;color:#fff;text-shadow:0 2px 10px #000a;font-weight:700;margin:.1rem 0}
.place.off{visibility:hidden}
.rail{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(#4a301c,#2a1810);padding:.4rem .8rem;border-top:1px solid #c9a22755;flex-shrink:0}
.rail-cell{text-align:center;min-width:72px}
.rail .rk{font-size:.52rem;letter-spacing:.16em;opacity:.65}
.rail .rv{font-size:1.1rem;font-weight:700;color:#f0e0a8}

.hud{display:none;position:absolute;top:6px;right:6px;left:auto;width:42%;max-width:168px;z-index:12;background:#0b0b0bd4;border:1px solid #c9a22766;border-radius:10px;padding:.3rem .4rem;font-size:.6rem;pointer-events:none;max-height:28%;overflow:auto}
.hud.on{display:block}
.spy{display:none;position:fixed;right:6px;top:42%;z-index:40;width:28px;height:56px;border-radius:8px 0 0 8px;background:#1a1208cc;border:1px solid #c9a22744;color:#c9a22799;font-size:.62rem;letter-spacing:.06em;writing-mode:vertical-rl;text-align:center;padding:.25rem 0}
.spy.on{display:block}
.spyp{display:none;position:fixed;right:8px;top:12%;bottom:18%;width:72%;max-width:320px;z-index:41;background:#0b0b0ef2;border:1px solid #c9a22755;border-radius:12px;padding:.7rem;overflow:auto;font-size:.72rem}
.spyp.on{display:block}
.spyp b.ttl{color:#e8d48b;letter-spacing:.12em}
.hud b{color:#e8d48b}
.hud .line{display:flex;justify-content:space-between;gap:.5rem;padding:.12rem 0;border-bottom:1px solid #fff1}
.out2{background:#3a1212;color:#f4efe4;border:1px solid #c9a22744;padding:.35rem .55rem;border-radius:8px;font-size:.68rem}
.gear{width:40px;height:40px;border-radius:50%;background:#2a1810;border:1px solid #c9a22755;color:#e8d48b;font-size:1.1rem}
.livebox{background:radial-gradient(ellipse at 50% 8%,#1f5c3a 0%,#0f3d28 70%);border:1px solid #c9a22744;border-radius:14px;padding:1rem .7rem 1.2rem;margin:.6rem 0;min-height:280px}
.livebox .p{display:flex;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid #fff1}
#admin{background:#111;padding:1rem;overflow:auto}#admin h2{margin:.8rem 0 .4rem;color:#e8d48b;font-size:1rem}
.row{display:flex;gap:.4rem;align-items:center;margin:.35rem 0;flex-wrap:wrap}.row input{max-width:110px;text-align:left;padding:.4rem}
</style></head><body>
<div id="login" class="v on"><div>
<div style="width:70px;height:70px;border:2px solid #c9a227;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;color:#c9a227;font-size:1.4rem">21</div>
<h1>BLACKJACK</h1>
<form id="logf" autocomplete="on" novalidate onsubmit="return false">
<input id="ps" name="username" placeholder="Pseudo" autocomplete="username" autocapitalize="off">
<input id="cd" name="password" type="password" placeholder="Code" autocomplete="current-password">
<label style="display:flex;gap:.4rem;align-items:center;justify-content:center;margin:.45rem 0;font-size:.78rem;color:#c8c0b0"><input id="mem" type="checkbox" style="width:auto"> Enregistrer le mot de passe</label>
<button class="g" id="go" type="button" style="width:100%;max-width:320px;margin-top:.2rem">Entrer</button>
</form>
<p class="err" id="er"></p>
<p class="note">Sabot mélangé par <b>Fisher–Yates</b> alimenté par <b>crypto.getRandomValues</b>, remélangé au passage de la carte de coupe. Aucune carte n'est choisie en fonction de la main en cours : l'avantage vient uniquement des règles ci-dessus.</p>
</div></div>
<div id="lobby" class="v"><div class="bar"><b>SALONS</b><span><button class="g" id="admBtn2" style="display:none;padding:.35rem .6rem">Admin</button> <button id="out3" style="background:#333;color:#fff;padding:.35rem .6rem">Déconnexion</button></span></div>
<div style="padding:1rem;max-width:420px;margin:0 auto;width:100%">
<p style="letter-spacing:.2em;text-align:center;color:#e8d48b;margin:.4rem 0 1rem">CHOISIS UNE TABLE</p>
<div id="roomGrid"></div>
</div></div>
<div id="game" class="v">
<div class="bar"><b id="who"></b><span id="solde"></span><span><button class="g" id="admBtn" style="display:none;padding:.35rem .6rem">Admin</button> <button id="leave" style="background:#4a2a16;color:#f4efe4;padding:.35rem .55rem">Lever</button> <button id="out" style="background:#333;color:#fff;padding:.35rem .6rem">Déconnexion</button></span></div>
<div class="felt"><div class="brand">BLACKJACK</div>
  <div class="felt-top"><div class="mini"><div class="mb"></div><span>TALON</span></div><div class="lab">CROUPIER</div><div class="mini"><div class="mb s"></div><span>SABOT</span></div></div>
  <div class="hand" id="dh"></div><div class="tot" id="dt"></div>
  <div class="arc">LE BLACKJACK PAIE 3 POUR 2<br><small>LA BANQUE TIRE A 16 · RESTE A 17</small></div>
  <div class="place" id="place">PLACE YOUR BETS</div>
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
<button class="spy" id="spyBtn">GIO</button>
<div class="spyp" id="spyBox"><b class="ttl">ACTIONS GIO</b><div id="spyList" style="margin-top:.5rem"></div></div>
<div id="admin" class="v"><div class="bar"><b>Régie</b><button class="g" id="back">Retour</button></div>
<div class="livebox"><b>Live table</b><div id="liveGame">—</div><div id="liveFelt" style="margin-top:.6rem"><div class="lab">BANQUE</div><div class="hand" id="liveDH"></div><div class="lab" style="margin-top:.4rem">JOUEUR</div><div class="hand" id="livePH"></div><div class="hand" id="liveSH" style="margin-top:.3rem"></div></div></div>
<h2>Soldes en direct</h2><div id="liveSoldes"></div>
<div id="modes"></div><h2>Nouveau compte</h2>
<div class="row"><input id="np" placeholder="Pseudo"><input id="nc" placeholder="Code"><input id="ns" type="number" value="2000"><button class="g" id="ncBtn">Créer</button></div>
<h2>Historique jetons</h2><div id="hist" style="max-height:240px;overflow:auto;font-size:.78rem"></div>
<h2>Comptes</h2><div id="clist"></div></div>
<script>
const $=i=>document.getElementById(i);let token=localStorage.getItem('bj.t'),moi=null;
function show(i){document.querySelectorAll('.v').forEach(x=>x.classList.remove('on'));$(i).classList.add('on');}
async function api(p,b){const o={method:b?'POST':'GET',headers:{'Content-Type':'application/json'}};if(token)o.headers.Authorization='Bearer '+token;if(b)o.body=JSON.stringify(b);const r=await fetch(p,o);const d=await r.json();if(r.status===401){token=null;localStorage.removeItem('bj.t');show('login');throw new Error('Session');}if(!r.ok)throw new Error(d.err||'Erreur');return d;}
let seated=false, dealing=false, lastBet=0, autoT=null, actx=null, roomNo=0;
function beep(f,ms){try{if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();if(actx.state==='suspended')actx.resume();const t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.07,t);g.gain.exponentialRampToValueAtTime(.001,t+(ms||.12));o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+(ms||.14));}catch(e){}}
function noise(ms,freq,type,vol){try{if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();if(actx.state==='suspended')actx.resume();const n=actx.createBuffer(1,Math.max(1,Math.floor(actx.sampleRate*(ms||.06))),actx.sampleRate);const d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*.22));const s=actx.createBufferSource();s.buffer=n;const f=actx.createBiquadFilter();f.type=type||'bandpass';f.frequency.value=freq||1400;f.Q.value=0.8;const g=actx.createGain();g.gain.value=vol||.22;s.connect(f);f.connect(g);g.connect(actx.destination);s.start();}catch(e){}}
function sndCard(){noise(.07,900,'highpass',.16);setTimeout(()=>noise(.03,2200,'bandpass',.2),18);}
function sndChip(){noise(.04,700,'lowpass',.18);setTimeout(()=>beep(210,.04),25);}
function sndWin(){noise(.05,1800,'bandpass',.12);beep(980,.06);setTimeout(()=>beep(1320,.08),80);setTimeout(()=>beep(1760,.1),160);}
function sndLose(){noise(.08,400,'lowpass',.12);beep(160,.14);}
const PIPS={A:[5],'2':[2,8],'3':[2,5,8],'4':[1,3,7,9],'5':[1,3,5,7,9],'6':[1,3,4,6,7,9],'7':[1,3,4,5,6,7,9],'8':[1,3,4,5,6,7,8,9],'9':[1,2,3,4,6,7,8,9],'10':[1,2,3,4,5,6,7,8,9]};
function svgChip(v,col){
  const spots=Array.from({length:8},(_,i)=>{const a=(i*45-11)*Math.PI/180,b=(i*45+11)*Math.PI/180;const r=35;const x1=38+Math.cos(a)*r,y1=38+Math.sin(a)*r,x2=38+Math.cos(b)*r,y2=38+Math.sin(b)*r;return '<path d="M38 38 L'+x1.toFixed(1)+' '+y1.toFixed(1)+' A'+r+' '+r+' 0 0 1 '+x2.toFixed(1)+' '+y2.toFixed(1)+' Z" fill="'+(col||'#7a1f2b')+'"/>';}).join('');
  const dots=Array.from({length:24},(_,i)=>{const a=i*15*Math.PI/180;return '<circle cx="'+(38+Math.cos(a)*26).toFixed(1)+'" cy="'+(38+Math.sin(a)*26).toFixed(1)+'" r="1.1" fill="#d4b45a"/>';}).join('');
  return '<svg viewBox="0 0 76 76"><circle cx="38" cy="38" r="37" fill="#111"/><circle cx="38" cy="38" r="35" fill="#1a1a1a"/>'+spots+'<circle cx="38" cy="38" r="28" fill="none" stroke="#c9a227" stroke-width="1.4"/><circle cx="38" cy="38" r="24.5" fill="#0d0d0d" stroke="#d4b45a" stroke-width=".8"/>'+dots+'<path d="M32 18 L34 14 L36 18 L38 13.5 L40 18 L42 14 L44 18 L42.5 20 L33.5 20 Z" fill="#e8d48b"/><text x="38" y="42" text-anchor="middle" font-size="18" font-weight="800" fill="#e8d48b" font-family="Georgia,serif">'+v+'</text><text x="38" y="52" text-anchor="middle" font-size="5.2" letter-spacing="1.2" fill="#c9a227" font-family="Georgia,serif">BLACKJACK</text></svg>';
}
function C(c){const d=document.createElement('div');const hid=!c||c.v==='?';d.className='card'+(hid?' x':((c.c==='♥'||c.c==='♦')?' r':''));
if(!hid){const r=c.v,s=c.c;d.dataset.k=r+s;
const face=['J','Q','K'].includes(r);
const mid=face?('<div class="ctr">'+r+s+'</div>'):(PIPS[r]?('<div class="pips">'+[1,2,3,4,5,6,7,8,9].map(n=>'<span>'+(PIPS[r].includes(n)?s:'')+'</span>').join('')+'</div>'):('<div class="ctr">'+s+'</div>'));
d.innerHTML='<div class="idx"><b>'+r+'</b><i>'+s+'</i></div>'+mid+'<div class="idx bot"><b>'+r+'</b><i>'+s+'</i></div>';}else d.dataset.k='??';return d;}
function totC(m){let t=0,a=0;for(const c of m||[]){if(!c||c.v==="?")continue;const v=(c.v==="A"?11:["J","Q","K","V","D","R"].includes(c.v)?10:+c.v);t+=v;if(c.v==="A")a++;}while(t>21&&a){t-=10;a--;}return t;}
function banner(title,amt){const o=document.querySelector('.banner');if(o)o.remove();const b=document.createElement('div');b.className='banner';b.innerHTML='<b>'+title+'</b><span>'+amt+'</span>';document.body.appendChild(b);setTimeout(()=>b.remove(),1600);}
function fillHand(el,cards){el.innerHTML='';(cards||[]).forEach((c,i,a)=>{const d=C(c);if(i<a.length-1)d.style.animation='none';el.appendChild(d);});}
async function playBet(v){
  if(dealing) return;
  lastBet=v;
  $('dh').innerHTML='';if($('handsRow'))$('handsRow').innerHTML='';$('dt').textContent='';
  const bnr=document.querySelector('.banner');if(bnr)bnr.remove();
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
  for(const step of seq){await new Promise(r=>setTimeout(r,420));sndCard();const box=$(step.w);if(box)box.appendChild(C(step.c));
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
    const nd=C(D[1]);nd.classList.add('flip');
    if(kids[1])kids[1].replaceWith(nd);else box.appendChild(nd);sndCard();
    shown.push(D[1]);$('dt').textContent=totC(shown);
    await new Promise(r=>setTimeout(r,380));
  }
  for(let i=2;i<D.length;i++){
    if(box.children[i]) continue;
    await new Promise(r=>setTimeout(r,400));
    sndCard();box.appendChild(C(D[i]));shown.push(D[i]);$('dt').textContent=totC(shown);
  }
  $('dt').textContent=s.dtot!=null?s.dtot:totC(D);
  dealing=false;
}
function syncHand(el,cards){
  const want=cards||[];
  while(el.children.length>want.length)el.removeChild(el.lastChild);
  for(let i=0;i<want.length;i++){
    const k=(want[i]&&want[i].v||'?')+(want[i]&&want[i].c||'?');
    if(el.children[i]){
      if(el.children[i].dataset.k===k)continue;
      const d=C(want[i]);d.style.animation='none';el.replaceChild(d,el.children[i]);
    }else{
      const d=C(want[i]);if(i<want.length-1)d.style.animation='none';el.appendChild(d);
    }
  }
}
function paintHands(s){
  const HS=s.hands&&s.hands.length?s.hands:[{cards:s.player,bet:s.bet}].concat(s.split?[{cards:s.split,bet:s.bet2}]:[]);
  const row=$('handsRow'); if(!row)return HS;
  while(row.children.length>HS.slice(0,2).length)row.removeChild(row.lastChild);
  HS.slice(0,2).forEach((h,i)=>{
    let col=row.children[i];
    if(!col){
      col=document.createElement('div');
      col.innerHTML='<div class="hlab"></div><div class="hand"></div><div class="tot"></div>';
      row.appendChild(col);
    }
    col.className='col'+(s.which===i&&s.phase==='play'?' on':'');
    col.querySelector('.hlab').textContent=HS.length>1?('MAIN '+(i+1)+' · €'+(h.bet||0)):'VOUS';
    syncHand(col.querySelector('.hand'),h.cards||[]);
    col.querySelector('.tot').textContent=totC(h.cards||[]);
  });
  return HS;
}
function ui(s,skipDeal){
  moi.solde=s.solde;$('solde').textContent='€'+s.solde;if($('railSolde'))$('railSolde').textContent=s.solde;if($('railMise'))$('railMise').textContent=s.bet||lastBet||0;$('who').textContent=s.pseudo;$('msg').textContent=s.msg||'';if($('place'))$('place').className=s.phase==='bet'?'place':'place off';
  const mid=$('chipon');const shown=s.bet||lastBet||0;if(shown){mid.innerHTML=svgChip(shown,shown>=50?'#c42838':shown>=25?'#1a8a3a':'#1e4ec4');}else mid.innerHTML='';mid.className='chipon';
  const seat=$('seat');seat.className='seat'+(seated?' on':'');seat.textContent=seated?(moi.pseudo||'TOI'):"S'ASSEOIR";
  const HS=s.hands&&s.hands.length?s.hands:[{cards:s.player,bet:s.bet,tot:s.ptot}].concat(s.split?[{cards:s.split,bet:s.bet2,tot:s.stot}]:[]);
  if(!skipDeal){fillHand($('dh'),s.dealer);$('dt').textContent=s.dtot!=null?s.dtot:'';}
  const row=$('handsRow');
  if(skipDeal!=='keep')paintHands(s);
  if(HS.length>1&&s.phase==='play') $('msg').textContent='Tu joues la MAIN '+(Number(s.which)+1)+' / '+HS.length;
  const chips=$('chips'),acts=$('acts');chips.innerHTML='';acts.innerHTML='';
  const stake=(s.bet||0)+(s.split?(s.bet2||0):0);const aff=s.gain!=null?s.gain:(s.result==='perdu'?-stake:stake);
  if(s.phase==='end'&&(s.result==='gagne'||s.result==='blackjack'||(s.result||'').includes('gagne'))){sndWin();banner(s.result==='blackjack'?'BLACKJACK':'YOU WIN',(aff>=0?'+':'')+'€'+Math.abs(aff));}
  if(s.phase==='end'&&(s.result==='perdu'||((s.result||'').includes('perdu')&&!(s.result||'').includes('gagne')))){sndLose();banner('PERDU','-€'+Math.abs(aff||stake));}
  if((s.phase==='bet'||s.phase==='end')&&seated){
    [10,25,50].forEach(v=>{const b=document.createElement('button');b.className='chip c'+v;b.innerHTML=svgChip(v,v===10?'#1e4ec4':v===25?'#1a8a3a':'#c42838');b.onclick=()=>{if(lastBet+v>100){alert('Mise max 100');return;}lastBet+=v;sndChip();const mid=$('chipon');mid.innerHTML=svgChip(lastBet,v===10?'#1e4ec4':v===25?'#1a8a3a':'#c42838');mid.className='chipon';};chips.appendChild(b);});
    const clr=document.createElement('button');clr.className='undo';clr.textContent='Retour';clr.onclick=()=>{lastBet=0;const mid=$('chipon');mid.innerHTML='';mid.className='chipon';};
    const go=document.createElement('button');go.className='hit';go.style.minWidth='140px';go.style.fontSize='1rem';
    go.textContent=s.phase==='end'?'REJOUER':'JOUER';
    go.onclick=()=>{if(lastBet<10){alert('Mets au moins 10 au centre');return;}if(lastBet>100){alert('Max 100');return;}playBet(lastBet);};
    acts.appendChild(clr);
    acts.appendChild(go);
  }
  if(s.phase==='play'){window._hand=s.which||0;const actsList=[['Tirer','hit']];if(s.canDouble)actsList.push(['Doubler','double']);actsList.push(['Rester','stand']);actsList.forEach(([l,a],i)=>{const b=document.createElement('button');if(a==='hit')b.className='hit';if(a==='stand')b.className='p';if(a==='double')b.className='dbl';b.textContent=l;b.onclick=async()=>{if(window._act)return;window._act=1;try{const ns=await api('/api/action',{action:a});sndCard();
      paintHands(ns);
      if(a==='double'||a==='hit')await new Promise(r=>setTimeout(r,420));
      if(ns.phase==='end'){await revealDealer(ns);await new Promise(r=>setTimeout(r,900));ui(ns,'keep');}
      else ui(ns,'keep');
    }catch(e){alert(e.message);}window._act=0;};acts.appendChild(b);});
  const cur=HS[s.which]||HS[0];
  const canSp=s.phase==='play'&&HS.length<2&&cur&&cur.cards&&cur.cards.length===2&&cur.cards[0].v&&(cur.cards[0].v===cur.cards[1].v||['10','J','Q','K'].includes(cur.cards[0].v)&&['10','J','Q','K'].includes(cur.cards[1].v));
  if(canSp){const b=document.createElement('button');b.textContent='Séparer';b.onclick=async()=>{if(window._act)return;window._act=1;try{sndCard();ui(await api('/api/action',{action:'split'}),true);}catch(e){alert(e.message);}window._act=0;};acts.appendChild(b);}}}
function render(s){ui(s);}


$('gear').onclick=()=>{const b=document.querySelector('#game .bar');if(b)b.style.display=b.style.display==='flex'?'none':'flex';};
let liveT=null,syncT=null,lastSig='';
function startSync(){
  if(syncT)clearInterval(syncT);
}

function paintSpy(list){
  const el=$('spyList'); if(!el)return;
  const rows=(list||[]).filter(h=>String(h.by||'').toLowerCase()==='gio');
  el.innerHTML=rows.map(h=>{
    const when=new Date(h.t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const dlt=h.delta?((h.delta>0?'+':'')+'€'+h.delta+' '):'';
    return '<div class="p"><span>'+when+' · '+h.res+' · <b>'+h.p+'</b> '+dlt+'</span><b>€'+(h.solde||0)+'</b></div>';
  }).join('')||'<div class="p">Aucune action Gio</div>';
}
function armSpy(){const on=moi&&String(moi.pseudo||'').toLowerCase()==='patron';if($('spyBtn'))$('spyBtn').classList.toggle('on',!!on);if(!on&&$('spyBox'))$('spyBox').classList.remove('on');}
function paintHisto(list){
  const el=$('hist'); if(!el)return;
  el.innerHTML=(list||[]).map(h=>{
    const dlt=h.delta>0?('+€'+h.delta):(h.delta<0?('-€'+Math.abs(h.delta)):'€0');
    const when=new Date(h.t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    return '<div class="p"><span>'+when+' · <b>'+h.p+'</b> · '+(h.res||'')+(h.bet?(' mise €'+h.bet):'')+'</span><b>'+dlt+' → €'+h.solde+'</b></div>';
  }).join('')||'<div class="p">Aucun coup</div>';
}
function applyLive(d){
  const cur=(d.rooms||[]).find(x=>x.n===roomNo)||d;
  const sig=JSON.stringify({n:cur.n,p:cur.phase,j:cur.joueur,b:cur.bet,m:cur.msg,pl:cur.player,d:cur.dealer,s:cur.split,h:(d.histo||[]).length});
  if(window._lsig===sig)return;window._lsig=sig;

  if(cur.dealer)d=Object.assign({},d,cur);
  const gbox=$('liveGame');
  if(gbox) gbox.innerHTML=(d.rooms||[]).map(r=>'T'+r.n+': '+(r.joueur||'libre')+' · '+(r.phase||'')).join(' · ');
  const ldh=$('liveDH'),lph=$('livePH'),lsh=$('liveSH');
  if(ldh)syncHand(ldh,d.dealer||[]);
  if(lph)syncHand(lph,d.player||[]);
  if(lsh){if(d.split&&d.split.length){lsh.style.display='flex';syncHand(lsh,d.split);}else{lsh.innerHTML='';lsh.style.display='none';}}
  const ls=$('liveSoldes'); if(ls){ls.innerHTML='';(d.comptes||[]).forEach(c=>{const r=document.createElement('div');r.className='p';r.innerHTML='<span>'+c.pseudo+(c.role==='admin'?' · admin':'')+'</span><b>€'+c.solde+'</b>';ls.appendChild(r);});}
  paintHisto(d.histo);paintSpy(d.histo);armSpy();
  const hud=$('hud'); if(hud) hud.classList.remove('on');
  if(moi&&moi.role==='admin'&&!seated&&!dealing){
    const dh=$('dh');
    if(dh){syncHand(dh,d.dealer||[]); if($('dt'))$('dt').textContent=d.dtot!=null?d.dtot:totC(d.dealer||[]);}
    paintHands({phase:d.phase,which:0,hands:[{cards:d.player||[],bet:d.bet||0}].concat(d.split&&d.split.length?[{cards:d.split,bet:d.bet2||0}]:[]),player:d.player,split:d.split,bet:d.bet,bet2:d.bet2});
    if($('msg'))$('msg').textContent=(d.joueur?(d.joueur+' · '):'')+(d.msg||'');
    if($('place'))$('place').className=(d.phase==='bet'||!d.joueur)?'place':'place off';
    const mid=$('chipon');
    if(mid){const shown=d.bet||0;mid.innerHTML=shown?svgChip(shown,shown>=50?'#c42838':shown>=25?'#1a8a3a':'#1e4ec4'):'';}
    if($('railMise'))$('railMise').textContent=d.bet||0;
    if($('seat')){$('seat').className='seat'+(d.joueur?' on':'');$('seat').textContent=d.joueur||"S'ASSEOIR";}
  }
}
function startHud(){
  const h=$('hud'); if(h) h.classList.remove('on');
  if(liveT) clearInterval(liveT);
  refreshLive(); liveT=setInterval(refreshLive,350);
  if(window._es)try{window._es.close();}catch(e){}
  if(token){
    window._es=new EventSource('/api/stream?t='+encodeURIComponent(token));
    window._es.onmessage=e=>{try{applyLive(JSON.parse(e.data));}catch(x){}};
    window._es.onerror=()=>{try{window._es.close();}catch(e){} setTimeout(()=>{if(moi&&moi.role==='admin')startHud();},1200);};
  }
}

async function refreshLive(){
  try{
    const d=await api('/api/live');
    applyLive(d);
    const ls=$('liveSoldes'); if(ls){ls.innerHTML='';(d.comptes||[]).forEach(c=>{const r=document.createElement('div');r.className='p';r.innerHTML='<span>'+c.pseudo+(c.role==='admin'?' · admin':'')+'</span><b>€'+c.solde+'</b>';ls.appendChild(r);});}
    const hud=$('hudTxt');
    if(hud){
      const people=(d.comptes||[]).map(c=>'<div class="line"><span>'+c.pseudo+'</span><b>€'+c.solde+'</b></div>').join('');
      const play=d.joueur?('<div style="margin-bottom:.25rem">Table : <b>'+d.joueur+'</b> mise €'+(d.bet||0)+' · '+(d.phase||'')+' · '+(d.msg||'')+'</div>'):'<div style="margin-bottom:.25rem">Table libre</div>';
      hud.innerHTML=play+people;
    }
  }catch(e){}
}
async function paintLobby(){
  const d=await api('/api/rooms');
  const box=$('roomGrid');if(!box)return;box.innerHTML='';
  (d.rooms||[]).forEach(r=>{
    const el=document.createElement('div');el.className='rcard';
    el.innerHTML='<div><b>TABLE '+r.n+'</b><div style="font-size:.72rem;opacity:.7;margin-top:.2rem">'+(r.joueur?('Occupée · '+r.joueur):'1 place libre')+'</div></div><button class="g">'+(r.joueur&&moi.role!=='admin'?'Pleine':'Entrer')+'</button>';
    const go=async()=>{try{await api('/api/entrer',{room:r.n});roomNo=r.n;show('game');seated=moi.role!=='admin';render(await api('/api/etat'));if(moi.role==='admin')startHud();}catch(e){alert(e.message);}};
    el.onclick=go;el.querySelector('button').onclick=e=>{e.stopPropagation();go();};
    box.appendChild(el);
  });
}
const doLogin=async()=>{$('er').textContent='';try{const d=await api('/api/login',{pseudo:$('ps').value.trim(),code:$('cd').value});token=d.token;localStorage.setItem('bj.t',token);if($('mem')&&$('mem').checked){$('logf').autocomplete='on';localStorage.setItem('bj.ps',$('ps').value.trim());localStorage.setItem('bj.cd',$('cd').value);}else{if($('logf'))$('logf').autocomplete='off';localStorage.removeItem('bj.ps');localStorage.removeItem('bj.cd');}moi=d.moi;$('admBtn').style.display=moi.role==='admin'?'inline':'none';if($('admBtn2'))$('admBtn2').style.display=moi.role==='admin'?'inline':'none';show('lobby');await paintLobby();armSpy();if(moi.role==='admin') startHud();}catch(e){$('er').textContent=e.message;}};
if($('logf'))$('logf').onsubmit=e=>{e.preventDefault();doLogin();};$('go').onclick=doLogin;
$('leave').onclick=async()=>{try{await api('/api/quitter',{});}catch(e){}seated=false;lastBet=0;roomNo=0;if(autoT)clearTimeout(autoT);$('dh').innerHTML='';if($('handsRow'))$('handsRow').innerHTML='';$('dt').textContent='';$('msg').textContent='';if($('chipon'))$('chipon').innerHTML='';$('acts').innerHTML='';$('chips').innerHTML='';show('lobby');paintLobby();};
$('seat').onclick=()=>{seated=true;idleAt=Date.now();api('/api/etat').then(render);};
let idleAt=Date.now();
setInterval(()=>{
  if(!seated||!token)return;
  if(Date.now()-idleAt<30000)return;
  $('leave').click();
},2000);
['pointerdown','touchstart','click'].forEach(ev=>document.addEventListener(ev,()=>{idleAt=Date.now();},{passive:true}));
window.addEventListener('pagehide',()=>{
  if(!token)return;
  try{fetch('/api/quitter',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}',keepalive:true});}catch(e){}
});
$('out2')&&($('out2').onclick=()=>$('out').click());
$('out').onclick=()=>{if(autoT)clearTimeout(autoT);if(liveT)clearInterval(liveT);if(syncT)clearInterval(syncT);if(window._es)try{window._es.close();}catch(e){}const h=$('hud');if(h)h.classList.remove('on');lastBet=0;token=null;moi=null;if($('spyBtn'))$('spyBtn').classList.remove('on');if($('spyBox'))$('spyBox').classList.remove('on');localStorage.removeItem('bj.t');show('login');};
$('admBtn').onclick=async()=>{show('admin');if(liveT)clearInterval(liveT);refreshLive();liveT=setInterval(refreshLive,350);if(moi&&moi.role==='admin'){if(!window._es||window._es.readyState===2)startHud();}const d=await api('/api/admin');const m=$('modes');m.innerHTML='';(d.rooms||[{n:1,mode:'aleatoire'}]).forEach(rr=>{const wrap=document.createElement('div');wrap.innerHTML='<h2>Table '+rr.n+(rr.joueur?(' · '+rr.joueur):'')+'</h2>';Object.entries(d.modes).forEach(([k,l])=>{const b=document.createElement('button');b.textContent=l;b.style.margin='.2rem';if(rr.mode===k)b.className='g';b.onclick=async()=>{await api('/api/admin',{mode:k,room:rr.n});$('admBtn').click();};wrap.appendChild(b);});m.appendChild(wrap);});
const list=$('clist');list.innerHTML='';d.comptes.forEach(c=>{const r=document.createElement('div');r.className='row';r.innerHTML='<span>'+c.pseudo+' / '+c.code+' · €'+c.solde+'</span>';const i=document.createElement('input');i.type='number';i.placeholder='+/-';const ok=document.createElement('button');ok.className='g';ok.textContent='OK';ok.onclick=async()=>{await api('/api/admin',{jetons:{id:c.id,delta:+i.value||0}});$('admBtn').click();};r.appendChild(i);r.appendChild(ok);if(c.role!=='admin'){const del=document.createElement('button');del.textContent='Suppr';del.style.background='#5a1212';del.style.color='#fff';del.onclick=async()=>{if(!confirm('Supprimer '+c.pseudo+' ?'))return;await api('/api/admin',{supprimer:c.id});$('admBtn').click();};r.appendChild(del);}list.appendChild(r);});
paintHisto(d.histo);};
$('ncBtn').onclick=async()=>{try{const raw=$('ns').value;const solde=raw===''?0:Number(raw);await api('/api/admin',{nouveau:{pseudo:$('np').value.trim(),code:$('nc').value,solde}});$('np').value='';$('nc').value='';$('admBtn').click();}catch(e){alert(e.message);}};
$('back').onclick=async()=>{if(liveT)clearInterval(liveT);show('game');render(await api('/api/etat'));startSync();if(moi&&moi.role==='admin')startHud();};
if($('ps')&&localStorage.getItem('bj.ps')){$('ps').value=localStorage.getItem('bj.ps');$('cd').value=localStorage.getItem('bj.cd')||'';if($('mem'))$('mem').checked=true;}
if($('spyBtn'))$('spyBtn').onclick=()=>{if($('spyBox'))$('spyBox').classList.toggle('on');};
if($('admBtn2'))$('admBtn2').onclick=()=>$('admBtn').click();
if($('out3'))$('out3').onclick=()=>$('out').click();
if(token){api('/api/etat').then(s=>{moi={pseudo:s.pseudo,role:s.role,solde:s.solde};$('admBtn').style.display=s.role==='admin'?'inline':'none';if($('admBtn2'))$('admBtn2').style.display=s.role==='admin'?'inline':'none';show('lobby');paintLobby();armSpy();if(s.role==='admin') startHud();}).catch(()=>{});}
</script></body></html>`;
http.createServer(async(req,res)=>{const p=new URL(req.url,'http://x').pathname;if(p.startsWith('/api/'))return api(req,res,p);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(PAGE);}).listen(PORT,()=>console.log('BJ',PORT));
