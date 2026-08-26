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
  gain: 'Gain',
  gros_gain: 'Gros gain',
  bingo: 'Bingo'
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
    minMise: 50,
    maxMise: 5000
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
  const wantPlayerWin = mode === 'perte' || mode === 'grosse_perte';
  const strength =
    mode === 'bingo' ? 1 :
    mode === 'gros_gain' || mode === 'grosse_perte' ? 0.85 :
    mode === 'gain' || mode === 'perte' ? 0.6 : 0.5;

  if (Math.random() > strength && mode !== 'bingo') return table.sabot.pop();

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
    if (phase === 'jeu' && i === 1 && !isAdmin) return { v: '?', c: '?', cachee: true };
    return c;
  });
  let totC = null;
  if (phase !== 'jeu' || isAdmin) totC = table.croupier.length ? tot(table.croupier) : null;
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
      statut: s.statut,
      resultat: s.resultat,
      message: s.message,
      estMoi: viewer ? s.joueurId === viewer.id : false
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
  table.phase = 'jeu';
  table.message = 'Rien ne va plus';
  table.croupier = [];
  for (const s of table.sieges) {
    if (s.joueurId && s.mise >= table.minMise) {
      s.main = [];
      s.statut = 'en_jeu';
      s.resultat = null;
      s.message = '';
    } else if (s.joueurId) {
      s.statut = 'spectateur';
    }
  }
  for (let r = 0; r < 2; r++) {
    for (const s of table.sieges) {
      if (s.statut === 'en_jeu') s.main.push(tirer(table, false, { totJoueur: tot(s.main) }));
    }
    table.croupier.push(tirer(table, true, {}));
  }
  for (const s of table.sieges) {
    if (s.statut === 'en_jeu' && isBJ(s.main)) {
      s.statut = 'blackjack';
      s.message = 'Blackjack';
    }
  }
  const next = table.sieges.findIndex(s => s.statut === 'en_jeu');
  if (next < 0) {
    finirCroupierEtRegler(table);
  } else {
    table.tourSiege = next;
    table.message = 'Tour de ' + (table.sieges[next].pseudo || 'joueur');
  }
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
  }
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
          s.mise = 0;
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
    }, 2500);
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
          s.mise = 0;
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

    if (action === 'tirer') {
      seat.main.push(tirer(table, false, { totJoueur: tot(seat.main) }));
      if (tot(seat.main) > 21) {
        seat.statut = 'creve';
        seat.message = 'Perdu';
        nextPlayerOrDealer(table);
      }
    } else if (action === 'rester') {
      seat.statut = 'reste';
      nextPlayerOrDealer(table);
    } else if (action === 'doubler') {
      if (seat.main.length !== 2) return send(res, 400, { erreur: 'Double sur 2 cartes' });
      if (moi.solde < seat.mise) return send(res, 400, { erreur: 'Solde insuffisant' });
      moi.solde -= seat.mise;
      seat.mise *= 2;
      seat.main.push(tirer(table, false, { totJoueur: tot(seat.main) }));
      seat.statut = tot(seat.main) > 21 ? 'creve' : 'reste';
      if (seat.statut === 'creve') seat.message = 'Perdu';
      nextPlayerOrDealer(table);
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
<title>Salon Privé · Blackjack</title>
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
#table-page{background:#061a14}
.felt{flex:1;background:radial-gradient(ellipse at 50% 30%,#124536 0%,#0a2f24 50%,#061c16 100%);padding:1rem .6rem 1.2rem;display:flex;flex-direction:column;align-items:center;justify-content:space-between;min-height:0}
.dealer-zone{text-align:center;width:100%}
.lib{font-size:.6rem;letter-spacing:.18em;opacity:.45;text-transform:uppercase;margin-bottom:.35rem}
.cartes{display:flex;gap:.28rem;justify-content:center;flex-wrap:wrap;min-height:64px}
.carte{width:46px;height:66px;border-radius:5px;background:var(--card);color:#1a1a1a;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:700;font-size:.95rem;box-shadow:0 3px 8px rgba(0,0,0,.35);animation:deal .25s ease}
.carte.r{color:#b91c1c}
.carte.x{background:linear-gradient(145deg,#1e3a5f,#152a45);color:transparent;border:1px solid rgba(201,162,39,.35)}
@keyframes deal{from{opacity:0;transform:translateY(-12px) scale(.9)}to{opacity:1;transform:none}}
.tot{color:var(--or2);font-size:.95rem;margin-top:.25rem;min-height:1.2em}
.msg-center{color:var(--or2);text-align:center;padding:.5rem;font-size:.9rem;min-height:2.2em;letter-spacing:.04em}
.seats-row{display:flex;justify-content:center;gap:.4rem;width:100%;flex-wrap:wrap;padding:0 .2rem}
.seat{width:calc(20% - .4rem);min-width:62px;max-width:90px;background:rgba(0,0,0,.28);border:1px solid rgba(201,162,39,.15);border-radius:10px;padding:.4rem .25rem;text-align:center;font-size:.65rem}
.seat.mine{border-color:var(--or);box-shadow:0 0 12px rgba(201,162,39,.2)}
.seat.empty{opacity:.45}
.seat .sn{font-weight:600;color:var(--or2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.seat .sm{color:#fff;opacity:.7;margin:.15rem 0}
.seat .sc{display:flex;gap:2px;justify-content:center;flex-wrap:wrap;min-height:28px}
.seat .sc .carte{width:22px;height:32px;font-size:.55rem;border-radius:3px}
.seat.turn{outline:2px solid var(--or)}
.controls{padding:.7rem;background:rgba(0,0,0,.5);border-top:1px solid rgba(201,162,39,.15)}
.chips{display:flex;justify-content:center;gap:.45rem;margin-bottom:.6rem;flex-wrap:wrap}
.chip{width:42px;height:42px;border-radius:50%;border:2px dashed rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.7rem;color:#fff}
.chip.d{opacity:.3;pointer-events:none}
.c5{background:#b4172c}.c25{background:#12784a}.c100{background:#1b4a8a}.c500{background:#1a1a1a;color:var(--or)}
.acts{display:flex;justify-content:center;gap:.45rem;flex-wrap:wrap}
.acts button{min-width:72px;padding:.6rem .85rem;border-radius:8px;border:1px solid rgba(201,162,39,.35);background:rgba(201,162,39,.12);color:#f5f0e6;font-size:.8rem}
.acts button.p{background:linear-gradient(180deg,#e0c15a,#a07818);color:#1a1205;border:none;font-weight:700}
.mise-display{text-align:center;color:var(--or);font-size:1.1rem;font-weight:600;margin-bottom:.4rem}

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
    <div class="splash-title">SALON PRIVÉ</div>
    <div class="splash-sub">BLACKJACK</div>
    <div class="splash-line"></div>
    <button class="btn-gold" id="btnEnterSplash">ENTRER</button>
    <p class="splash-note">ACCÈS SUR INVITATION · JETONS FICTIFS</p>
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
    <div class="brand">SALON PRIVÉ</div>
    <div class="info">
      <span id="lobbyPseudo">—</span>
      <span class="solde" id="lobbySolde">0</span>
      <button class="icon-btn" id="btnProfil" title="Profil">👤</button>
      <button class="icon-btn" id="btnRegie" style="display:none" title="Régie">⚙</button>
      <button class="icon-btn" id="btnLogout">✕</button>
    </div>
  </div>
  <div class="lobby-wrap">
    <h2>Choisir une table</h2>
    <div id="tableList"></div>
  </div>
</div>

<div id="table-page" class="page">
  <div class="topbar">
    <button class="icon-btn" id="btnBackLobby">←</button>
    <div class="brand" id="tableTitle">TABLE</div>
    <div class="info">
      <span class="solde" id="tableSolde">0</span>
    </div>
  </div>
  <div class="felt">
    <div class="dealer-zone">
      <div class="lib">Croupier</div>
      <div class="cartes" id="dealerCards"></div>
      <div class="tot" id="dealerTot"></div>
    </div>
    <div class="msg-center" id="tableMsg">Prenez place</div>
    <div class="seats-row" id="seatsRow"></div>
  </div>
  <div class="controls">
    <div class="mise-display" id="miseDisp"></div>
    <div class="chips" id="chips"></div>
    <div class="acts" id="acts"></div>
  </div>
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
let miseLocale=0;
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
function carteEl(c, small){
  const e=document.createElement('div');
  e.className='carte'+(c.cachee?' x':'')+((c.c==='♥'||c.c==='♦')&&!c.cachee?' r':'');
  if(c.cachee) e.textContent='?';
  else e.innerHTML='<span>'+c.v+'</span><span style="font-size:'+(small?'.5rem':'.85rem')+'">'+c.c+'</span>';
  return e;
}

$('btnEnterSplash').onclick=()=>show('login');
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
  $('lobbySolde').textContent=moi.solde.toLocaleString('fr-FR');
  $('btnRegie').style.display=moi.role==='admin'?'':'none';
  const list=$('tableList'); list.innerHTML='';
  d.tables.forEach(t=>{
    const card=document.createElement('div'); card.className='table-card';
    const dots=Array.from({length:5},(_,i)=>'<span class="'+(i<t.occupees?'on':'')+'"></span>').join('');
    card.innerHTML='<div><h3>'+t.nom+'</h3><div class="meta">Entrée '+t.minMise+' · '+t.occupees+'/5 · '+t.phase+'</div><div class="seats-dots">'+dots+'</div></div><button class="btn-sm">Rejoindre</button>';
    card.querySelector('button').onclick=()=>joinTable(t.id);
    list.appendChild(card);
  });
  show('lobby');
  poll=setInterval(async()=>{try{const x=await api('GET','/api/lobby'); moi=x.moi; $('lobbySolde').textContent=moi.solde.toLocaleString('fr-FR');}catch{}},4000);
}

async function joinTable(id){
  tableId=id; miseLocale=0;
  if(poll) clearInterval(poll);
  await refreshTable();
  show('table-page');
  poll=setInterval(refreshTable,1800);
}
async function refreshTable(){
  if(!tableId) return;
  try{
    const d=await api('GET','/api/table/'+tableId);
    moi=d.moi; renderTable(d.table);
  }catch(e){console.warn(e);}
}
function renderTable(t){
  $('tableTitle').textContent=t.nom.toUpperCase();
  $('tableSolde').textContent=moi.solde.toLocaleString('fr-FR');
  $('tableMsg').textContent=t.message||'';
  $('dealerCards').innerHTML='';
  (t.croupier||[]).forEach(c=>$('dealerCards').appendChild(carteEl(c)));
  $('dealerTot').textContent=t.totCroupier!=null?t.totCroupier:'';
  const row=$('seatsRow'); row.innerHTML='';
  t.sieges.forEach(s=>{
    const el=document.createElement('div');
    el.className='seat'+(s.estMoi?' mine':'')+(s.pseudo?'':' empty')+(t.tourSiege===s.index?' turn':'');
    let cards='';
    (s.main||[]).forEach(c=>{const x=carteEl(c,true); cards+=x.outerHTML;});
    el.innerHTML='<div class="sn">'+(s.pseudo||'Libre')+'</div><div class="sm">'+(s.mise?s.mise:'—')+(s.tot!=null?' · '+s.tot:'')+'</div><div class="sc">'+cards+'</div>';
    if(!s.pseudo && (t.phase==='attente'||t.phase==='mises'||t.phase==='fin')){
      el.style.cursor='pointer';
      el.onclick=async()=>{try{await api('POST','/api/table/'+tableId+'/asseoir',{siege:s.index}); refreshTable();}catch(e){alert(e.message);}};
    }
    row.appendChild(el);
  });
  const my=t.sieges.find(s=>s.estMoi);
  const chips=$('chips'); chips.innerHTML='';
  const acts=$('acts'); acts.innerHTML='';
  $('miseDisp').textContent='';
  if(my && (t.phase==='mises'||t.phase==='attente'||t.phase==='fin')){
    $('miseDisp').textContent=miseLocale?('Mise : '+miseLocale):'Choisissez votre mise (min '+t.minMise+')';
    [5,25,100,500].forEach(v=>{
      const b=document.createElement('div');
      b.className='chip c'+v+(moi.solde>=miseLocale+v?'':' d');
      b.textContent=v;
      if(moi.solde>=miseLocale+v) b.onclick=()=>{miseLocale+=v; renderTable(t);};
      chips.appendChild(b);
    });
    const clr=document.createElement('button'); clr.textContent='Effacer';
    clr.onclick=()=>{miseLocale=0; renderTable(t);}; acts.appendChild(clr);
    const go=document.createElement('button'); go.textContent='Miser'; go.className='p';
    go.disabled=miseLocale<t.minMise;
    go.onclick=async()=>{try{await api('POST','/api/table/'+tableId+'/miser',{montant:miseLocale}); miseLocale=0; refreshTable();}catch(e){alert(e.message);}};
    acts.appendChild(go);
  }
  if(my && t.phase==='jeu' && t.tourSiege===my.index && my.statut==='en_jeu'){
    [['Tirer','tirer'],['Rester','rester',1],['Doubler','doubler']].forEach(([l,a,p])=>{
      const b=document.createElement('button'); b.textContent=l; if(p) b.className='p';
      b.onclick=async()=>{try{await api('POST','/api/table/'+tableId+'/action',{action:a}); refreshTable();}catch(e){alert(e.message);}};
      acts.appendChild(b);
    });
  }
  if(t.phase==='fin'){
    const b=document.createElement('button'); b.textContent='Nouvelle main'; b.className='p';
    b.onclick=async()=>{try{await api('POST','/api/table/'+tableId+'/action',{action:'nouvelle'}); miseLocale=0; refreshTable();}catch(e){alert(e.message);}};
    acts.appendChild(b);
  }
  if(moi.role==='admin' && (t.phase==='mises'||t.phase==='attente')){
    const b=document.createElement('button'); b.textContent='Démarrer';
    b.onclick=async()=>{try{await api('POST','/api/table/'+tableId+'/action',{action:'demarrer'}); refreshTable();}catch(e){alert(e.message);}};
    acts.appendChild(b);
  }
  if(my){
    const q=document.createElement('button'); q.textContent='Quitter';
    q.onclick=async()=>{try{await api('POST','/api/table/'+tableId+'/quitter',{}); tableId=null; goLobby();}catch(e){alert(e.message);}};
    acts.appendChild(q);
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

const MODE_KEYS=['aleatoire','perte','grosse_perte','gain','gros_gain','bingo'];
const MODE_L={aleatoire:'Aléatoire',perte:'Perte',grosse_perte:'Grosse perte',gain:'Gain',gros_gain:'Gros gain',bingo:'Bingo'};
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
  console.log('Salon Privé v2 → port ' + PORT);
  console.log('Admin: Patron / admin21');
});
