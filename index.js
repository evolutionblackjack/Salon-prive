/**
 * Salon Privé — Blackjack multi-tables (blague, pas d'argent réel)
 * Admin: Patron / admin21
 * Modes: aleatoire | perte | grosse_perte | gain | gros_gain | bingo
 */
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const uuid = () => crypto.randomBytes(8).toString('hex');

const comptes = new Map();
const sessions = new Map();
let modeGlobal = 'aleatoire';
const histGlobal = [];

const MODE_LABELS = {
  aleatoire: 'Aléatoire',
  perte: 'Perte',
  grosse_perte: 'Grosse perte',
  pipo: 'Pipo',
  gain: 'Gain',
  gros_gain: 'Gros gain',
  bingo: 'Bingo'
};
const MODE_BANK = {
  aleatoire: 0.5,
  gain: 0.65,
  gros_gain: 0.75,
  bingo: 0.90,
  perte: 0.35,
  grosse_perte: 0.25,
  pipo: 0.10
};

function creerSabot() {
  const C = ['♠', '♥', '♦', '♣'];
  const V = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const a = [];
  for (let d = 0; d < 6; d++) for (const c of C) for (const v of V) a.push({ v, c, id: uuid() });
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function val(c) {
  if (['J', 'Q', 'K'].includes(c.v)) return 10;
  if (c.v === 'A') return 11;
  return +c.v;
}

function tot(main) {
  let t = 0, a = 0;
  for (const c of main) {
    t += val(c);
    if (c.v === 'A') a++;
  }
  while (t > 21 && a > 0) {
    t -= 10;
    a--;
  }
  return t;
}

function isBJ(main) {
  return main.length === 2 && tot(main) === 21;
}

function rangSplit(c) {
  if (['10', 'J', 'Q', 'K'].includes(c.v)) return '10';
  return c.v;
}

function peutSeparer(main) {
  return main && main.length === 2 && rangSplit(main[0]) === rangSplit(main[1]);
}

function emptySeat() {
  return {
    joueurId: null,
    pseudo: null,
    mise: 0,
    main: [],
    statut: 'vide',
    resultat: null,
    message: ''
  };
}

function newTable(id, nom) {
  return {
    id,
    nom,
    phase: 'attente',
    message: 'Prenez place',
    sabot: creerSabot(),
    croupier: [],
    sieges: [emptySeat(), emptySeat(), emptySeat(), emptySeat(), emptySeat()],
    tourSiege: -1,
    minMise: 10,
    maxMise: 100
  };
}

const tables = {
  1: newTable(1, 'Table 1'),
  2: newTable(2, 'Table 2'),
  3: newTable(3, 'Table 3')
};

const AID = uuid();
comptes.set(AID, {
  id: AID,
  pseudo: 'Patron',
  code: 'admin21',
  role: 'admin',
  solde: 999999,
  actif: true
});
const PID = uuid();
comptes.set(PID, {
  id: PID,
  pseudo: 'maelu',
  code: 'tuleccc',
  role: 'joueur',
  solde: 5000,
  actif: true
});

function compteFromReq(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t || !sessions.has(t)) return null;
  const c = comptes.get(sessions.get(t));
  if (!c || !c.actif) {
    sessions.delete(t);
    return null;
  }
  return c;
}

function body(req) {
  return new Promise(res => {
    let d = '';
    req.on('data', c => (d += c));
    req.on('end', () => {
      try {
        res(d ? JSON.parse(d) : {});
      } catch {
        res({});
      }
    });
  });
}

function send(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  });
  res.end(JSON.stringify(obj));
}

/** Bias: pick a card from the end of the shoe favoring high/low for dealer or player */
function tirer(table, pourCroupier, context) {
  if (table.sabot.length < 30) table.sabot = creerSabot();
  const mode = modeGlobal;
  if (mode === 'aleatoire') return table.sabot.pop();

  const wantDealerWin =
    mode === 'gain' || mode === 'gros_gain' || mode === 'bingo';
  const wantPlayerWin = mode === 'perte' || mode === 'grosse_perte' || mode === 'pipo';
  const strength =
    mode === 'bingo' || mode === 'pipo' ? 0.90 :
    mode === 'gros_gain' || mode === 'grosse_perte' ? 0.75 :
    mode === 'gain' || mode === 'perte' ? 0.65 : 0.5;

  if (Math.random() > strength && mode !== 'bingo' && mode !== 'pipo') return table.sabot.pop();

  const slice = table.sabot.slice(-12);
  const tj = context && context.totJoueur != null ? context.totJoueur : null;
  const tc = tot(table.croupier);

  let ranked = slice.slice();
  if (pourCroupier) {
    if (wantDealerWin) {
      if (tc < 17) ranked.sort((a, b) => val(b) - val(a));
      else ranked.sort((a, b) => Math.abs(val(a) - (21 - tc)) - Math.abs(val(b) - (21 - tc)));
    } else if (wantPlayerWin) {
      if (tc >= 12 && tc <= 16) ranked.sort((a, b) => val(b) - val(a));
      else ranked.sort((a, b) => val(a) - val(b));
    }
  } else {
    if (wantPlayerWin) {
      if (tj != null && tj >= 12 && tj <= 16) ranked.sort((a, b) => val(a) - val(b));
      else ranked.sort((a, b) => Math.abs(21 - (tj || 0) - val(a)) - Math.abs(21 - (tj || 0) - val(b)));
    } else if (wantDealerWin) {
      if (tj != null && tj >= 12 && tj <= 16) ranked.sort((a, b) => val(b) - val(a));
      else ranked.sort((a, b) => val(a) - val(b));
    }
  }

  const pick = ranked[0] || table.sabot[table.sabot.length - 1];
  const idx = table.sabot.findIndex(x => x.id === pick.id);
  if (idx >= 0) table.sabot.splice(idx, 1);
  else return table.sabot.pop();
  return pick;
}

function forceDealerWinHand(table, siege) {
  const tj = tot(siege.main);
  if (tj > 21) return;
  while (tot(table.croupier) < 17) {
    table.croupier.push(tirer(table, true, { totJoueur: tj }));
  }
  let tc = tot(table.croupier);
  if (tc <= tj && tc <= 21) {
    let guard = 0;
    while (tc <= tj && tc < 21 && guard < 5) {
      table.croupier.push(tirer(table, true, { totJoueur: tj }));
      tc = tot(table.croupier);
      guard++;
    }
  }
}

function settleSiege(table, siege, compte) {
  const tj = tot(siege.main);
  const tc = tot(table.croupier);
  let gain = 0;
  let r = 'perdu';
  if (tj > 21) {
    r = 'perdu';
    siege.message = 'Perdu';
  } else if (isBJ(siege.main) && !isBJ(table.croupier)) {
    r = 'blackjack';
    gain = Math.floor(siege.mise * 2.5);
    siege.message = 'Blackjack !';
  } else if (tc > 21) {
    r = 'gagne';
    gain = siege.mise * 2;
    siege.message = 'Gagné';
  } else if (tj > tc) {
    r = 'gagne';
    gain = siege.mise * 2;
    siege.message = 'Gagné';
  } else if (tj === tc) {
    r = 'egalite';
    gain = siege.mise;
    siege.message = 'Égalité';
  } else {
    r = 'perdu';
    siege.message = 'Perdu';
  }
  if (compte) compte.solde += gain;
  siege.resultat = r;
  siege.gainAffiche = gain;
  siege.statut = 'fini';
  histGlobal.unshift({
    pseudo: siege.pseudo,
    table: table.id,
    mise: siege.mise,
    resultat: r,
    gain: gain - siege.mise,
    t: Date.now()
  });
  if (histGlobal.length > 80) histGlobal.pop();
}

function publicTable(table, viewer) {
  const isAdmin = viewer && viewer.role === 'admin';
  const phase = table.phase;
  const croupierPublic = table.croupier.map((c, i) => {
    if ((phase === 'jeu' || phase === 'distribution') && i === 1) return { v: '?', c: '?', cachee: true };
    return c;
  });
  let totC = null;
  if (phase !== 'jeu' && phase !== 'distribution') totC = table.croupier.length ? tot(table.croupier) : null;
  else if (table.croupier[0]) totC = val(table.croupier[0]);

  return {
    id: table.id,
    nom: table.nom,
    phase: table.phase,
    message: table.message,
    minMise: table.minMise,
    maxMise: table.maxMise,
    tourSiege: table.tourSiege,
    croupier: croupierPublic,
    totCroupier: totC,
    sieges: table.sieges.map((s, i) => ({
      index: i,
      joueurId: s.joueurId,
      pseudo: s.pseudo,
      mise: s.mise,
      main: s.main,
      tot: s.main.length ? tot(s.main) : null,
      main2: s.main2 || null,
      tot2: s.main2 && s.main2.length ? tot(s.main2) : null,
      mise2: s.mise2 || 0,
      statut: s.statut,
      resultat: s.resultat,
      message: s.message,
      gainAffiche: s.gainAffiche || 0,
      estMoi: viewer ? s.joueurId === viewer.id : false,
      peutSeparer: peutSeparer(s.main) && !s.main2 && (!s.jeuMain || s.jeuMain === 1),
      jeuMain: s.jeuMain || 1
    }))
  };
}

function siegesOccupes(table) {
  return table.sieges.filter(s => s.joueurId).length;
}

function tryStartRound(table) {
  if (table.phase !== 'mises' && table.phase !== 'attente') return;
  const avecMise = table.sieges.filter(s => s.joueurId && s.mise >= table.minMise);
  if (!avecMise.length) return;
  table.phase = 'distribution';
  table.message = 'Distribution…';
  table.croupier = [];
  table.tourSiege = -1;
  for (const s of table.sieges) {
    if (s.joueurId && s.mise >= table.minMise) {
      s.main = [];
      s.main2 = null;
      s.statut = 'en_jeu';
      s.resultat = null;
      s.message = '';
    } else if (s.joueurId) {
      s.statut = 'spectateur';
    }
  }
  const file = [];
  for (let r = 0; r < 2; r++) {
    for (const s of table.sieges) {
      if (s.statut === 'en_jeu') file.push({ type: 'j', s });
    }
    file.push({ type: 'c' });
  }
  let i = 0;
  const poser = () => {
    if (table.phase !== 'distribution') return;
    if (i >= file.length) {
      for (const s of table.sieges) {
        if (s.statut === 'en_jeu' && isBJ(s.main)) {
          s.statut = 'blackjack';
          s.message = 'Blackjack';
        }
      }
      table.phase = 'jeu';
      const next = table.sieges.findIndex(s => s.statut === 'en_jeu');
      if (next < 0) finirCroupierEtRegler(table);
      else {
        table.tourSiege = next;
        table.message = 'Tour de ' + (table.sieges[next].pseudo || 'joueur');
      }
      return;
    }
    const step = file[i++];
    if (step.type === 'j') step.s.main.push(tirer(table, false, { totJoueur: tot(step.s.main) }));
    else table.croupier.push(tirer(table, true, {}));
    table.message = 'Distribution…';
    setTimeout(poser, 480);
  };
  setTimeout(poser, 200);
}

function finirCroupierEtRegler(table) {
  table.tourSiege = -1;
  table.phase = 'croupier';
  table.message = 'Croupier…';
  const actifs = table.sieges.filter(s => s.statut === 'en_jeu' || s.statut === 'reste' || s.statut === 'blackjack');
  while (tot(table.croupier) < 17) {
    table.croupier.push(tirer(table, true, {}));
  }
  if (modeGlobal === 'bingo' || modeGlobal === 'gros_gain') {
    for (const s of table.sieges) {
      if (s.statut === 'en_jeu' || s.statut === 'reste') {
        const tj = tot(s.main);
        if (tj <= 21 && tot(table.croupier) <= tj && tot(table.croupier) <= 21) {
          let g = 0;
          while (tot(table.croupier) <= tj && tot(table.croupier) < 21 && g < 4) {
            table.croupier.push(tirer(table, true, { totJoueur: tj }));
            g++;
          }
        }
      }
    }
  }
  table.phase = 'fin';
  table.message = 'Fin de la main';
  for (const s of table.sieges) {
    if (!s.joueurId || s.mise < table.minMise) continue;
    if (s.statut === 'vide') continue;
    const c = comptes.get(s.joueurId);
    settleSiege(table, s, c);
    if (s.main2 && s.main2.length) {
      const tmp = { main: s.main2, mise: s.mise2 || s.mise, pseudo: s.pseudo, message: '', resultat: null };
      settleSiege(table, tmp, c);
      s.message2 = tmp.message;
      s.resultat2 = tmp.resultat;
    }
  }
  setTimeout(() => {
    if (table.phase !== 'fin') return;
    for (const s of table.sieges) {
      if (!s.joueurId) continue;
      s.main = [];
      s.main2 = null;
      s.mise = 0;
      s.mise2 = 0;
      s.jeuMain = 1;
      s.resultat = null;
      s.message = '';
      s.statut = 'assis';
    }
    table.croupier = [];
    table.phase = 'mises';
    table.message = 'Nouvelles mises';
    table.tourSiege = -1;
  }, 900);
}

function nextPlayerOrDealer(table) {
  let i = table.tourSiege + 1;
  while (i < 5) {
    if (table.sieges[i].statut === 'en_jeu') {
      table.tourSiege = i;
      table.message = 'Tour de ' + table.sieges[i].pseudo;
      return;
    }
    i++;
  }
  finirCroupierEtRegler(table);
}

function lobbyInfo() {
  return [1, 2, 3].map(id => {
    const t = tables[id];
    return {
      id: t.id,
      nom: t.nom,
      places: 5,
      occupees: siegesOccupes(t),
      phase: t.phase,
      minMise: t.minMise
    };
  });
}

async function handleApi(req, res, path) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    });
    return res.end();
  }

  const b = ['POST', 'PUT'].includes(req.method) ? await body(req) : {};

  if (path === '/api/session' && req.method === 'POST') {
    const { pseudo, code } = b;
    if (!pseudo || !code) return send(res, 400, { erreur: 'Pseudo et code requis' });
    let c = null;
    for (const x of comptes.values()) {
      if (x.pseudo.toLowerCase() === String(pseudo).toLowerCase() && x.code === String(code)) {
        c = x;
        break;
      }
    }
    if (!c) return send(res, 401, { erreur: 'Identifiants incorrects' });
    if (!c.actif) return send(res, 401, { erreur: 'Compte désactivé' });
    if (c.solde < 10) c.solde = 5000;
    const t = uuid();
    sessions.set(t, c.id);
    return send(res, 200, {
      jeton: t,
      moi: { id: c.id, pseudo: c.pseudo, role: c.role, solde: c.solde }
    });
  }

  if (path === '/api/session' && req.method === 'DELETE') {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (t) sessions.delete(t);
    return send(res, 200, { ok: true });
  }

  const moi = compteFromReq(req);
  if (!moi && path.startsWith('/api/')) return send(res, 401, { erreur: 'Session expirée' });

  if (path === '/api/moi' && req.method === 'GET') {
    return send(res, 200, {
      moi: { id: moi.id, pseudo: moi.pseudo, role: moi.role, solde: moi.solde },
      ...(moi.role === 'admin' ? { mode: modeGlobal } : {})
    });
  }

  if (path === '/api/profil' && req.method === 'POST') {
    const { pseudo, code, codeActuel } = b;
    if (!codeActuel || codeActuel !== moi.code) return send(res, 400, { erreur: 'Code actuel incorrect' });
    if (pseudo) {
      const p = String(pseudo).trim();
      if (p.length < 2 || p.length > 16) return send(res, 400, { erreur: 'Pseudo 2–16 caractères' });
      for (const x of comptes.values()) {
        if (x.id !== moi.id && x.pseudo.toLowerCase() === p.toLowerCase())
          return send(res, 400, { erreur: 'Pseudo déjà pris' });
      }
      moi.pseudo = p;
      for (const t of Object.values(tables)) {
        for (const s of t.sieges) {
          if (s.joueurId === moi.id) s.pseudo = p;
        }
      }
    }
    if (code) {
      const n = String(code);
      if (n.length < 4) return send(res, 400, { erreur: 'Nouveau code trop court' });
      moi.code = n;
    }
    return send(res, 200, {
      ok: true,
      moi: { id: moi.id, pseudo: moi.pseudo, role: moi.role, solde: moi.solde }
    });
  }

  if (path === '/api/lobby' && req.method === 'GET') {
    return send(res, 200, {
      tables: lobbyInfo(),
      moi: { id: moi.id, pseudo: moi.pseudo, role: moi.role, solde: moi.solde }
    });
  }

  const mTable = path.match(/^\/api\/table\/(\d+)$/);
  if (mTable && req.method === 'GET') {
    const id = +mTable[1];
    const table = tables[id];
    if (!table) return send(res, 404, { erreur: 'Table introuvable' });
    return send(res, 200, {
      table: publicTable(table, moi),
      moi: { id: moi.id, pseudo: moi.pseudo, role: moi.role, solde: moi.solde }
    });
  }

  if (path.match(/^\/api\/table\/\d+\/asseoir$/) && req.method === 'POST') {
    const id = +path.split('/')[3];
    const table = tables[id];
    if (!table) return send(res, 404, { erreur: 'Table introuvable' });
    const idx = Math.floor(+b.siege);
    if (idx < 0 || idx > 4) return send(res, 400, { erreur: 'Siège invalide' });
    for (const t of Object.values(tables)) {
      for (const s of t.sieges) {
        if (s.joueurId === moi.id) {
          s.joueurId = null;
          s.pseudo = null;
          s.mise = 0;
          s.main = [];
          s.statut = 'vide';
        }
      }
    }
    const seat = table.sieges[idx];
    if (seat.joueurId && seat.joueurId !== moi.id) return send(res, 400, { erreur: 'Siège occupé' });
    seat.joueurId = moi.id;
    seat.pseudo = moi.pseudo;
    seat.statut = 'assis';
    seat.mise = 0;
    seat.main = [];
    if (table.phase === 'attente') table.phase = 'mises';
    table.message = 'Mises ouvertes · min ' + table.minMise;
    return send(res, 200, { table: publicTable(table, moi) });
  }

  if (path.match(/^\/api\/table\/\d+\/quitter$/) && req.method === 'POST') {
    const id = +path.split('/')[3];
    const table = tables[id];
    if (!table) return send(res, 404, { erreur: 'Table introuvable' });
    for (const s of table.sieges) {
      if (s.joueurId === moi.id) {
        if (table.phase === 'jeu' && (s.statut === 'en_jeu' || s.statut === 'reste')) {
          return send(res, 400, { erreur: 'Impossible en plein coup' });
        }
        Object.assign(s, emptySeat());
      }
    }
    if (!siegesOccupes(table) && table.phase !== 'jeu') {
      table.phase = 'attente';
      table.message = 'Prenez place';
      table.croupier = [];
    }
    return send(res, 200, { ok: true, tables: lobbyInfo() });
  }

  if (path.match(/^\/api\/table\/\d+\/miser$/) && req.method === 'POST') {
    const id = +path.split('/')[3];
    const table = tables[id];
    if (!table) return send(res, 404, { erreur: 'Table introuvable' });
    if (table.phase !== 'mises' && table.phase !== 'attente' && table.phase !== 'fin') {
      return send(res, 400, { erreur: 'Mises fermées' });
    }
    if (table.phase === 'fin') {
      for (const s of table.sieges) {
        if (s.joueurId) {
          s.main = [];
          s.main2 = null;
          s.mise = 0;
          s.mise2 = 0;
          s.jeuMain = 1;
          s.resultat = null;
          s.message = '';
          s.statut = 'assis';
        }
      }
      table.croupier = [];
      table.phase = 'mises';
      table.message = 'Nouvelles mises';
      table.tourSiege = -1;
    }
    if (table.phase === 'attente') table.phase = 'mises';
    const seat = table.sieges.find(s => s.joueurId === moi.id);
    if (!seat) return send(res, 400, { erreur: 'Asseyez-vous d\'abord' });
    const montant = Math.floor(+b.montant || 0);
    if (montant < table.minMise) return send(res, 400, { erreur: 'Minimum ' + table.minMise });
    if (montant > table.maxMise) return send(res, 400, { erreur: 'Maximum ' + table.maxMise });
    if (montant > moi.solde) return send(res, 400, { erreur: 'Solde insuffisant' });
    moi.solde -= montant;
    seat.mise = montant;
    seat.statut = 'mise';
    setTimeout(() => {
      try {
        if (table.phase === 'mises') {
          const ready = table.sieges.filter(s => s.joueurId && s.mise >= table.minMise);
          if (ready.length) tryStartRound(table);
        }
      } catch (e) {
        console.error(e);
      }
    }, 700);
    return send(res, 200, {
      table: publicTable(table, moi),
      moi: { id: moi.id, pseudo: moi.pseudo, role: moi.role, solde: moi.solde }
    });
  }

  if (path.match(/^\/api\/table\/\d+\/action$/) && req.method === 'POST') {
    const id = +path.split('/')[3];
    const table = tables[id];
    if (!table) return send(res, 404, { erreur: 'Table introuvable' });
    const seat = table.sieges.find(s => s.joueurId === moi.id);
    if (!seat) return send(res, 400, { erreur: 'Pas à cette table' });
    const action = b.action;
    const myIdx = table.sieges.indexOf(seat);

    if (action === 'demarrer' && moi.role === 'admin') {
      tryStartRound(table);
      return send(res, 200, { table: publicTable(table, moi) });
    }

    if (action === 'nouvelle') {
      if (table.phase !== 'fin') return send(res, 400, { erreur: 'Main en cours' });
      for (const s of table.sieges) {
        if (s.joueurId) {
          s.main = [];
          s.main2 = null;
          s.mise = 0;
          s.mise2 = 0;
          s.jeuMain = 1;
          s.resultat = null;
          s.message = '';
          s.statut = 'assis';
        }
      }
      table.croupier = [];
      table.phase = 'mises';
      table.message = 'Nouvelles mises';
      table.tourSiege = -1;
      return send(res, 200, { table: publicTable(table, moi) });
    }

    if (table.phase !== 'jeu' || table.tourSiege !== myIdx || seat.statut !== 'en_jeu') {
      return send(res, 400, { erreur: 'Pas votre tour' });
    }

    const courante = seat.jeuMain === 2 && seat.main2 ? 'main2' : 'main';
    if (action === 'tirer') {
      seat[courante].push(tirer(table, false, { totJoueur: tot(seat[courante]) }));
      if (tot(seat[courante]) > 21) {
        if (courante === 'main' && seat.main2) {
          seat.jeuMain = 2;
          table.message = 'Main 2 — ' + seat.pseudo;
        } else {
          seat.statut = 'creve';
          seat.message = 'Perdu';
          nextPlayerOrDealer(table);
        }
      }
    } else if (action === 'rester') {
      if (courante === 'main' && seat.main2) {
        seat.jeuMain = 2;
        table.message = 'Main 2 — ' + seat.pseudo;
      } else {
        seat.statut = 'reste';
        nextPlayerOrDealer(table);
      }
    } else if (action === 'doubler') {
      const hand = seat[courante];
      if (!hand || hand.length !== 2) return send(res, 400, { erreur: 'Double sur 2 cartes' });
      const miseAct = courante === 'main2' ? (seat.mise2 || seat.mise) : seat.mise;
      if (moi.solde < miseAct) return send(res, 400, { erreur: 'Solde insuffisant' });
      moi.solde -= miseAct;
      if (courante === 'main2') seat.mise2 = miseAct * 2;
      else seat.mise *= 2;
      hand.push(tirer(table, false, { totJoueur: tot(hand) }));
      if (courante === 'main' && seat.main2) {
        seat.jeuMain = 2;
        table.message = 'Main 2 — ' + seat.pseudo;
      } else {
        seat.statut = tot(hand) > 21 ? 'creve' : 'reste';
        if (seat.statut === 'creve') seat.message = 'Perdu';
        nextPlayerOrDealer(table);
      }
    } else if (action === 'separer') {
      if (!peutSeparer(seat.main) || seat.main2) return send(res, 400, { erreur: 'Séparation impossible' });
      if (moi.solde < seat.mise) return send(res, 400, { erreur: 'Solde insuffisant' });
      moi.solde -= seat.mise;
      const c2 = seat.main.pop();
      seat.main2 = [c2];
      seat.mise2 = seat.mise;
      seat.jeuMain = 1;
      seat.main.push(tirer(table, false, { totJoueur: tot(seat.main) }));
      seat.main2.push(tirer(table, false, { totJoueur: tot(seat.main2) }));
      table.message = 'Main 1 — ' + (seat.pseudo || '');
    } else {
      return send(res, 400, { erreur: 'Action inconnue' });
    }

    return send(res, 200, {
      table: publicTable(table, moi),
      moi: { id: moi.id, pseudo: moi.pseudo, role: moi.role, solde: moi.solde }
    });
  }

  if (path.startsWith('/api/regie') && moi.role !== 'admin') {
    return send(res, 403, { erreur: 'Réservé au patron' });
  }

  if (path === '/api/regie' && req.method === 'GET') {
    return send(res, 200, {
      mode: modeGlobal,
      modes: MODE_LABELS,
      comptes: [...comptes.values()].map(x => ({
        id: x.id,
        pseudo: x.pseudo,
        code: x.code,
        role: x.role,
        solde: x.solde,
        actif: x.actif
      })),
      historique: histGlobal.slice(0, 40),
      tables: lobbyInfo()
    });
  }

  if (path === '/api/regie/mode' && req.method === 'POST') {
    if (!MODE_LABELS[b.mode]) return send(res, 400, { erreur: 'Mode invalide' });
    modeGlobal = b.mode;
    console.log('[REGIE] mode=' + modeGlobal);
    return send(res, 200, { ok: true, mode: modeGlobal });
  }

  if (path === '/api/regie/compte' && req.method === 'POST') {
    const { pseudo, code, solde = 2000 } = b;
    if (!pseudo || !code) return send(res, 400, { erreur: 'Pseudo et code requis' });
    for (const x of comptes.values()) {
      if (x.pseudo.toLowerCase() === String(pseudo).toLowerCase())
        return send(res, 400, { erreur: 'Pseudo existe déjà' });
    }
    const id = uuid();
    comptes.set(id, {
      id,
      pseudo: String(pseudo).trim(),
      code: String(code),
      role: 'joueur',
      solde: Math.max(0, Math.floor(+solde || 0)),
      actif: true
    });
    return send(res, 200, { ok: true });
  }

  if (path === '/api/regie/mouvement' && req.method === 'POST') {
    const t = comptes.get(b.compteId);
    if (!t) return send(res, 404, { erreur: 'Compte introuvable' });
    const m = Math.floor(+b.montant || 0);
    if (!m) return send(res, 400, { erreur: 'Montant invalide' });
    t.solde = Math.max(0, t.solde + m);
    return send(res, 200, { ok: true, nouveauSolde: t.solde });
  }

  if (path === '/api/regie/compte/actif' && req.method === 'POST') {
    const t = comptes.get(b.compteId);
    if (!t) return send(res, 404, { erreur: 'Compte introuvable' });
    if (t.role === 'admin') return send(res, 400, { erreur: 'Impossible' });
    t.actif = !!b.actif;
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { erreur: 'Route inconnue' });
}

const HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Blackjack Évolution</title>
<style>
:root{--or:#c9a227;--or2:#e8d48b;--bg:#0a0604;--feutre:#0d3d2e;--feutre2:#0a2a20;--card:#f7f3eb;--danger:#c45c5c}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:#f5f0e6;min-height:100vh;overflow-x:hidden}
button{font-family:inherit;cursor:pointer}
input{font-family:inherit}
.page{display:none;min-height:100vh;flex-direction:column}
.page.on{display:flex}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.page.on>*{animation:fadeIn .35s ease}

/* SPLASH */
#splash{background:radial-gradient(ellipse at 50% 40%,#5c1a0a 0%,#2a0c06 45%,#0a0402 100%);align-items:center;justify-content:center;text-align:center;padding:2rem}
.splash-logo{width:72px;height:72px;border:2px solid var(--or);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.2rem;font-size:1.6rem;color:var(--or);box-shadow:0 0 40px rgba(201,162,39,.25)}
.splash-title{font-size:clamp(2rem,8vw,3.2rem);letter-spacing:.18em;font-weight:700;background:linear-gradient(180deg,#f5e6b8,#c9a227 50%,#8a6a12);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:.4rem}
.splash-sub{font-size:.75rem;letter-spacing:.35em;color:var(--or2);opacity:.7;margin-bottom:2rem}
.splash-line{width:120px;height:1px;background:linear-gradient(90deg,transparent,var(--or),transparent);margin:0 auto 2rem}
.btn-gold{background:linear-gradient(180deg,#e0c15a,#a07818);color:#1a1205;border:none;border-radius:8px;padding:.9rem 1.6rem;font-weight:700;font-size:.95rem;letter-spacing:.06em;width:100%;max-width:280px;box-shadow:0 4px 20px rgba(201,162,39,.3)}
.btn-gold:active{transform:scale(.98)}
.splash-note{margin-top:1.5rem;font-size:.7rem;opacity:.4;letter-spacing:.1em}

/* LOGIN */
#login{background:radial-gradient(ellipse at 50% 0%,#3a1508,#0a0604 60%);align-items:center;justify-content:center;padding:1.5rem}
.login-box{width:min(340px,100%);background:rgba(20,12,8,.85);border:1px solid rgba(201,162,39,.25);border-radius:16px;padding:1.8rem 1.4rem;backdrop-filter:blur(12px)}
.login-box h1{font-size:1.1rem;letter-spacing:.2em;color:var(--or);text-align:center;margin-bottom:.3rem}
.login-box p{text-align:center;font-size:.7rem;opacity:.5;margin-bottom:1.4rem;letter-spacing:.08em}
.login-box label{display:block;font-size:.65rem;letter-spacing:.12em;opacity:.55;margin:0 0 .3rem}
.login-box input{width:100%;padding:.75rem .9rem;margin-bottom:.8rem;background:rgba(0,0,0,.45);border:1px solid rgba(201,162,39,.3);border-radius:8px;color:#fff;font-size:1rem;text-align:center}
.err{color:#f87171;font-size:.8rem;text-align:center;min-height:1.2em;margin-top:.5rem}

/* TOPBAR */
.topbar{display:flex;align-items:center;justify-content:space-between;padding:.7rem 1rem;background:rgba(0,0,0,.55);border-bottom:1px solid rgba(201,162,39,.2);position:sticky;top:0;z-index:20}
.topbar .brand{font-size:.75rem;letter-spacing:.2em;color:var(--or);font-weight:600}
.topbar .info{display:flex;align-items:center;gap:.6rem;font-size:.85rem}
.solde{color:var(--or2);font-weight:600}
.icon-btn{width:36px;height:36px;border-radius:50%;border:1px solid rgba(201,162,39,.35);background:rgba(0,0,0,.35);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.9rem}

/* LOBBY */
#lobby{background:radial-gradient(ellipse at 50% 0%,#1a1008,#0a0604)}
.lobby-hero{margin:.8rem 1rem 0;border-radius:16px;overflow:hidden;background:radial-gradient(circle at 50% 0%,#9a2030,#2a0810 62%,#100406);border:1px solid rgba(201,162,39,.35);padding:1.5rem 1rem 1.2rem;text-align:center}
.lobby-hero h1{font-size:1.6rem;letter-spacing:.04em;font-weight:800;line-height:1.05;color:#fff}
.lobby-hero h1 span{display:block;font-style:italic;color:#f0c14a;font-size:1.05rem;letter-spacing:.22em;margin-top:.12rem}
.lobby-hero p{margin-top:.4rem;font-size:.68rem;opacity:.65;letter-spacing:.14em}
.lobby-wrap{flex:1;padding:1.2rem;max-width:560px;margin:0 auto;width:100%}
.lobby-wrap h2{font-size:.7rem;letter-spacing:.2em;opacity:.5;margin-bottom:1rem;text-transform:uppercase}
.table-card{background:linear-gradient(145deg,rgba(30,20,12,.9),rgba(15,10,6,.95));border:1px solid rgba(201,162,39,.22);border-radius:14px;padding:1.1rem 1.2rem;margin-bottom:.8rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;transition:border-color .2s,transform .15s}
.table-card:active{transform:scale(.98)}
.table-card h3{font-size:1.05rem;color:var(--or2);letter-spacing:.06em}
.table-card .meta{font-size:.75rem;opacity:.55;margin-top:.25rem}
.seats-dots{display:flex;gap:4px;margin-top:.5rem}
.seats-dots span{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.15)}
.seats-dots span.on{background:var(--or)}
.btn-sm{background:rgba(201,162,39,.15);border:1px solid rgba(201,162,39,.4);color:var(--or2);border-radius:8px;padding:.55rem .9rem;font-size:.8rem;font-weight:600;white-space:nowrap}

/* TABLE */
#table-page{background:#3a2416;height:100dvh;max-height:100dvh;overflow:hidden;padding:6px}
.felt{flex:1;background:
radial-gradient(ellipse 80% 60% at 50% 40%,#1a5c40 0%,#0e3a2a 55%,#0a2a1e 100%);
padding:.5rem .4rem .3rem;display:flex;flex-direction:column;align-items:center;min-height:0;overflow:hidden;border-radius:8px 8px 0 0;box-shadow:inset 0 0 80px rgba(0,0,0,.35)}
.felt-top{width:100%;display:flex;justify-content:space-between;align-items:flex-start;padding:0 .2rem}
.mini-box{text-align:center;opacity:.7}
.mini-bar{width:36px;height:10px;background:#4a2a1a;border-radius:2px;margin:0 auto .15rem}
.mini-bar.sab{background:#6b5a2a}
.mini-box span{font-size:.48rem;letter-spacing:.12em}
.arc{text-align:center;color:#c9b87a;opacity:.55;font-size:.62rem;letter-spacing:.08em;margin:.35rem 0;line-height:1.35}
.oval{width:118px;height:52px;border:2px solid rgba(201,176,90,.45);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:.2rem auto}
.oval.ready{box-shadow:0 0 12px rgba(240,193,74,.35)}
#ovalChip{font-size:.7rem;font-weight:800;color:#f5e6b8}
.vous-lab{font-size:.58rem;letter-spacing:.2em;opacity:.5;margin-top:.15rem}
.felt-play{width:100%;margin-top:auto;padding-top:.3rem}
.rail{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(#5a3a22,#2a1810);padding:.35rem .7rem calc(.35rem + env(safe-area-inset-bottom));border-top:2px solid #c9a22755;flex-shrink:0}
.rail-cell{text-align:center}
.rail .rk{font-size:.55rem;letter-spacing:.16em;opacity:.65}
.rail .rv{font-size:1.05rem;font-weight:700;color:#f0e0a8}
.dealer-zone{text-align:center;width:100%}
.lib{font-size:.58rem;letter-spacing:.2em;opacity:.5;text-transform:uppercase;margin-bottom:.35rem;color:#c8e6d5}
.cartes{display:flex;gap:.25rem;justify-content:center;flex-wrap:wrap;min-height:52px}
.carte{width:44px;height:62px;border-radius:5px;background:linear-gradient(180deg,#fff,#f3efe6);color:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:.95rem;box-shadow:0 3px 8px rgba(0,0,0,.35);animation:deal .28s ease;border:1px solid #ddd}
.carte.r{color:#c41e3a}
.carte.x{background:repeating-linear-gradient(45deg,#8b1e2d 0 6px,#6e1522 6px 12px);color:transparent;border:2px solid #fff}
@keyframes deal{from{opacity:0;transform:translateY(-14px) scale(.88)}to{opacity:1;transform:none}}
.tot{display:inline-block;background:rgba(0,0,0,.45);color:#fff;font-size:.85rem;margin-top:.35rem;min-height:1.2em;padding:.15rem .55rem;border-radius:12px;font-weight:600}
.msg-center{color:#e8f5e9;text-align:center;padding:.15rem .4rem;font-size:.78rem;min-height:1.3em;letter-spacing:.03em;text-shadow:0 1px 4px rgba(0,0,0,.5)}
.my-hand{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70px;width:100%;padding:.1rem 0}
.my-hand .cartes{gap:.3rem;min-height:68px}
.my-hand .carte{width:56px;height:80px;font-size:1.1rem;border-radius:7px}
.my-hand .tot{margin-top:.2rem;font-size:.85rem}
.bet-spot{width:52px;height:52px;border-radius:50%;border:3px dashed rgba(255,215,120,.55);display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:800;letter-spacing:.06em;color:#f5e6b8;margin:.15rem auto .1rem;background:rgba(0,0,0,.18);box-shadow:inset 0 0 16px rgba(0,0,0,.25);flex-shrink:0}
.bet-spot.ready{border-style:solid;border-color:#f0c14a;background:rgba(240,193,74,.15);animation:pulse .9s infinite}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
.seats-row{display:flex;justify-content:center;gap:.35rem;width:100%;flex-wrap:nowrap;padding:0 .15rem;overflow-x:auto}
.seat{flex:0 0 54px;width:54px;height:54px;background:radial-gradient(circle at 50% 40%,#0d4a28,#062016);border:2.5px solid #1cff7a;border-radius:50%;padding:.2rem;text-align:center;font-size:.5rem;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(28,255,122,.25),inset 0 0 8px rgba(0,0,0,.35)}
.seat.mine{border-color:#f0c14a;box-shadow:0 0 16px rgba(240,193,74,.45)}
.seat.empty{opacity:.9}
.seat .sn{font-weight:700;color:#f5e6b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.6rem}
.seat .sm{color:#fff;opacity:.85;margin:.12rem 0;font-size:.6rem}
.seat .sc{display:flex;gap:2px;justify-content:center;flex-wrap:wrap;min-height:30px}
.seat .sc .carte{width:24px;height:34px;font-size:.55rem;border-radius:3px}
.seat.turn{border-color:#7dffb3;box-shadow:0 0 16px rgba(125,255,179,.35)}
.controls{flex-shrink:0;padding:.4rem .5rem calc(.45rem + env(safe-area-inset-bottom));background:linear-gradient(180deg,#1a1510,#0d0b09);border-top:1px solid rgba(201,162,39,.25)}
.chips{display:flex;justify-content:center;gap:.4rem;margin-bottom:.35rem;flex-wrap:nowrap}
.chip{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.68rem;color:#fff;position:relative;box-shadow:0 3px 8px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.25);border:3px solid rgba(255,255,255,.35);cursor:pointer;user-select:none}
.chip::after{content:'';position:absolute;inset:5px;border-radius:50%;border:1.5px dashed rgba(255,255,255,.5);pointer-events:none}
.chip.d{opacity:.3;pointer-events:none;filter:grayscale(.4)}
.chip.sel{outline:3px solid #fff;transform:translateY(-4px)}
.c5{background:radial-gradient(circle at 35% 30%,#e85a5a,#9b1212)}.c10{background:radial-gradient(circle at 35% 30%,#5a9be8,#1a4a9b)}.c25{background:radial-gradient(circle at 35% 30%,#5ad88a,#0d6b3a)}.c50{background:radial-gradient(circle at 35% 30%,#f0c04a,#a07810)}.c100{background:radial-gradient(circle at 35% 30%,#2a2a2a,#0d0d0d);color:#f5e6b8;border-color:rgba(201,162,39,.55)}
.acts{display:flex;justify-content:center;gap:.45rem;flex-wrap:wrap}
.acts button{min-width:72px;padding:.6rem .85rem;border-radius:8px;border:1px solid rgba(201,162,39,.35);background:rgba(201,162,39,.12);color:#f5f0e6;font-size:.8rem}
.acts button.p{background:linear-gradient(180deg,#e0c15a,#a07818);color:#1a1205;border:none;font-weight:700}
.mise-display{text-align:center;color:var(--or);font-size:.8rem;font-weight:700;margin-bottom:.25rem;letter-spacing:.02em}
.win-banner{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:50;background:rgba(0,0,0,.82);border:2px solid var(--or);border-radius:14px;padding:1rem 1.6rem;text-align:center;pointer-events:none;animation:fadeIn .3s ease;box-shadow:0 8px 40px rgba(201,162,39,.35)}
.win-banner .wb-t{font-size:.75rem;letter-spacing:.25em;color:var(--or2);margin-bottom:.25rem}
.win-banner .wb-a{font-size:1.8rem;font-weight:800;color:#fff;text-shadow:0 0 20px rgba(201,162,39,.5)}
.win-banner.lose{border-color:#888}
.win-banner.lose .wb-t{color:#bbb}


.age-page{background:#0d3b2a;background-image:radial-gradient(#0a2a1e 1px,transparent 1px);background-size:18px 18px;align-items:center;justify-content:center;padding:1.2rem}
.age-card{width:min(360px,100%);background:linear-gradient(180deg,#1c6b45,#124f34);border:2px solid #c9a227;border-radius:16px;padding:1.3rem 1.1rem;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.45)}
.age-title{font-size:1.5rem;font-weight:800;color:#f0c14a;letter-spacing:.06em;margin-bottom:.5rem}
.age-card p{font-size:.82rem;margin-bottom:.8rem}
.age-row{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(180deg,#e0c15a,#a07818);border-radius:10px;padding:.35rem .5rem;margin-bottom:.7rem}
.age-row button{width:44px;height:44px;border:none;background:transparent;color:#1a1205;font-size:1.8rem;font-weight:700}
#ageVal{font-size:2rem;font-weight:800;color:#1a1205}
#ageRange{width:100%;accent-color:#f0c14a}
.age-scale{display:flex;justify-content:space-between;font-size:.7rem;opacity:.7;margin:.2rem 0 .7rem}
.age-legal{font-size:.68rem;opacity:.8}
.welcome-page{background:#05070c}
.welcome-sky{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem 1rem;background:radial-gradient(ellipse at 50% 20%,#2a3a6a 0%,#0a1020 55%,#05070c 100%)}
.welcome-kicker{letter-spacing:.22em;font-size:.72rem;color:#f0c14a;margin-bottom:1rem}
.vegas-badge{width:210px;height:210px;border-radius:50%;border:10px solid #c41e3a;background:radial-gradient(circle,#fff 0 42%,#111 42% 48%,#fff 48%);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#c41e3a;font-weight:800;font-size:1.15rem;letter-spacing:.12em;text-align:center;margin-bottom:1.2rem;box-shadow:0 0 30px rgba(196,30,58,.35)}
.vegas-badge small{color:#1a3a8a;font-size:.62rem;letter-spacing:.16em}
.welcome-box{background:rgba(0,0,0,.55);border-radius:10px;padding:.8rem 1.2rem;text-align:center;margin-bottom:1.2rem;font-size:.88rem;line-height:1.55}
.btn-play{background:linear-gradient(180deg,#ffb347,#e67a00);color:#1a1205;border:none;border-radius:12px;padding:.85rem 2.4rem;font-weight:800;font-size:1.05rem;letter-spacing:.06em}

/* PROFIL / REGIE */
.panel{flex:1;padding:1.2rem;max-width:480px;margin:0 auto;width:100%}
.panel h2{color:var(--or);font-size:1.1rem;letter-spacing:.1em;margin-bottom:1rem}
.panel h3{font-size:.7rem;letter-spacing:.15em;opacity:.5;text-transform:uppercase;margin:1.2rem 0 .5rem}
.panel input{width:100%;padding:.7rem;margin-bottom:.5rem;background:rgba(0,0,0,.4);border:1px solid rgba(201,162,39,.25);border-radius:8px;color:#fff}
.modes{display:grid;grid-template-columns:1fr 1fr;gap:.4rem}
.modes button{padding:.6rem;border-radius:8px;border:1px solid rgba(201,162,39,.3);background:transparent;color:#f5f0e6;font-size:.8rem}
.modes button.on{background:rgba(201,162,39,.22);border-color:var(--or);color:var(--or)}
.cl{display:flex;align-items:center;gap:.4rem;padding:.5rem;background:rgba(0,0,0,.3);border-radius:8px;margin:.35rem 0;font-size:.85rem;flex-wrap:wrap}
.cl input{width:64px;padding:.3rem;margin:0}
.cl button{padding:.3rem .5rem;background:var(--or);color:#1a1205;border:none;border-radius:5px;font-weight:600;font-size:.75rem}
.okmsg{color:#86efac;font-size:.8rem;margin-top:.4rem}
</style>
</head>
<body>

<div id="splash" class="page on">
  <div>
    <div class="splash-logo">21</div>
    <div class="splash-title">BLACKJACK<br>ÉVOLUTION</div>
    <div class="splash-sub">TABLES PRIVÉES · JETONS FICTIFS</div>
    <div class="splash-line"></div>
    <button class="btn-gold" id="btnEnterSplash">ENTRER</button>
    <p class="splash-note">ACCÈS SUR INVITATION</p>
  </div>
</div>

<div id="age" class="page age-page">
  <div class="age-card">
    <div class="age-title">BLACKJACK!</div>
    <p>Veuillez indiquer votre âge. Le gameplay ne sera pas affecté.</p>
    <div class="age-row">
      <button type="button" id="ageMoins">−</button>
      <div id="ageVal">18</div>
      <button type="button" id="agePlus">+</button>
    </div>
    <input id="ageRange" type="range" min="0" max="99" value="18">
    <div class="age-scale"><span>0</span><span>99+</span></div>
    <p class="age-legal">En appuyant sur Confirmer, vous acceptez les conditions d'accès.</p>
    <button class="btn-gold" id="btnAgeOk">Confirmer</button>
    <p class="err" id="ageErr"></p>
  </div>
</div>

<div id="welcome" class="page welcome-page">
  <div class="welcome-sky">
    <p class="welcome-kicker">BLACKJACK ÉVOLUTION</p>
    <div class="vegas-badge">WELCOME<br><small>TABLES PRIVÉES</small></div>
    <div class="welcome-box">
      <div>Tapis minimum €10</div>
      <div>Mise minimum €10</div>
      <div>Mise maximum €100</div>
      <div>Tables : 3 · 5 places</div>
    </div>
    <button class="btn-play" id="btnWelcomePlay">Jouer</button>
  </div>
</div>

<div id="login" class="page">
  <div class="login-box">
    <h1>ACCÈS MEMBRE</h1>
    <p>Pseudo et code fournis par l'hôte</p>
    <label>PSEUDO</label>
    <input id="inPseudo" autocomplete="username" placeholder="Votre pseudo">
    <label>CODE</label>
    <input id="inCode" type="password" autocomplete="current-password" placeholder="Code d'accès">
    <button class="btn-gold" id="btnLogin" style="margin-top:.5rem">Entrer dans le salon</button>
    <p class="err" id="loginErr"></p>
  </div>
</div>

<div id="lobby" class="page">
  <div class="topbar">
    <div class="brand">BLACKJACK ÉVOLUTION</div>
    <div class="info">
      <span id="lobbyPseudo">—</span>
      <span class="solde" id="lobbySolde">0</span>
      <button class="icon-btn" id="btnProfil" title="Profil">👤</button>
      <button class="icon-btn" id="btnRegie" style="display:none" title="Régie">⚙</button>
      <button class="icon-btn" id="btnLogout">✕</button>
    </div>
  </div>
  <div class="lobby-hero">
    <h1>BLACKJACK<br>LOBBY <span>Live</span></h1>
    <p>TABLES PRIVÉES · JETONS FICTIFS</p>
  </div>
  <div class="lobby-wrap">
    <h2>Choisir une table</h2>
    <div id="tableList"></div>
  </div>
</div>

<div id="table-page" class="page">
  <div class="felt">
    <div class="felt-top">
      <div class="mini-box"><div class="mini-bar"></div><span>TALON</span></div>
      <div class="lib">CROUPIER</div>
      <div class="mini-box"><div class="mini-bar sab"></div><span>SABOT</span></div>
    </div>
    <div class="cartes" id="dealerCards"></div>
    <div class="tot" id="dealerTot"></div>
    <div class="arc">LE BLACKJACK PAIE 3 POUR 2<br><small>LA BANQUE TIRE À 16 · RESTE À 17</small></div>
    <div class="oval" id="betSpot"><span id="ovalChip"></span></div>
    <div class="msg-center" id="tableMsg">Les jeux sont faits</div>
    <div class="my-hand" id="myHand"></div>
    <div class="vous-lab">VOUS</div>
    <div class="seats-row" id="seatsRow" style="display:none"></div>
    <div class="felt-play">
      <div class="mise-display" id="miseDisp">Choisis un jeton</div>
      <div class="chips" id="chips"></div>
      <div class="acts" id="acts"></div>
    </div>
  </div>
  <div class="rail">
    <div class="rail-cell"><div class="rk">SOLDE</div><div class="rv" id="tableSolde">0</div></div>
    <div class="rail-cell"><div class="rk">MISE</div><div class="rv" id="miseRail">0</div></div>
    <button class="icon-btn" id="btnBackLobby">⚙</button>
  </div>
  <div class="controls" style="display:none"></div>
</div>

<div id="profil" class="page">
  <div class="topbar">
    <button class="icon-btn" id="btnBackProfil">←</button>
    <div class="brand">PROFIL</div>
    <div></div>
  </div>
  <div class="panel">
    <h2>Mon compte</h2>
    <label style="font-size:.65rem;opacity:.5;letter-spacing:.1em">CODE ACTUEL (obligatoire)</label>
    <input id="profCodeActuel" type="password" placeholder="Code actuel">
    <label style="font-size:.65rem;opacity:.5;letter-spacing:.1em">NOUVEAU PSEUDO</label>
    <input id="profPseudo" placeholder="Nouveau pseudo">
    <label style="font-size:.65rem;opacity:.5;letter-spacing:.1em">NOUVEAU CODE</label>
    <input id="profCode" type="password" placeholder="Nouveau code (optionnel)">
    <button class="btn-gold" id="btnSaveProfil" style="margin-top:.8rem">Enregistrer</button>
    <p class="okmsg" id="profMsg"></p>
  </div>
</div>

<div id="regie" class="page">
  <div class="topbar">
    <button class="icon-btn" id="btnBackRegie">←</button>
    <div class="brand">RÉGIE</div>
    <div></div>
  </div>
  <div class="panel">
    <h2>Contrôle salon</h2>
    <h3>Mode (invisible aux joueurs)</h3>
    <div class="modes" id="modes"></div>
    <p id="modeLabel" style="margin-top:.6rem;font-size:.85rem;opacity:.75">Mode : —</p>
    <h3>Créer un compte</h3>
    <input id="rcPseudo" placeholder="Pseudo">
    <input id="rcCode" placeholder="Code">
    <input id="rcSolde" type="number" value="2000" placeholder="Jetons">
    <button class="btn-gold" id="btnCreateCompte">Créer</button>
    <p class="okmsg" id="rcMsg"></p>
    <h3>Comptes</h3>
    <div id="rcList"></div>
    <h3>Historique récent</h3>
    <div id="rcHist" style="font-size:.8rem;max-height:160px;overflow-y:auto"></div>
  </div>
</div>

<script>
const API='';
let token=localStorage.getItem('sp.t')||null;
let moi=null;
let tableId=null;
let chipSel=0;
let poll=null;

const $=id=>document.getElementById(id);
function show(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  $(id).classList.add('on');
}
async function api(method,path,body){
  const o={method,headers:{'Content-Type':'application/json'}};
  if(token) o.headers.Authorization='Bearer '+token;
  if(body!==undefined) o.body=JSON.stringify(body);
  const r=await fetch(API+path,o);
  const d=await r.json().catch(()=>({}));
  if(r.status===401){ logout(false); throw new Error(d.erreur||'Session'); }
  if(!r.ok) throw new Error(d.erreur||'Erreur');
  return d;
}
function logout(callApi){
  if(callApi&&token) api('DELETE','/api/session').catch(()=>{});
  token=null; moi=null; localStorage.removeItem('sp.t');
  if(poll){clearInterval(poll);poll=null;}
  show('splash');
}
let audioCtx=null;
function ensureAudio(){if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended') audioCtx.resume();}
function playWinSound(){
  try{
    ensureAudio();
    const t=audioCtx.currentTime;
    [523,659,784].forEach((f,i)=>{
      const o=audioCtx.createOscillator();
      const g=audioCtx.createGain();
      o.type='sine'; o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,t+i*0.07);
      g.gain.exponentialRampToValueAtTime(0.09,t+i*0.07+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,t+i*0.07+0.25);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t+i*0.07); o.stop(t+i*0.07+0.28);
    });
  }catch(e){}
}
function playCardSound(){
  try{
    ensureAudio();
    const t=audioCtx.currentTime;
    const o=audioCtx.createOscillator();
    const g=audioCtx.createGain();
    o.type='triangle';
    o.frequency.setValueAtTime(420,t);
    o.frequency.exponentialRampToValueAtTime(180,t+.06);
    g.gain.setValueAtTime(.08,t);
    g.gain.exponentialRampToValueAtTime(.001,t+.1);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t+.12);
    const o2=audioCtx.createOscillator();
    const g2=audioCtx.createGain();
    o2.type='square';
    o2.frequency.value=90;
    g2.gain.setValueAtTime(.04,t);
    g2.gain.exponentialRampToValueAtTime(.001,t+.08);
    o2.connect(g2); g2.connect(audioCtx.destination);
    o2.start(t); o2.stop(t+.09);
  }catch(e){}
}
function carteEl(c, small){
  const e=document.createElement('div');
  e.className='carte'+(c.cachee?' x':'')+((c.c==='♥'||c.c==='♦')&&!c.cachee?' r':'');
  if(c.cachee) e.textContent='?';
  else e.innerHTML='<span>'+c.v+'</span><span style="font-size:'+(small?'.5rem':'.95rem')+'">'+c.c+'</span>';
  return e;
}

$('btnEnterSplash').onclick=()=>show('age');
function setAge(n){n=Math.max(0,Math.min(99,+n||0)); $('ageVal').textContent=n; $('ageRange').value=n;}
$('ageMoins').onclick=()=>setAge(+$('ageVal').textContent-1);
$('agePlus').onclick=()=>setAge(+$('ageVal').textContent+1);
$('ageRange').oninput=()=>setAge($('ageRange').value);
$('btnAgeOk').onclick=()=>{
  $('ageErr').textContent='';
  if(+$('ageVal').textContent<18){ $('ageErr').textContent='18 ans minimum pour entrer.'; return; }
  show('welcome');
};
$('btnWelcomePlay').onclick=()=>show('login');

$('btnLogin').onclick=async()=>{
  $('loginErr').textContent='';
  try{
    const d=await api('POST','/api/session',{pseudo:$('inPseudo').value.trim(),code:$('inCode').value});
    token=d.jeton; localStorage.setItem('sp.t',token); moi=d.moi;
    await goLobby();
  }catch(e){$('loginErr').textContent=e.message||'Refusé';}
};
$('inCode').onkeydown=e=>{if(e.key==='Enter')$('btnLogin').click();};

async function goLobby(){
  if(poll){clearInterval(poll);poll=null;}
  const d=await api('GET','/api/lobby');
  moi=d.moi;
  $('lobbyPseudo').textContent=moi.pseudo;
  $('lobbySolde').textContent='€'+moi.solde.toLocaleString('fr-FR');
  $('btnRegie').style.display=moi.role==='admin'?'':'none';
  const list=$('tableList'); list.innerHTML='';
  d.tables.forEach(t=>{
    const card=document.createElement('div'); card.className='table-card';
    const dots=Array.from({length:5},(_,i)=>'<span class="'+(i<t.occupees?'on':'')+'"></span>').join('');
    card.innerHTML='<div><h3>'+t.nom+'</h3><div class="meta">Min €'+t.minMise+' · Max €100 · '+t.occupees+'/5</div><div class="seats-dots">'+dots+'</div></div><button class="btn-sm">Rejoindre</button>';
    card.querySelector('button').onclick=()=>joinTable(t.id);
    list.appendChild(card);
  });
  show('lobby');
  poll=setInterval(async()=>{try{const x=await api('GET','/api/lobby'); moi=x.moi; $('lobbySolde').textContent='€'+moi.solde.toLocaleString('fr-FR');}catch{}},2500);
}

async function joinTable(id){
  tableId=id; chipSel=0;
  if(poll) clearInterval(poll);
  try{await api('POST','/api/table/'+id+'/asseoir',{siege:0});}catch(e){}
  await refreshTable();
  show('table-page');
  poll=setInterval(refreshTable,900);
}
async function refreshTable(){
  if(!tableId) return;
  try{
    const d=await api('GET','/api/table/'+tableId);
    moi=d.moi; renderTable(d.table);
  }catch(e){console.warn(e);}
}
let lastCardSig='';
let lastRenderKey='';
function renderTable(t){
  const my=t.sieges.find(s=>s.estMoi);
  const key=JSON.stringify({p:t.phase,m:t.message,ts:t.tourSiege,c:t.croupier,s:t.sieges,solde:moi&&moi.solde,chip:chipSel});
  if(key===lastRenderKey) return;
  lastRenderKey=key;
  $('tableTitle').textContent=t.nom.toUpperCase();
  $('tableSolde').textContent='€'+moi.solde.toLocaleString('fr-FR');
  $('tableMsg').textContent=t.message||'';
  $('dealerCards').innerHTML='';
  (t.croupier||[]).forEach(c=>$('dealerCards').appendChild(carteEl(c)));
  $('dealerTot').textContent=t.totCroupier!=null?t.totCroupier:'';
  const mh=$('myHand'); mh.innerHTML='';
  if(my && my.main && my.main.length){
    const wrap=document.createElement('div'); wrap.className='cartes';
    my.main.forEach(c=>wrap.appendChild(carteEl(c)));
    mh.appendChild(wrap);
    if(my.tot!=null){const totEl=document.createElement('div'); totEl.className='tot'; totEl.textContent=my.tot; mh.appendChild(totEl);}
    if(my.main2 && my.main2.length){
      const wrap2=document.createElement('div'); wrap2.className='cartes'; wrap2.style.marginTop='8px';
      my.main2.forEach(c=>wrap2.appendChild(carteEl(c)));
      mh.appendChild(wrap2);
      if(my.tot2!=null){const totEl=document.createElement('div'); totEl.className='tot'; totEl.textContent='2 · '+my.tot2; mh.appendChild(totEl);}
    }
  }
  const sig=(t.croupier||[]).map(c=>c.v+c.c).join('')+'|'+(my&&my.main?my.main.map(c=>c.v+c.c).join(''):'');
  if(sig!==lastCardSig && sig.length>lastCardSig.length) playCardSound();
  lastCardSig=sig;
  const row=$('seatsRow'); row.innerHTML='';
  t.sieges.forEach(s=>{
    const el=document.createElement('div');
    el.className='seat'+(s.estMoi?' mine':'')+(s.pseudo?'':' empty')+(t.tourSiege===s.index?' turn':'');
    el.innerHTML='<div class="sn">'+(s.pseudo||"S'ASSEOIR")+'</div><div class="sm">'+(s.mise?'€'+s.mise:(s.pseudo?'ICI':'·'))+(s.tot!=null && !s.estMoi?' · '+s.tot:'')+'</div>';
    if(!s.pseudo && (t.phase==='attente'||t.phase==='mises'||t.phase==='fin')){
      el.style.cursor='pointer';
      el.onclick=async()=>{try{ensureAudio(); await api('POST','/api/table/'+tableId+'/asseoir',{siege:s.index}); refreshTable();}catch(e){alert(e.message);}};
    }
    row.appendChild(el);
  });
  const chips=$('chips'); chips.innerHTML='';
  const acts=$('acts'); acts.innerHTML='';
  $('miseDisp').textContent='';
  let banner=document.getElementById('winBanner');
  if(banner) banner.remove();
  if(my && t.phase==='fin' && my.resultat){
    banner=document.createElement('div');
    banner.id='winBanner';
    const win=my.resultat==='gagne'||my.resultat==='blackjack';
    const eq=my.resultat==='egalite';
    banner.className='win-banner'+(win||eq?'':' lose');
    const amt=my.gainAffiche||0;
    banner.innerHTML='<div class="wb-t">'+(win?'YOU WIN':eq?'PUSH':'YOU LOSE')+'</div><div class="wb-a">'+(win||eq?'€'+amt:'—')+'</div>';
    document.body.appendChild(banner);
    if(win) playWinSound();
    setTimeout(()=>{const b=document.getElementById('winBanner'); if(b) b.remove();},1100);
  }
  if($('miseRail')) $('miseRail').textContent=my&&my.mise?my.mise:'0';
  const spot=$('betSpot');
  if(spot){
    spot.className='oval'+(chipSel && my && (t.phase==='mises'||t.phase==='attente'||t.phase==='fin')?' ready':'');
    const oc=$('ovalChip');
    if(oc) oc.textContent=my && my.mise?my.mise:(chipSel?chipSel:'');
    spot.onclick=async()=>{
      if(!chipSel) return;
      if(!(t.phase==='mises'||t.phase==='attente'||t.phase==='fin')) return;
      try{
        if(!my) await api('POST','/api/table/'+tableId+'/asseoir',{siege:0});
        if(chipSel<t.minMise||chipSel>t.maxMise||chipSel>moi.solde) return alert('Mise impossible (solde €'+(moi.solde||0)+')');
        ensureAudio(); playCardSound();
        await api('POST','/api/table/'+tableId+'/miser',{montant:chipSel}); chipSel=0; refreshTable();
      }catch(e){alert(e.message);}
    };
  }
  if(t.phase==='mises'||t.phase==='attente'||t.phase==='fin'||!t.phase){
    $('miseDisp').textContent=chipSel?('Jeton €'+chipSel+' → tape le cercle'):'Choisis un jeton, puis tape le tapis';
    [10,25,50,100].forEach(v=>{
      const can=moi.solde>=v && v>=t.minMise && v<=t.maxMise;
      const b=document.createElement('div');
      b.className='chip c'+v+(can?'':' d')+(chipSel===v?' sel':'');
      b.textContent=v;
      if(can) b.onclick=()=>{chipSel=v; renderTable(t);};
      chips.appendChild(b);
    });
  }
  if(my && t.phase==='jeu' && t.tourSiege===my.index && my.statut==='en_jeu'){
    if(my.main2) $('tableMsg').textContent=(my.jeuMain===2?'Main 2':'Main 1')+' — Tirer ou Rester';
    const btns=[['Tirer','tirer'],['Doubler','doubler']];
    if(my.peutSeparer) btns.push(['Séparer','separer']);
    btns.push(['Rester','rester',1]);
    btns.forEach(([l,a,p])=>{
      const b=document.createElement('button'); b.textContent=l; if(p) b.className='p';
      b.onclick=async()=>{try{ensureAudio(); playCardSound(); await api('POST','/api/table/'+tableId+'/action',{action:a}); refreshTable();}catch(e){alert(e.message);}};
      acts.appendChild(b);
    });
  }
  if(t.phase==='fin'){
    const b=document.createElement('button'); b.textContent='Rejouer'; b.className='p';
    b.onclick=async()=>{try{await api('POST','/api/table/'+tableId+'/action',{action:'nouvelle'}); chipSel=0; refreshTable();}catch(e){alert(e.message);}};
    acts.appendChild(b);
  }
}

$('btnBackLobby').onclick=async()=>{
  if(tableId){try{await api('POST','/api/table/'+tableId+'/quitter',{});}catch{}}
  tableId=null; goLobby();
};
$('btnLogout').onclick=()=>logout(true);
$('btnProfil').onclick=()=>{ $('profMsg').textContent=''; $('profPseudo').value=moi.pseudo; show('profil'); };
$('btnBackProfil').onclick=()=>goLobby();
$('btnSaveProfil').onclick=async()=>{
  try{
    const d=await api('POST','/api/profil',{
      codeActuel:$('profCodeActuel').value,
      pseudo:$('profPseudo').value.trim()||undefined,
      code:$('profCode').value||undefined
    });
    moi=d.moi; $('profMsg').textContent='Enregistré'; $('profCodeActuel').value=''; $('profCode').value='';
  }catch(e){$('profMsg').textContent=e.message; $('profMsg').style.color='#fca5a5';}
};

const MODE_KEYS=['aleatoire','perte','grosse_perte','pipo','gain','gros_gain','bingo'];
const MODE_L={aleatoire:'Aléatoire',perte:'Perte (joueurs 65%)',grosse_perte:'Grosse perte (joueurs 75%)',pipo:'Pipo (joueurs 90%)',gain:'Gain (banque 65%)',gros_gain:'Gros gain (banque 75%)',bingo:'Bingo (banque 90%)'};
$('btnRegie').onclick=async()=>{ await loadRegie(); show('regie'); };
$('btnBackRegie').onclick=()=>goLobby();
async function loadRegie(){
  const d=await api('GET','/api/regie');
  const modes=$('modes'); modes.innerHTML='';
  MODE_KEYS.forEach(k=>{
    const b=document.createElement('button'); b.textContent=MODE_L[k];
    if(d.mode===k) b.className='on';
    b.onclick=async()=>{try{await api('POST','/api/regie/mode',{mode:k}); loadRegie();}catch(e){alert(e.message);}};
    modes.appendChild(b);
  });
  $('modeLabel').innerHTML='Mode : <b>'+(MODE_L[d.mode]||d.mode)+'</b>';
  const list=$('rcList'); list.innerHTML='';
  d.comptes.forEach(c=>{
    if(c.role==='admin') return;
    const el=document.createElement('div'); el.className='cl';
    el.innerHTML='<span style="flex:1">'+c.pseudo+' <small style="opacity:.5">('+c.code+')</small></span><span style="color:var(--or)">'+c.solde+'</span><input type="number" placeholder="+/-" data-id="'+c.id+'"><button data-a="mv" data-id="'+c.id+'">OK</button><button data-a="tg" data-id="'+c.id+'" data-on="'+c.actif+'">'+(c.actif?'Off':'On')+'</button>';
    list.appendChild(el);
  });
  const h=$('rcHist'); h.innerHTML='';
  (d.historique||[]).forEach(x=>{
    const el=document.createElement('div');
    el.style.cssText='display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid rgba(255,255,255,.06)';
    el.innerHTML='<span>'+x.pseudo+' · T'+x.table+' · '+x.resultat+'</span><span style="color:'+(x.gain>=0?'#86efac':'#fca5a5')+'">'+(x.gain>=0?'+':'')+x.gain+'</span>';
    h.appendChild(el);
  });
}
$('btnCreateCompte').onclick=async()=>{
  try{
    await api('POST','/api/regie/compte',{pseudo:$('rcPseudo').value.trim(),code:$('rcCode').value,solde:+$('rcSolde').value||2000});
    $('rcMsg').textContent='Compte créé'; $('rcPseudo').value=''; $('rcCode').value=''; loadRegie();
  }catch(e){$('rcMsg').textContent=e.message; $('rcMsg').style.color='#fca5a5';}
};
$('rcList').onclick=async e=>{
  const btn=e.target.closest('button'); if(!btn) return;
  const id=btn.dataset.id, a=btn.dataset.a;
  if(a==='mv'){
    const inp=btn.parentElement.querySelector('input');
    const m=+inp.value; if(!m) return;
    try{await api('POST','/api/regie/mouvement',{compteId:id,montant:m}); inp.value=''; loadRegie();}catch(err){alert(err.message);}
  }
  if(a==='tg'){
    try{await api('POST','/api/regie/compte/actif',{compteId:id,actif:btn.dataset.on!=='true'}); loadRegie();}catch(err){alert(err.message);}
  }
};

(async()=>{
  if(token){
    try{ const d=await api('GET','/api/moi'); moi=d.moi; await goLobby(); }
    catch{ logout(false); }
  }
})();
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
    if (u.pathname.startsWith('/api/')) {
      await handleApi(req, res, u.pathname);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
    }
  } catch (e) {
    console.error(e);
    send(res, 500, { erreur: 'Erreur serveur' });
  }
});

server.listen(PORT, () => {
  console.log('Blackjack Évolution → port ' + PORT);
  console.log('Admin: Patron / admin21');
});
