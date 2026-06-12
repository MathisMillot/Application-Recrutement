jest.setTimeout(15000);

const request = require('supertest');
const app = require('../app');
const DB = require('../model/db');
const utilisateur = require('../model/utilisateur');

const TS = Date.now();
const CAND_EMAIL = `sec_cand_${TS}@jest.local`;
const REC_EMAIL  = `sec_rec_${TS}@jest.local`;
const ADM_EMAIL  = `sec_adm_${TS}@jest.local`;
const TEST_MDP   = 'TestMdp12345!';

let candidatId  = null;
let recruteurId = null;
let adminId     = null;

async function cleanupUser(id) {
  if (!id) return;
  await DB.query('DELETE FROM Candidature WHERE id_candidat  = ?', [id]);
  await DB.query('DELETE FROM Appartient  WHERE id_recruteur = ?', [id]);
  await DB.query('DELETE FROM Admin       WHERE id_user      = ?', [id]);
  await DB.query('DELETE FROM Recruteur   WHERE id_user      = ?', [id]);
  await DB.query('DELETE FROM Candidat    WHERE id_user      = ?', [id]);
  await DB.query('DELETE FROM Utilisateur WHERE id_user      = ?', [id]);
}

beforeAll(async () => {
  candidatId  = await utilisateur.create('SecCand', 'Cand', CAND_EMAIL, TEST_MDP, '');
  adminId     = await utilisateur.create('SecAdm',  'Adm',  ADM_EMAIL,  TEST_MDP, '');
  await utilisateur.changeRole(adminId, 'Admin', null, null);
  recruteurId = await utilisateur.create('SecRec',  'Rec',  REC_EMAIL,  TEST_MDP, '');
  await utilisateur.changeRole(recruteurId, 'Recruteur', null, adminId);
});

afterAll(async () => {
  await cleanupUser(candidatId);
  await cleanupUser(recruteurId);
  await cleanupUser(adminId);
  await DB.end();
});

// ─── (a) Contrôle d'accès — OBLIGATOIRE ──────────────────────────────────────
//
// Vérifie que les middlewares isAdmin / isRecruteur / isCandidat bloquent
// correctement les accès selon le rôle de l'utilisateur connecté.
// Protection implémentée dans routes/index.js:37-56.

describe('(a) Contrôle d\'accès — vérification des rôles', () => {
  const candidatAgent  = request.agent(app);
  const recruteurAgent = request.agent(app);

  beforeAll(async () => {
    await candidatAgent.post('/login').type('form').send({ email: CAND_EMAIL, mdp: TEST_MDP });
    await recruteurAgent.post('/login').type('form').send({ email: REC_EMAIL,  mdp: TEST_MDP });
  });

  // Sans session : redirection vers /connection
  test('Sans session : GET /admin redirige vers /connection', async () => {
    const res = await request(app).get('/admin');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/connection');
  });

  // Candidat connecté ne peut pas accéder aux espaces admin ou recruteur
  test('Candidat connecté : GET /admin répond 403', async () => {
    const res = await candidatAgent.get('/admin');
    expect(res.statusCode).toBe(403);
  });

  test('Candidat connecté : GET /recruteur répond 403', async () => {
    const res = await candidatAgent.get('/recruteur');
    expect(res.statusCode).toBe(403);
  });

  // Recruteur connecté ne peut pas accéder à l'espace admin
  test('Recruteur connecté : GET /admin répond 403', async () => {
    const res = await recruteurAgent.get('/admin');
    expect(res.statusCode).toBe(403);
  });

  // Recruteur connecté ne peut pas accéder à l'espace candidat
  test('Recruteur connecté : GET /profil_candidat redirige vers /recruteur', async () => {
    const res = await recruteurAgent.get('/profil_candidat');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/recruteur');
  });
});

// ─── (b) Force brute — simulation et vérification du rate-limiter ─────────────
//
// Le rate-limiter (routes/index.js:4-15) bloque un IP après LOGIN_MAX (5)
// tentatives sur une fenêtre de 15 minutes.
// Jest isole les modules par fichier : loginAttempts Map repart de zéro ici.

describe('(b) Force brute — limitation des tentatives de connexion', () => {
  test('5 tentatives échouées, la 6e est bloquée (error=ratelimit)', async () => {
    const badCredentials = { email: `brute_${TS}@jest.local`, mdp: 'WrongMdp999!' };

    for (let i = 0; i < 5; i++) {
      await request(app).post('/login').type('form').send(badCredentials);
    }

    const res = await request(app).post('/login').type('form').send(badCredentials);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=ratelimit');
  });
});

// ─── (d) Protection CSRF — token obligatoire pour les POST ───────────────────
//
// Le middleware csurf (app.js) est bypassé en NODE_ENV='test' pour ne pas
// casser les tests fonctionnels existants. Ce describe utilise jest.isolateModules
// pour obtenir une instance de l'app avec NODE_ENV='production' (CSRF actif).
// Protection implémentée dans app.js avec csurf({ cookie: false }).

describe('(d) Protection CSRF — token obligatoire pour les POST', () => {
  let csrfApp;

  beforeAll(() => {
    const savedEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.isolateModules(() => { csrfApp = require('../app'); });
    process.env.NODE_ENV = savedEnv;
  });

  test('Le formulaire de connexion contient un champ _csrf', async () => {
    const res = await request(csrfApp).get('/connection');
    expect(res.text).toMatch(/name="_csrf"/);
  });

  test('POST /login sans token CSRF → 403', async () => {
    const res = await request(csrfApp)
      .post('/login')
      .type('form')
      .send({ email: 'x@x.com', mdp: 'Wrong12345!' });
    expect(res.statusCode).toBe(403);
  });

  test('En mode production, le token CSRF embarqué est bien formé (non-vide)', async () => {
    const res = await request(csrfApp).get('/connection');
    const match = res.text.match(/name="_csrf" value="([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match[1].length).toBeGreaterThan(20);
  });
});

// ─── (c) Injection SQL — vérification des requêtes paramétrées ────────────────
//
// Toutes les requêtes de l'application utilisent des placeholders ?.
// Un payload SQL dans le champ email ne doit jamais contourner l'authentification.
// Protection implémentée dans model/utilisateur.js:52-71 + model/db.js.

describe('(c) Injection SQL — résistance aux payloads malveillants', () => {
  const payloads = [
    { label: "classique OR 1=1",    email: "' OR '1'='1",  mdp: 'WrongMdp999!' },
    { label: "commentaire SQL --",  email: "admin'--",      mdp: 'WrongMdp999!' },
    { label: "UNION SELECT",        email: "' UNION SELECT * FROM Utilisateur--", mdp: 'WrongMdp999!' },
  ];

  test.each(payloads)(
    'Payload "$label" ne contourne pas l\'authentification',
    async ({ email, mdp }) => {
      const res = await request(app)
        .post('/login')
        .type('form')
        .send({ email, mdp });

      // L'application doit rejeter la tentative (redirection vers /connection)
      expect(res.statusCode).toBe(302);
      // La destination ne doit jamais être un espace authentifié
      expect(res.headers.location).not.toBe('/admin');
      expect(res.headers.location).not.toBe('/profil_candidat');
      expect(res.headers.location).not.toBe('/recruteur');
      expect(res.headers.location).toContain('/connection');
    }
  );
});

// ─── (e) Headers de sécurité HTTP — helmet ────────────────────────────────────
//
// Vérifie que les headers de sécurité fournis par helmet sont bien présents
// sur les réponses. Protection implémentée dans app.js via helmet().

describe('(e) Headers de sécurité — présence des protections HTTP', () => {
  test('GET /connection répond avec X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/connection');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('GET /connection répond avec X-Frame-Options', async () => {
    const res = await request(app).get('/connection');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  test('GET /connection répond avec Content-Security-Policy', async () => {
    const res = await request(app).get('/connection');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });
});
