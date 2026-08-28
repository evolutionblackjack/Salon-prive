const http=require('http');const crypto=require('crypto');
const PORT=process.env.PORT||3000;const id=()=>crypto.randomBytes(8).toString('hex');
const MODE={aleatoire:'Aléatoire',bingo:'Bingo banque',gros_gain:'Gros gain',gain:'Gain banque',perte:'Perte 6',grosse_perte:'Joueur 7',pipo:'Joueur 9',maxi:'Joueur 10'};
const TURN=20000,BETWIN=20000;
let mode='aleatoire',plan=[],favor=null;
const comptes=new Map(),sessions=new Map(),watchers=new Set();
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function refillPlan(){
  const bank={bingo:8,gros_gain:7,gain:6}[mode];
  const ply={maxi:10,pipo:9,grosse_perte:7,perte:6}[mode];
  plan=[];
  if(mode==='aleatoire'||(!bank&&!ply))return;
  const n=bank||0,p=ply||0,rest=10-(n||p);
  if(bank){for(let i=0;i<n;i++)plan.push('bank');for(let i=0;i<rest;i++)plan.push('player');}
  else{for(let i=0;i<p;i++)plan.push('player');for(let i=0;i<rest;i++)plan.push('bank');}
  shuffle(plan);
}
function takeFavor(){if(mode==='aleatoire')return null;if(!plan.length)refillPlan();return plan.pop()||null;}
function add(p,c,r,s){const x={id:id(),pseudo:p,code:c,role:r,solde:s};comptes.set(x.id,x);return x;}
add('Patron','admin21','admin',999999);add('maelu','tuleccc','joueur',5000);
function shoe(){const C=['♠','♥','♦','♣'],V=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];const a=[];for(let d=0;d<5;d++)for(const c of C)for(const v of V)a.push({v,c,id:id()});return shuffle(a);}
function val(c){if(['J','Q','K'].includes(c.v))return 10;if(c.v==='A')return 11;return +c.v;}
function tot(m){let t=0,a=0;for(const c of m||[]){t+=val(c);if(c.v==='A')a++;}while(t>21&&a){t-=10;a--;}return t;}
function bj(m){return m&&m.length===2&&tot(m)===21;}
function pair(m){const r=c=>['10','J','Q','K'].includes(c.v)?'10':c.v;return m&&m.length===2&&r(m[0])===r(m[1]);}
function addVal(now,c){return now+(c.v==='A'?(now+11<=21?11:1):val(c));}

const T={seats:[null,null,null,null,null],dealer:[],phase:'bet',turn:-1,hi:0,until:0,msg:'PLACE YOUR BETS',sabot:shoe(),last:0};

function emptySeat(uid,pseudo){return{uid,pseudo,bet:0,hands:[{cards:[],bet:0,done:false}],hi:0,act:Date.now(),res:''};}
function seated(){return T.seats.map((s,i)=>s?{s,i}:null).filter(Boolean);}
function mine(uid){return T.seats.findIndex(s=>s&&s.uid===uid);}
function draw(forD,now){
  if(T.sabot.length<30)T.sabot=shoe();
  if(!favor||Math.random()<0.12)return T.sabot.pop();
  const bank=favor==='bank';
  const sl=T.sabot.slice(-18);
  const score=c=>{
    const n=addVal(now||0,c);
    if(forD){
      if(bank){if(n>21)return 90;if(n>=17&&n<=20)return Math.abs(19-n);return 12+Math.abs(18-n);}
      if(n>21)return 1;return 10+n;
    }
    if(bank){if(n>21)return 2;if(n>=12&&n<=16)return 1;if(n>=20)return 22;return 8;}
    if(n>21)return 40;if(n>=18&&n<=20)return 0;return Math.abs(19-n);
  };
  const pick=sl.slice().sort((a,b)=>score(a)-score(b))[0]||T.sabot[T.sabot.length-1];
  const i=T.sabot.lastIndexOf(pick);if(i>=0)T.sabot.splice(i,1);else return T.sabot.pop();return pick;
}
function liveSnap(){
  return{
    phase:T.phase,msg:T.msg,until:T.until,now:Date.now(),turn:T.turn,
    dealer:T.dealer,seats:T.seats.map(s=>s?{pseudo:s.pseudo,bet:s.bet,res:s.res,hi:s.hi,hands:s.hands.map(h=>({cards:h.cards,tot:tot(h.cards),bet:h.bet}))}:null),
    comptes:[...comptes.values()].map(c=>({pseudo:c.pseudo,role:c.role,solde:c.solde}))
  };
}
function push(){
  const payload='data:'+JSON.stringify(liveSnap())+'\n\n';
  for(const w of [...watchers]){try{w.write(payload);}catch(e){watchers.delete(w);}}
}
function pub(u){
  const hide=T.phase==='play'&&T.dealer[1];
  const si=mine(u.id);
  const my=si>=0?T.seats[si]:null;
  const H=my&&my.hands[my.hi];
  const canAct=T.phase==='play'&&T.turn===si&&H&&!H.done;
  return{
    phase:T.phase,msg:T.msg,until:T.until,now:Date.now(),turn:T.turn,seat:si,
    dealer:T.dealer.map((c,i)=>hide&&i===1?{v:'?',c:'?'}:c),
    dtot:hide?val(T.dealer[0]||{v:'0'}):(T.dealer.length?tot(T.dealer):null),
    seats:T.seats.map((s,i)=>{
      if(!s)return{i,empty:true};
      return{i,pseudo:s.pseudo,you:s.uid===u.id,bet:s.bet,res:s.res,on:T.turn===i,
        hands:s.hands.map((h,k)=>({cards:h.cards,bet:h.bet,tot:tot(h.cards),done:h.done,on:s.uid===u.id&&s.hi===k}))};
    }),
    canHit:!!canAct,canStand:!!canAct,
    canDouble:!!(canAct&&H.cards.length===2&&u.solde>=H.bet),
    canSplit:!!(canAct&&my.hands.length<2&&pair(H.cards)&&u.solde>=H.bet),
    solde:u.solde,pseudo:u.pseudo,role:u.role,bet:my?my.bet:0
  };
}
function settleHand(hand,bet,c,spl){
  const pj=tot(hand),dj=tot(T.dealer);
  if(pj>21)return'perdu';
  if(!spl&&bj(hand)&&!bj(T.dealer)){const w=Math.floor(bet*1.5);c.solde+=bet+w;return'blackjack';}
  if(dj>21||pj>dj){c.solde+=bet*2;return'gagne';}
  if(pj===dj){c.solde+=bet;return'egalite';}
  return'perdu';
}
function startTurns(){
  const list=seated().filter(x=>x.s.bet>=10);
  if(!list.length){T.phase='bet';T.turn=-1;T.msg='PLACE YOUR BETS';return;}
  T.phase='play';
  const first=list[0];
  T.turn=first.i;T.hi=0;first.s.hi=0;T.until=Date.now()+TURN;
  T.msg='Tour de '+first.s.pseudo+' · 20 s';
}
function nextHandOrSeat(){
  const s=T.seats[T.turn];
  if(s&&s.hi<s.hands.length-1){
    s.hi++;T.until=Date.now()+TURN;T.msg='Tour de '+s.pseudo+' · main '+(s.hi+1);return;
  }
  const nxt=seated().find(x=>x.i>T.turn&&x.s.bet>=10);
  if(nxt){T.turn=nxt.i;nxt.s.hi=0;T.until=Date.now()+TURN;T.msg='Tour de '+nxt.s.pseudo+' · 20 s';return;}
  dealerPlay();
}
function dealerPlay(){
  T.phase='dealer';T.turn=-1;T.msg='La banque tire…';
  const alive=seated().some(x=>x.s.hands.some(h=>tot(h.cards)<=21));
  if(alive){while(tot(T.dealer)<17)T.dealer.push(draw(true,tot(T.dealer)));}
  seated().forEach(({s})=>{
    const c=comptes.get(s.uid);if(!c)return;
    const rs=s.hands.map((h,i)=>settleHand(h.cards,h.bet,c,i>0||s.hands.length>1));
    s.res=rs.join(' / ');
  });
  T.phase='end';T.until=Date.now()+8000;T.msg='Fin du coup';
  push();
}
function dealRound(){
  const ready=seated().filter(x=>x.s.bet>=10);
  if(!ready.length)return;
  favor=takeFavor();T.dealer=[];
  ready.forEach(({s})=>{s.hands=[{cards:[],bet:s.bet,done:false}];s.hi=0;s.res='';});
  ready.forEach(({s})=>s.hands[0].cards.push(draw(false,0)));
  T.dealer.push(draw(true,0));
  ready.forEach(({s})=>s.hands[0].cards.push(draw(false,tot(s.hands[0].cards))));
  T.dealer.push(draw(true,val(T.dealer[0])));
  const allBj=ready.every(({s})=>bj(s.hands[0].cards));
  if(allBj){dealerPlay();return;}
  ready.forEach(({s})=>{
    if(bj(s.hands[0].cards)){s.hands[0].done=true;}
  });
  startTurns();
  const cur=T.seats[T.turn];
  if(cur&&cur.hands[0]&&cur.hands[0].done)nextHandOrSeat();
}
function standNow(){
  const s=T.seats[T.turn];if(!s){nextHandOrSeat();return;}
  const H=s.hands[s.hi];if(H)H.done=true;
  nextHandOrSeat();
}
function resetBets(){
  T.phase='bet';T.turn=-1;T.dealer=[];T.until=0;T.msg='PLACE YOUR BETS';
  T.seats.forEach(s=>{if(!s)return;s.bet=0;s.hands=[{cards:[],bet:0,done:false}];s.hi=0;s.res='';});
}
function kick(i,refund){
  const s=T.seats[i];if(!s)return;
  const u=comptes.get(s.uid);
  if(refund&&u&&s.bet&&T.phase==='play')s.hands.forEach(h=>u.solde+=(h.bet||0));
  T.seats[i]=null;
  if(T.turn===i)nextHandOrSeat();
  if(!seated().length)resetBets();
}

setInterval(()=>{
  const now=Date.now();
  if(T.phase==='play'&&T.turn>=0&&T.until&&now>=T.until){standNow();push();}
  if(T.phase==='bet'&&T.until&&now>=T.until){if(seated().some(x=>x.s.bet>=10))dealRound();else T.until=0;push();}
  if(T.phase==='end'&&T.until&&now>=T.until){resetBets();push();}
  T.seats.forEach((s,i)=>{if(s&&now-s.act>60000)kick(i,true);});
},400);

function me(req){const h=req.headers.authorization||'';const t=h.startsWith('Bearer ')?h.slice(7):null;return t&&sessions.has(t)?comptes.get(sessions.get(t)):null;}
function read(req){return new Promise(r=>{let d='';req.on('data',x=>d+=x);req.on('end',()=>{try{r(JSON.parse(d||'{}'));}catch{r({});}});});}
function json(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(o));}

async function api(req,res,path){
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end();}
  if(path==='/api/stream'){
    const t=new URL(req.url,'http://x').searchParams.get('t');
    const u=t&&sessions.has(t)?comptes.get(sessions.get(t)):null;
    if(!u)return json(res,401,{err:'Session'});
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});
    watchers.add(res);res.write('data:'+JSON.stringify(liveSnap())+'\n\n');
    req.on('close',()=>watchers.delete(res));return;
  }
  const b=req.method==='POST'?await read(req):{};
  if(path==='/api/login'&&req.method==='POST'){
    let c=null;for(const x of comptes.values())if(x.pseudo.toLowerCase()===String(b.pseudo||'').toLowerCase()&&x.code===String(b.code||''))c=x;
    if(!c)return json(res,401,{err:'Code refusé'});if(c.solde<10)c.solde=3000;
    const t=id()+id();sessions.set(t,c.id);return json(res,200,{token:t,moi:{id:c.id,pseudo:c.pseudo,role:c.role,solde:c.solde}});
  }
  const u=me(req);if(!u)return json(res,401,{err:'Session'});
  if(path==='/api/etat')return json(res,200,pub(u));
  if(path==='/api/asseoir'&&req.method==='POST'){
    if(T.phase!=='bet'&&T.phase!=='end')return json(res,400,{err:'Attends la fin du coup'});
    const n=+b.place;if(!(n>=0&&n<5))return json(res,400,{err:'Place 1 à 5'});
    if(T.seats[n])return json(res,400,{err:'Place prise'});
    const old=mine(u.id);if(old>=0)T.seats[old]=null;
    T.seats[n]=emptySeat(u.id,u.pseudo);push();return json(res,200,pub(u));
  }
  if(path==='/api/quitter'&&req.method==='POST'){
    const i=mine(u.id);if(i>=0)kick(i,true);push();return json(res,200,pub(u));
  }
  if(path==='/api/miser'&&req.method==='POST'){
    if(T.phase!=='bet'&&T.phase!=='end')return json(res,400,{err:'Attends'});
    if(T.phase==='end')resetBets();
    const i=mine(u.id);if(i<0)return json(res,400,{err:'Assieds-toi'});
    const m=+b.montant;if(!(m>=10&&m<=100))return json(res,400,{err:'Mise 10 à 100'});
    const s=T.seats[i];const add=m;if(s.bet+add>100)return json(res,400,{err:'Max 100'});
    if(u.solde<add)return json(res,400,{err:'Solde'});
    u.solde-=add;s.bet+=add;s.act=Date.now();
    if(!T.until)T.until=Date.now()+BETWIN;
    T.msg='Mises… '+(Math.max(0,Math.ceil((T.until-Date.now())/1000)))+' s';
    if(seated().length&&seated().every(x=>x.s.bet>=10))dealRound();
    push();return json(res,200,pub(u));
  }
  if(path==='/api/action'&&req.method==='POST'){
    const i=mine(u.id);if(i<0||T.phase!=='play'||T.turn!==i)return json(res,400,{err:'Pas ton tour'});
    const s=T.seats[i];s.act=Date.now();const H=s.hands[s.hi];if(!H||H.done)return json(res,400,{err:'Main finie'});
    const a=b.action;
    if(a==='hit'){H.cards.push(draw(false,tot(H.cards)));T.until=Date.now()+TURN;if(tot(H.cards)>=21){H.done=true;nextHandOrSeat();}}
    else if(a==='stand'){H.done=true;nextHandOrSeat();}
    else if(a==='double'){
      if(H.cards.length!==2)return json(res,400,{err:'2 cartes'});
      if(u.solde<H.bet)return json(res,400,{err:'Solde'});
      u.solde-=H.bet;H.bet*=2;s.bet+=H.bet/2;
      H.cards.push(draw(false,tot(H.cards)));H.done=true;nextHandOrSeat();
    }
    else if(a==='split'){
      if(s.hands.length>=2||!pair(H.cards))return json(res,400,{err:'Pas séparable'});
      if(u.solde<H.bet)return json(res,400,{err:'Solde'});
      u.solde-=H.bet;
      const c2=H.cards.pop();const nh={cards:[c2],bet:H.bet,done:false};
      H.cards.push(draw(false,tot(H.cards)));nh.cards.push(draw(false,0));
      s.hands.push(nh);s.bet+=H.bet;T.until=Date.now()+TURN;
      if(H.cards[0].v==='A'){H.done=true;nh.done=true;nextHandOrSeat();}
    }else return json(res,400,{err:'Action'});
    push();return json(res,200,pub(u));
  }
  if(path==='/api/live')return json(res,200,liveSnap());
  if(path==='/api/admin'&&u.role==='admin'){
    if(req.method==='GET')return json(res,200,{mode,modes:MODE,comptes:[...comptes.values()].map(c=>({id:c.id,pseudo:c.pseudo,code:c.code,role:c.role,solde:c.solde}))});
    if(b.mode&&MODE[b.mode]){mode=b.mode;plan=[];favor=null;refillPlan();}
    if(b.nouveau&&b.nouveau.pseudo&&b.nouveau.code)add(b.nouveau.pseudo,b.nouveau.code,'joueur',+b.nouveau.solde||2000);
    if(b.jetons&&b.jetons.id){const c=comptes.get(b.jetons.id);if(c)c.solde=Math.max(0,c.solde+(+b.jetons.delta||0));}
    push();return json(res,200,{ok:true,mode});
  }
  return json(res,404,{err:'?'});
}

const PAGE=/*html*/`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><title>Blackjack</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,serif;background:#1a1008;color:#f4efe4}
.v{display:none;min-height:100dvh;flex-direction:column}.v.on{display:flex}
#login{align-items:center;justify-content:center;background:radial-gradient(circle at 30% 20%,#5a1212,#0a0404);padding:1.5rem;text-align:center}
h1{letter-spacing:.2em;font-weight:500;margin:.6rem 0 1.2rem}
input{width:100%;max-width:320px;padding:.8rem;margin:.3rem 0;border:1px solid #c9a22766;background:#1a0808;color:#fff;text-align:center;border-radius:8px}
button{border:0;border-radius:8px;padding:.7rem 1rem;font-weight:700}
.g{background:linear-gradient(#e8d48b,#b8860b);color:#1a1205}
.err{color:#f87171;min-height:1.2em}
.note{max-width:360px;margin:1.1rem auto 0;padding:.75rem .85rem;border:1px solid #c9a22744;border-radius:10px;font-size:.72rem;line-height:1.45;color:#c8c0b0;text-align:left}.note b{color:#e8d48b}
.bar{display:flex;justify-content:space-between;align-items:center;padding:.55rem .7rem;background:#07110c}
#game{background:linear-gradient(#4a301c,#2a1810);padding:8px;height:100dvh;max-height:100dvh;overflow:hidden;display:flex;flex-direction:column}
#game .bar{display:none}
.felt{flex:1;min-height:0;overflow:hidden;padding:.35rem .35rem .15rem;display:flex;flex-direction:column;align-items:center;gap:.12rem;background:radial-gradient(ellipse at 50% 30%,#7a2430 0%,#5a1520 42%,#3a0e14 100%);border-radius:18px 18px 40% 40% / 18px 18px 28% 28%;border:3px solid #c9a66a;box-shadow:inset 0 0 40px #0006}
.brand{letter-spacing:.28em;font-size:.72rem;color:#e8d48b}
.lab{font-size:.62rem;letter-spacing:.16em;opacity:.7;color:#f0d9a0}
.hand{display:flex;gap:0;min-height:42px;justify-content:center}
.card{width:34px;height:48px;margin-right:-14px;border-radius:3px;background:#fff;color:#151515;position:relative;box-shadow:0 3px 6px #0006;border:1px solid #ccc;flex-shrink:0}
.card .idx{position:absolute;top:2px;left:3px;line-height:1;text-align:center;font-weight:800;font-family:Arial,sans-serif}
.card .idx b{display:block;font-size:.52rem}.card .idx i{display:block;font-style:normal;font-size:.48rem}
.card .idx.bot{top:auto;bottom:2px;left:auto;right:3px;transform:rotate(180deg)}
.card .ctr{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);font-size:1.2rem}
.pips{position:absolute;left:6px;right:6px;top:10px;bottom:8px;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:repeat(3,1fr);place-items:center;font-size:.4rem}
.card.r{color:#d32f2f}
.card.x{background:repeating-linear-gradient(45deg,#0b2a6b 0 6px,#123a86 6px 12px);border:2px solid #f0d78a;color:transparent}
.tot{background:#0006;padding:.1rem .4rem;border-radius:99px;font-size:.72rem;margin:.15rem auto}
.timer{min-height:1.1rem;letter-spacing:.12em;color:#e8d48b;font-size:.85rem}
.arc{text-align:center;color:#e8d48b;opacity:.7;font-size:.52rem;margin:.35rem 0 .8rem;letter-spacing:.04em}
.spots{display:flex;flex-direction:row;width:100%;gap:.2rem;margin-top:auto;align-items:flex-end}
.empties{display:flex;gap:.25rem;width:100%}
.sp{flex:1;width:auto;border:0;background:transparent;padding:.1rem 0;text-align:center}
.sp.on{box-shadow:inset 0 0 0 2px #e8d48b}
.sp .nm{font-size:.52rem;letter-spacing:.04em;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp .bt{font-size:.58rem;color:#e8d48b}
.sp .sit{font-size:.58rem;color:#8f8;padding:.25rem 0}
.seats5{display:flex;justify-content:center;gap:.35rem;width:100%;margin:.25rem 0}
.seat{width:52px;height:52px;border-radius:50%;border:3px solid #2dff7a;box-shadow:0 0 10px #2dff7a55;display:flex;align-items:center;justify-content:center;font-size:.42rem;letter-spacing:.03em;color:#b8ffd0;background:#0a2a18;text-align:center;padding:3px;margin:.15rem auto 0}
.seat.on{border-color:#f0c14a;color:#f0c14a;box-shadow:0 0 14px #f0c14a66}
.seat.busy{border-color:#89a;color:#cde;opacity:.85}
.place{letter-spacing:.2em;font-size:.78rem;color:#fff;text-shadow:0 2px 8px #000;font-weight:700}
.oval{width:120px;height:52px;border:2px solid rgba(201,176,90,.5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:.1rem auto}
.dock{flex-shrink:0;padding:.45rem .5rem calc(.5rem + env(safe-area-inset-bottom));background:linear-gradient(#3a2418,#23150e);border-top:2px solid #c9a22766}
.chips{display:flex;justify-content:center;gap:.45rem;margin-bottom:.4rem}
.chip{width:58px;height:58px;padding:0;border:0;background:transparent;border-radius:50%}
.chip svg{width:58px;height:58px;display:block;filter:drop-shadow(0 4px 6px #0008)}
.acts{display:flex;justify-content:center;gap:.35rem;flex-wrap:wrap}
.acts button{background:linear-gradient(#1c3d2a,#0e2418);color:#e8d48b;border:1px solid #c9a22777;min-height:48px;min-width:86px;border-radius:10px;font-family:Georgia,serif}
.rail{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(#4a301c,#2a1810);padding:.35rem .7rem;flex-shrink:0}
.rk{font-size:.5rem;letter-spacing:.14em;opacity:.65}.rv{font-size:1rem;font-weight:700;color:#f0e0a8}
.out2{background:#3a1212;color:#f4efe4;border:1px solid #c9a22744;padding:.3rem .5rem;border-radius:8px;font-size:.68rem}
.gear{width:38px;height:38px;border-radius:50%;background:#2a1810;border:1px solid #c9a22755;color:#e8d48b}
.hud{display:none;position:absolute;top:6px;right:6px;width:42%;max-width:168px;z-index:12;background:#0b0b0bd4;border:1px solid #c9a22766;border-radius:10px;padding:.3rem;font-size:.58rem;pointer-events:none;max-height:28%;overflow:auto}
.hud.on{display:block}.hud b{color:#e8d48b}
.banner{position:fixed;left:14%;right:14%;bottom:26%;z-index:30;background:#000b;border:1px solid #e8d48b;border-radius:10px;padding:.35rem .65rem;text-align:center;pointer-events:none}
.banner b{display:block;letter-spacing:.2em;color:#e8d48b;font-size:.55rem}
#admin{background:#111;padding:1rem;overflow:auto}#admin h2{margin:.8rem 0 .4rem;color:#e8d48b;font-size:1rem}
.livebox{background:#1a1a1a;border:1px solid #c9a22744;border-radius:10px;padding:.7rem;margin:.6rem 0}
.row{display:flex;gap:.4rem;align-items:center;margin:.35rem 0;flex-wrap:wrap}.row input{max-width:110px;text-align:left;padding:.4rem}
</style></head><body>
<div id="login" class="v on"><div>
<div style="width:70px;height:70px;border:2px solid #c9a227;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;color:#c9a227;font-size:1.4rem">21</div>
<h1>BLACKJACK</h1>
<input id="ps" placeholder="Pseudo"><input id="cd" type="password" placeholder="Code">
<button class="g" id="go" style="width:100%;max-width:320px;margin-top:.5rem">Entrer</button>
<p class="err" id="er"></p>
<p class="note">Table à 5 places. 20 s pour Tirer / Rester. Sabot Fisher–Yates.</p>
</div></div>
<div id="game" class="v">
<div class="bar"><b id="who"></b><span id="solde"></span><span>
<button class="g" id="admBtn" style="display:none;padding:.3rem .55rem">Admin</button>
<button id="leave" style="background:#4a2a16;color:#f4efe4;padding:.3rem .5rem">Lever</button>
<button id="out" style="background:#333;color:#fff;padding:.3rem .5rem">Déconnexion</button>
</span></div>
<div class="felt">
  <div class="brand">BLACKJACK</div>
  <div class="lab">CROUPIER</div>
  <div class="hand" id="dh"></div><div class="tot" id="dt"></div>
  <div class="timer" id="timer"></div>
  <div class="arc">LE BLACKJACK PAIE 3 POUR 2 · BANQUE RESTE À 17</div>
  <div class="place" id="place">PLACE YOUR BETS</div>
  <div class="oval" id="oval"></div>
  <div id="msg"></div>
  <div class="spots" id="spots"></div>
  <div class="seats5" id="seats5"></div>
</div>
<div class="rail">
  <div><div class="rk">SOLDE</div><div class="rv" id="railSolde">0</div></div>
  <div><div class="rk">MISE</div><div class="rv" id="railMise">0</div></div>
  <div style="display:flex;gap:.3rem"><button class="out2" id="out2">Déconnexion</button><button class="gear" id="gear">⚙</button></div>
</div>
<div class="hud" id="hud"><div id="hudTxt">Live…</div></div>
<div class="dock"><div class="chips" id="chips"></div><div class="acts" id="acts"></div></div>
</div>
<div id="admin" class="v"><div class="bar"><b>Régie</b><button class="g" id="back">Retour</button></div>
<div class="livebox"><b>Live</b><div id="liveGame">—</div><div class="hand" id="liveDH"></div><div class="hand" id="livePH"></div></div>
<h2>Soldes</h2><div id="liveSoldes"></div><div id="modes"></div>
<h2>Nouveau compte</h2><div class="row"><input id="np" placeholder="Pseudo"><input id="nc" placeholder="Code"><input id="ns" type="number" value="2000"><button class="g" id="ncBtn">Créer</button></div>
<h2>Comptes</h2><div id="clist"></div></div>
<script>
const $=i=>document.getElementById(i);
let token=localStorage.getItem('bj.t'),moi=null,lastBet=0,actx=null,es=null,tick=null,lastSig='';
function show(i){document.querySelectorAll('.v').forEach(x=>x.classList.remove('on'));$(i).classList.add('on');}
async function api(p,b){const o={method:b?'POST':'GET',headers:{'Content-Type':'application/json'}};if(token)o.headers.Authorization='Bearer '+token;if(b)o.body=JSON.stringify(b);const r=await fetch(p,o);const d=await r.json();if(r.status===401){token=null;localStorage.removeItem('bj.t');show('login');throw new Error('Session');}if(!r.ok)throw new Error(d.err||'Erreur');return d;}
function beep(f,ms){try{if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();if(actx.state==='suspended')actx.resume();const t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.06,t);g.gain.exponentialRampToValueAtTime(.001,t+.12);o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+.13);}catch(e){}}
function noise(){try{if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();const n=actx.createBuffer(1,actx.sampleRate*.05,actx.sampleRate);const d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/d.length*.2);const s=actx.createBufferSource();s.buffer=n;s.connect(actx.destination);s.start();}catch(e){}}
function sndCard(){noise();beep(900,.05);}function sndChip(){beep(220,.04);}
function sndWin(){beep(980,.06);setTimeout(()=>beep(1320,.08),70);}function sndLose(){beep(160,.12);}
function svgChip(v,col){
  const spots=Array.from({length:8},(_,i)=>{const a=(i*45-11)*Math.PI/180,b=(i*45+11)*Math.PI/180,r=35;return '<path d="M38 38 L'+(38+Math.cos(a)*r).toFixed(1)+' '+(38+Math.sin(a)*r).toFixed(1)+' A35 35 0 0 1 '+(38+Math.cos(b)*r).toFixed(1)+' '+(38+Math.sin(b)*r).toFixed(1)+' Z" fill="'+(col||'#7a1f2b')+'"/>';}).join('');
  return '<svg viewBox="0 0 76 76"><circle cx="38" cy="38" r="37" fill="#111"/>'+spots+'<circle cx="38" cy="38" r="24.5" fill="#0d0d0d" stroke="#d4b45a" stroke-width=".8"/><text x="38" y="44" text-anchor="middle" font-size="18" font-weight="800" fill="#e8d48b" font-family="Georgia">'+v+'</text></svg>';
}
const PIPS={A:[5],'2':[2,8],'3':[2,5,8],'4':[1,3,7,9],'5':[1,3,5,7,9],'6':[1,3,4,6,7,9],'7':[1,3,4,5,6,7,9],'8':[1,3,4,5,6,7,8,9],'9':[1,2,3,4,6,7,8,9],'10':[1,2,3,4,5,6,7,8,9]};
function C(c){const d=document.createElement('div');const hid=!c||c.v==='?';d.className='card'+(hid?' x':((c.c==='♥'||c.c==='♦')?' r':''));
if(!hid){const r=c.v,s=c.c;const mid=PIPS[r]?('<div class="pips">'+[1,2,3,4,5,6,7,8,9].map(n=>'<span>'+(PIPS[r].includes(n)?s:'')+'</span>').join('')+'</div>'):('<div class="ctr">'+r+s+'</div>');
d.innerHTML='<div class="idx"><b>'+r+'</b><i>'+s+'</i></div>'+mid+'<div class="idx bot"><b>'+r+'</b><i>'+s+'</i></div>';}return d;}
function fill(el,cards){if(!el)return;const want=cards||[];
  while(el.children.length>want.length)el.removeChild(el.lastChild);
  for(let i=0;i<want.length;i++){
    const k=(want[i]&&want[i].v||'?')+(want[i]&&want[i].c||'');
    if(el.children[i]&&el.children[i].dataset.k===k)continue;
    const d=C(want[i]);d.dataset.k=k;if(el.children[i])el.replaceChild(d,el.children[i]);else el.appendChild(d);
  }
}
function banner(t,a){const o=document.querySelector('.banner');if(o)o.remove();const b=document.createElement('div');b.className='banner';b.innerHTML='<b>'+t+'</b><span>'+a+'</span>';document.body.appendChild(b);setTimeout(()=>b.remove(),1400);}
let lastPhase='';
function paint(s,full){
  moi={pseudo:s.pseudo,role:s.role,solde:s.solde};
  $('who').textContent=s.pseudo;$('solde').textContent='€'+s.solde;
  $('railSolde').textContent=s.solde;$('railMise').textContent=s.bet||lastBet||0;
  $('msg').textContent=s.msg||'';
  fill($('dh'),s.dealer);$('dt').textContent=s.dtot!=null?s.dtot:'';
  const left=s.until?Math.max(0,Math.ceil((s.until-Date.now())/1000)):0;
  window._until=(s.phase==='play'||s.phase==='bet')?s.until:0;
  $('timer').textContent=left&&window._until?(left+' s'):'';
  if($('place'))$('place').style.visibility=(s.phase==='bet'||s.phase==='end')?'visible':'hidden';
  const spots=$('spots');
  if(spots.dataset.n!=='5'){spots.innerHTML='';spots.dataset.n='5';
    (s.seats||[]).forEach(sp=>{const d=document.createElement('div');d.className='sp';d.id='sp'+sp.i;d.innerHTML='<div class="hands"></div><div class="bt"></div><div class="seat" id="sk'+sp.i+'"></div>';spots.appendChild(d);});
  }
  (s.seats||[]).forEach(sp=>{
    const d=$('sp'+sp.i);if(!d)return;
    d.className='sp'+(sp.on?' on':'');
    const bt=d.querySelector('.bt');
    bt.textContent=sp.empty?'':((sp.you?'TOI ':'')+(sp.pseudo||'')+(sp.bet?(' €'+sp.bet):'')+(sp.res?(' '+sp.res):''));
    const box=d.querySelector('.hands');
    box.style.display='flex';box.style.justifyContent='center';box.style.gap='.55rem';box.style.alignItems='flex-start';
    (sp.empty?[]:sp.hands||[]).forEach((h,k)=>{
      let col=box.children[k];
      if(!col || !col.querySelector){col=document.createElement('div');col.innerHTML='<div class="hlab"></div><div class="hand"></div><div class="tot"></div>';box.appendChild(col);}
      col.style.cssText='width:46%;min-width:118px;padding:.2rem;border-radius:10px;'+(h.on?'box-shadow:inset 0 0 0 2px #e8d48b;background:#0004':'');
      col.querySelector('.hlab').textContent=(sp.hands.length>1?('MAIN '+(k+1)+(h.on?' · TON TOUR':'')):'VOUS');
      fill(col.querySelector('.hand'),h.cards||[]);
      col.querySelector('.tot').textContent=(h.tot!=null?h.tot:'');
    });
    while(box.children.length>(sp.hands||[]).length)box.removeChild(box.lastChild);
  });
  if($('seats5'))$('seats5').style.display='none';
  (s.seats||[]).forEach(sp=>{
    const el=$('sk'+sp.i);if(!el)return;
    el.onclick=()=>{if(sp.empty)api('/api/asseoir',{place:sp.i}).then(paint).catch(e=>alert(e.message));};
    if(sp.empty){el.className='seat';el.textContent="S'ASSEOIR ICI";}
    else{el.className='seat '+(sp.you?'on':'busy');el.textContent=sp.you?'TOI':(sp.pseudo||'').slice(0,7);}
  });
  const uiKey=[s.phase,s.canHit,s.canStand,s.canDouble,s.canSplit,s.seat].join('|');
  const chips=$('chips'),acts=$('acts');
  if(acts.dataset.k===uiKey){/* keep buttons */}
  else{acts.dataset.k=uiKey;chips.innerHTML='';acts.innerHTML='';
  const seated=s.seat>=0;
  if((s.phase==='bet'||s.phase==='end')&&seated){
    [10,25,50].forEach(v=>{const b=document.createElement('button');b.className='chip';b.innerHTML=svgChip(v,v===10?'#1e4ec4':v===25?'#1a8a3a':'#c42838');b.onclick=()=>{lastBet=Math.min(100,(lastBet||0)+v);sndChip();$('railMise').textContent=lastBet;};chips.appendChild(b);});
    const clr=document.createElement('button');clr.textContent='Retour';clr.onclick=()=>{lastBet=0;$('railMise').textContent=0;};
    const go=document.createElement('button');go.className='g';go.textContent=s.phase==='end'?'REJOUER':'MISER';
    go.onclick=async()=>{try{const ns=await api('/api/miser',{montant:lastBet||10});sndCard();lastBet=ns.bet;paint(ns);}catch(e){alert(e.message);}};
    acts.appendChild(clr);acts.appendChild(go);
  }
  if(s.phase==='play'&&s.canStand){
    const mk=(l,a)=>{const b=document.createElement('button');b.textContent=l;b.onclick=async()=>{try{sndCard();paint(await api('/api/action',{action:a}));}catch(e){alert(e.message);}};acts.appendChild(b);};
    mk('Tirer','hit');if(s.canDouble)mk('Doubler','double');mk('Rester','stand');if(s.canSplit)mk('Séparer','split');
  }
  if(s.phase==='end'&&s.seat>=0){
    const mine=s.seats[s.seat];
    if(mine&&mine.res){if(/gagne|blackjack/.test(mine.res))sndWin();else if(/perdu/.test(mine.res))sndLose();banner(mine.res,'');}
  }
  }
}

function connectLive(){
  if(es)try{es.close();}catch(e){}
  if(!token)return;
  es=new EventSource('/api/stream?t='+encodeURIComponent(token));
  es.onmessage=async e=>{
    try{
      const d=JSON.parse(e.data);
      const sig=d.phase+'|'+d.turn+'|'+(d.seats||[]).map(x=>x&&(x.pseudo+x.bet+(x.cards||[]).length)).join('');
      if(sig===lastSig)return;lastSig=sig;
      const s=await api('/api/etat');paint(s);
      if($('liveGame'))$('liveGame').textContent=(d.msg||'')+' · '+d.phase;
      if($('hudTxt'))$('hudTxt').innerHTML=(d.seats||[]).map(x=>x?('<div>'+x.pseudo+' €'+(x.bet||0)+'</div>'):'').join('')||'Table vide';
    }catch(err){}
  };
}
$('go').onclick=async()=>{$('er').textContent='';try{const d=await api('/api/login',{pseudo:$('ps').value.trim(),code:$('cd').value});token=d.token;localStorage.setItem('bj.t',token);moi=d.moi;$('admBtn').style.display=moi.role==='admin'?'inline':'none';show('game');paint(await api('/api/etat'));connectLive();if(moi.role==='admin')$('hud').classList.add('on');if(tick)clearInterval(tick);tick=setInterval(()=>{const t=$('timer');if(!t||!window._until)return;const l=Math.max(0,Math.ceil((window._until-Date.now())/1000));t.textContent=l?l+' s':'';},250);}catch(e){$('er').textContent=e.message;}};
$('leave').onclick=async()=>{try{await api('/api/quitter',{});}catch(e){}lastBet=0;paint(await api('/api/etat'));};
$('seat');
$('out2').onclick=()=>$('out').click();
$('out').onclick=()=>{if(es)try{es.close();}catch(e){}if(tick)clearInterval(tick);token=null;localStorage.removeItem('bj.t');show('login');};
$('gear').onclick=()=>{const b=document.querySelector('#game .bar');b.style.display=b.style.display==='flex'?'none':'flex';};
$('admBtn').onclick=async()=>{show('admin');const d=await api('/api/admin');const m=$('modes');m.innerHTML='<h2>Mode</h2>';Object.entries(d.modes).forEach(([k,l])=>{const b=document.createElement('button');b.textContent=l;b.style.margin='.2rem';if(d.mode===k)b.className='g';b.onclick=async()=>{await api('/api/admin',{mode:k});$('admBtn').click();};m.appendChild(b);});
const list=$('clist');list.innerHTML='';d.comptes.forEach(c=>{const r=document.createElement('div');r.className='row';r.innerHTML='<span>'+c.pseudo+' / '+c.code+' · €'+c.solde+'</span>';const i=document.createElement('input');i.type='number';i.placeholder='+/-';const ok=document.createElement('button');ok.className='g';ok.textContent='OK';ok.onclick=async()=>{await api('/api/admin',{jetons:{id:c.id,delta:+i.value||0}});$('admBtn').click();};r.appendChild(i);r.appendChild(ok);list.appendChild(r);});};
$('ncBtn').onclick=async()=>{await api('/api/admin',{nouveau:{pseudo:$('np').value,code:$('nc').value,solde:+$('ns').value||2000}});$('admBtn').click();};
$('back').onclick=async()=>{show('game');paint(await api('/api/etat'));connectLive();};
window.addEventListener('pagehide',()=>{if(token)try{fetch('/api/quitter',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',keepalive:true});}catch(e){}});
if(token){api('/api/etat').then(s=>{moi={pseudo:s.pseudo,role:s.role,solde:s.solde};$('admBtn').style.display=s.role==='admin'?'inline':'none';show('game');paint(s);connectLive();if(s.role==='admin')$('hud').classList.add('on');tick=setInterval(()=>{const t=$('timer');if(!t||!window._until)return;const l=Math.max(0,Math.ceil((window._until-Date.now())/1000));t.textContent=l?l+' s':'';},250);}).catch(()=>{});}
</script></body></html>`;

http.createServer(async(req,res)=>{const p=new URL(req.url,'http://x').pathname;if(p.startsWith('/api/'))return api(req,res,p);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(PAGE);}).listen(PORT,()=>console.log('BJ5',PORT));
