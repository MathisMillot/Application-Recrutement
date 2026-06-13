jest.setTimeout(15000);

const request = require('supertest');
const app = require('../app');
const DB = require('../model/db');
const utilisateur = require('../model/utilisateur');

const TS = Date.now();
const CANDIDAT_EMAIL = `route_candidat_${TS}@jest.local`;
const ADMIN_EMAIL    = `route_admin_${TS}@jest.local`;
const REC_EMAIL      = `route_rec_${TS}@jest.local`;
// Conforme à validatePassword : >= 12 caractères, majuscule, minuscule, chiffre, spécial
const TEST_MDP       = 'TestMdp12345!';
const TEST_SIREN     = parseInt(String(TS).slice(-7)) + 30000000;

let candidatId  = null;
let adminId     = null;
let recruteurId = null;

// Agents partagés — connectés une seule fois pour éviter le rate limit sur /login
const candidatAgent  = request.agent(app);
const adminAgent     = request.agent(app);
const recruteurAgent = request.agent(app);

// Supprime un utilisateur et toutes ses dépendances, quel que soit son rôle
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
  candidatId  = await utilisateur.create('RouteNom', 'RoutePrenom', CANDIDAT_EMAIL, TEST_MDP, '0600000000');
  adminId     = await utilisateur.create('AdminRoute', 'AdminPrenom', ADMIN_EMAIL, TEST_MDP, '');
  await utilisateur.changeRole(adminId, 'Admin', null, null);
  recruteurId = await utilisateur.create('RecRoute', 'RecPrenom', REC_EMAIL, TEST_MDP, '');
  await utilisateur.changeRole(recruteurId, 'Recruteur', null, adminId);
  // Organisation de test pour les routes admin
  await DB.query(
    'INSERT INTO Organisation (siren, nom, type, siege_social, validation, id_admin_createur) VALUES (?, ?, ?, ?, ?, ?)',
    [TEST_SIREN, 'OrgRouteTest', 'Entreprise', '', 'ATTENTE', adminId]
  );
  // Connexions partagées (3 logins au total sur toute la suite)
  await candidatAgent.post('/login').type('form').send({ email: CANDIDAT_EMAIL, mdp: TEST_MDP });
  await adminAgent.post('/login').type('form').send({ email: ADMIN_EMAIL, mdp: TEST_MDP });
  await recruteurAgent.post('/login').type('form').send({ email: REC_EMAIL, mdp: TEST_MDP });
});

afterAll(async () => {
  await DB.query('DELETE FROM Organisation WHERE siren = ?', [TEST_SIREN]);
  await cleanupUser(candidatId);
  await cleanupUser(recruteurId);
  await cleanupUser(adminId);
  await DB.end();
});

// ─── Routes publiques (GET sans session) ─────────────────────────────────────

describe('Routes publiques', () => {
  test.each([
    '/', '/accueil', '/connection', '/inscription_candidat',
    '/inscription_recruteur', '/profil_professionnel', '/informations_personnelles',
  ])('GET %s répond 200 avec du HTML', async (path) => {
    const res = await request(app).get(path);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  test('GET /responsable_recrutement redirige sans session inscriptionRec', async () => {
    const res = await request(app).get('/responsable_recrutement');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/inscription_recruteur');
  });
});

// ─── Routes GET avec appels BDD ───────────────────────────────────────────────

describe('GET /offres', () => {
  test('répond 200 sans filtre (appelle offre.readAll)', async () => {
    const res = await request(app).get('/offres');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  test('répond 200 avec filtres q + localisation (appelle offre.filterOffres)', async () => {
    const res = await request(app).get('/offres?q=developpeur&localisation=Paris');
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /organisations', () => {
  test('répond 200 (appelle organisation.readAllWithCount)', async () => {
    const res = await request(app).get('/organisations');
    expect(res.statusCode).toBe(200);
  });

  test('répond 200 avec recherche', async () => {
    const res = await request(app).get('/organisations?q=test');
    expect(res.statusCode).toBe(200);
  });

  test('GET /organisations/:siren répond 404 si le siren est inexistant', async () => {
    const res = await request(app).get('/organisations/000000000');
    expect(res.statusCode).toBe(404);
  });

  test('GET /organisations/:siren répond 200 si l\'organisation existe', async () => {
    const res = await request(app).get(`/organisations/${TEST_SIREN}`);
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/organisation/check (JSON)', () => {
  test('retourne { exists: false } si aucun siren fourni', async () => {
    const res = await request(app).get('/api/organisation/check');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({ exists: false });
  });

  test('retourne { exists: false } si le siren est introuvable', async () => {
    const res = await request(app).get('/api/organisation/check?siren=000000000');
    expect(res.body).toEqual({ exists: false });
  });

  test('retourne { exists: true, nom } si l\'organisation existe', async () => {
    const res = await request(app).get(`/api/organisation/check?siren=${TEST_SIREN}`);
    expect(res.body.exists).toBe(true);
    expect(res.body.nom).toBe('OrgRouteTest');
  });
});

// ─── Protection des routes (middlewares de session/rôle) ─────────────────────

describe('Routes protégées sans session', () => {
  test.each([
    '/admin', '/profil_candidat', '/recruteur',
    '/modifier_profil', '/devenir_recruteur', '/candidature',
  ])('GET %s redirige vers /connection', async (path) => {
    const res = await request(app).get(path);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/connection');
  });

  test('POST /logout détruit la session et redirige vers /connection', async () => {
    const res = await request(app).post('/logout');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/connection');
  });
});

// ─── POST /login ──────────────────────────────────────────────────────────────

describe('POST /login', () => {
  test('redirige si les credentials sont invalides', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: `inconnu_${TS}@jest.local`, mdp: 'mauvais' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('/connection');
  });
});

// ─── POST /inscription/etape1 (validatePassword + findByEmail) ────────────────

describe('POST /inscription/etape1', () => {
  const post = (body) => request(app).post('/inscription/etape1').type('form').send(body);

  test('redirige avec erreur si mot de passe trop court', async () => {
    const res = await post({ email: 'a@a.fr', mdp: 'court', confirm: 'court' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=mdp-court');
  });

  test('redirige avec erreur si les mots de passe ne correspondent pas', async () => {
    const res = await post({ email: 'a@a.fr', mdp: TEST_MDP, confirm: 'Different12345!' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=mdp');
    expect(res.headers.location).not.toContain('error=mdp-');
  });

  test('redirige avec error=email si email déjà en BDD (appelle findByEmail)', async () => {
    const res = await post({ email: CANDIDAT_EMAIL, mdp: TEST_MDP, confirm: TEST_MDP });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=email');
  });

  test('redirige vers /informations_personnelles si email disponible', async () => {
    const res = await post({ email: `route_inscr_${TS}@jest.local`, mdp: TEST_MDP, confirm: TEST_MDP });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/informations_personnelles');
  });
});

// ─── POST /inscription_recruteur/etape1 ───────────────────────────────────────

describe('POST /inscription_recruteur/etape1', () => {
  const post = (body) => request(app).post('/inscription_recruteur/etape1').type('form').send(body);

  test('redirige avec erreur si mot de passe trop court', async () => {
    const res = await post({ email: 'rec@rec.fr', mdp: 'court', confirm: 'court' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=mdp-court');
  });

  test('redirige avec error=email si email déjà en BDD', async () => {
    const res = await post({ email: CANDIDAT_EMAIL, mdp: TEST_MDP, confirm: TEST_MDP });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=email');
  });

  test('redirige vers /responsable_recrutement si email disponible', async () => {
    const res = await post({ email: `route_insc_rec_${TS}@jest.local`, mdp: TEST_MDP, confirm: TEST_MDP });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/responsable_recrutement');
  });
});

// ─── Flux inscription candidat multi-étapes (session partagée via agent) ──────

describe('Flux inscription candidat (étapes 2 et 3)', () => {
  const agent = request.agent(app);
  const INS_EMAIL = `route_ins3_${TS}@jest.local`;
  let createdUserId = null;

  afterAll(() => cleanupUser(createdUserId));

  test('POST /inscription/etape2 sans session redirige vers /inscription_candidat', async () => {
    const res = await request(app).post('/inscription/etape2').type('form').send({ nom: 'X', prenom: 'Y', num_tel: '' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/inscription_candidat');
  });

  test('POST /inscription/etape2 stocke nom/prenom en session et redirige', async () => {
    // L'étape 1 crée la session d'inscription portée par l'agent
    await agent.post('/inscription/etape1').type('form').send({ email: INS_EMAIL, mdp: TEST_MDP, confirm: TEST_MDP });
    const res = await agent.post('/inscription/etape2').type('form').send({ nom: 'NomIns', prenom: 'PrenomIns', num_tel: '0600000000' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/profil_professionnel');
  });

  test('POST /inscription/etape3 crée l\'utilisateur et redirige vers /profil_candidat', async () => {
    const res = await agent.post('/inscription/etape3').type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/profil_candidat');
    const user = await utilisateur.findByEmail(INS_EMAIL);
    expect(user).toBeDefined();
    if (user) createdUserId = user.id_user;
  });
});

// ─── Flux inscription recruteur multi-étapes ──────────────────────────────────

describe('Flux inscription recruteur (étape 2)', () => {
  const agent = request.agent(app);
  const REC_INS_EMAIL = `route_rec_ins_${TS}@jest.local`;
  const SIREN_REC_INS = parseInt(String(TS).slice(-7)) + 40000000;
  let createdRecId = null;

  afterAll(async () => {
    if (createdRecId) {
      await DB.query('DELETE FROM DemandeRecruteur WHERE id_candidat = ?', [createdRecId]);
    }
    await cleanupUser(createdRecId);
    await DB.query('DELETE FROM Organisation WHERE siren = ?', [SIREN_REC_INS]);
  });

  test('GET /responsable_recrutement répond 200 avec session inscriptionRec', async () => {
    await agent.post('/inscription_recruteur/etape1').type('form').send({ email: REC_INS_EMAIL, mdp: TEST_MDP, confirm: TEST_MDP });
    const res = await agent.get('/responsable_recrutement');
    expect(res.statusCode).toBe(200);
  });

  test('POST /inscription_recruteur/etape2 crée le compte INACTIF et affiche la confirmation', async () => {
    const res = await agent.post('/inscription_recruteur/etape2').type('form').send({
      nom: 'RecIns', prenom: 'PrenIns', num_tel: '', siren_organisation: SIREN_REC_INS, nom_organisation: 'OrgRecIns'
    });
    // Affiche la page de confirmation (200) au lieu de rediriger vers /recruteur
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Demande prise en compte');
    const user = await utilisateur.findByEmail(REC_INS_EMAIL);
    expect(user).toBeDefined();
    // Le compte est créé en INACTIF (attente validation admin)
    expect(user.statut).toBe('INACTIF');
    if (user) createdRecId = user.id_user;
    // Une DemandeRecruteur doit exister
    const [rows] = await DB.query(
      "SELECT id_demande FROM DemandeRecruteur WHERE id_candidat = ? AND statut = 'ATTENTE'",
      [createdRecId]
    );
    expect(rows.length).toBe(1);
  });
});

// ─── Routes candidat avec session ─────────────────────────────────────────────

describe('Routes candidat avec session', () => {
  test('GET /connection redirige vers /profil_candidat quand déjà connecté', async () => {
    const res = await candidatAgent.get('/connection');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/profil_candidat');
  });

  test.each(['/profil_candidat', '/modifier_profil', '/devenir_recruteur'])(
    'GET %s répond 200', async (path) => {
      const res = await candidatAgent.get(path);
      expect(res.statusCode).toBe(200);
    }
  );

  test('POST /modifier_profil met à jour le profil et redirige', async () => {
    const res = await candidatAgent
      .post('/modifier_profil')
      .type('form')
      .send({ nom: 'NouveauNom', prenom: 'NouveauPrenom', email: CANDIDAT_EMAIL, num_tel: '0700000000' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/profil_candidat');
  });

  test('GET /recruteur répond 403 pour un candidat (middleware isRecruteur)', async () => {
    const res = await candidatAgent.get('/recruteur');
    expect(res.statusCode).toBe(403);
  });

  test('GET /admin répond 403 pour un candidat (middleware isAdmin)', async () => {
    const res = await candidatAgent.get('/admin');
    expect(res.statusCode).toBe(403);
  });
});

// ─── Routes admin avec session ────────────────────────────────────────────────

describe('Routes admin avec session', () => {
  test('GET /connection redirige vers /admin quand déjà connecté', async () => {
    const res = await adminAgent.get('/connection');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  test.each(['/admin', '/admin/offres', '/admin/candidatures'])(
    'GET %s répond 200', async (path) => {
      const res = await adminAgent.get(path);
      expect(res.statusCode).toBe(200);
    }
  );

  test('POST /admin/users/:id/statut bascule le statut et redirige', async () => {
    const res = await adminAgent.post(`/admin/users/${candidatId}/statut`).type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin');
    // remet le statut d'origine
    await adminAgent.post(`/admin/users/${candidatId}/statut`).type('form').send({});
  });

  test('POST /admin/organisations/:siren/valider redirige vers /admin', async () => {
    const res = await adminAgent.post(`/admin/organisations/${TEST_SIREN}/valider`).type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  test('POST /admin/organisations/:siren/rejeter redirige vers /admin', async () => {
    await DB.query('UPDATE Organisation SET validation = ? WHERE siren = ?', ['ATTENTE', TEST_SIREN]);
    const res = await adminAgent.post(`/admin/organisations/${TEST_SIREN}/rejeter`).type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  test('POST /admin/organisations/:siren/supprimer redirige vers /admin', async () => {
    const res = await adminAgent.post(`/admin/organisations/${TEST_SIREN}/supprimer`).type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });
});

// ─── Routes recruteur avec session ────────────────────────────────────────────

describe('Routes recruteur avec session', () => {
  test.each([
    '/recruteur', '/recruteur/fiches', '/recruteur/fiches/nouvelle',
    '/recruteur/offres/nouvelle', '/recruteur/organisation/rejoindre', '/recruteur/organisation/nouvelle',
  ])('GET %s répond 200', async (path) => {
    const res = await recruteurAgent.get(path);
    expect(res.statusCode).toBe(200);
  });

  test('GET /profil_candidat redirige vers /recruteur (middleware isCandidat)', async () => {
    const res = await recruteurAgent.get('/profil_candidat');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/recruteur');
  });
});

// ─── POST /devenir_recruteur (formulaire candidat) ────────────────────────────

describe('POST /devenir_recruteur', () => {
  beforeAll(async () => {
    await DB.query("DELETE FROM DemandeRecruteur WHERE id_candidat = ? AND statut = 'ATTENTE'", [candidatId]);
  });

  afterAll(async () => {
    await DB.query('DELETE FROM DemandeRecruteur WHERE id_candidat = ?', [candidatId]);
  });

  test('répond 200 avec erreur si siren manquant', async () => {
    const res = await candidatAgent.post('/devenir_recruteur').type('form').send({ siren: '', org_existe: '1' });
    expect(res.statusCode).toBe(200);
  });

  test('répond 200 avec erreur si org_existe=0 et nom vide', async () => {
    const res = await candidatAgent.post('/devenir_recruteur').type('form').send({ siren: '123456789', org_existe: '0', nom_organisation: '' });
    expect(res.statusCode).toBe(200);
  });

  test('crée une demande et répond 200 (appelle demandeRecruteur.create)', async () => {
    const res = await candidatAgent.post('/devenir_recruteur').type('form').send({ siren: '987654321', org_existe: '1' });
    expect(res.statusCode).toBe(200);
  });

  test('répond 200 avec erreur si demande déjà en attente (appelle hasPending)', async () => {
    const res = await candidatAgent.post('/devenir_recruteur').type('form').send({ siren: '111111111', org_existe: '1' });
    expect(res.statusCode).toBe(200);
  });
});

// ─── POST /admin/users/:id/role ───────────────────────────────────────────────

describe('POST /admin/users/:id/role', () => {
  test('répond 400 si rôle invalide', async () => {
    const res = await adminAgent.post(`/admin/users/${candidatId}/role`).type('form').send({ role: 'SuperAdmin' });
    expect(res.statusCode).toBe(400);
  });

  test('répond 400 si modification de son propre rôle', async () => {
    const res = await adminAgent.post(`/admin/users/${adminId}/role`).type('form').send({ role: 'Candidat' });
    expect(res.statusCode).toBe(400);
  });

  test('change le rôle et redirige vers /admin', async () => {
    const res = await adminAgent.post(`/admin/users/${candidatId}/role`).type('form').send({ role: 'Admin', newAdminId: '' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin');
    await adminAgent.post(`/admin/users/${candidatId}/role`).type('form').send({ role: 'Candidat', newAdminId: adminId });
  });
});

// ─── POST /admin/demandes (accepter / rejeter) ────────────────────────────────

describe('POST /admin/demandes', () => {
  const TEMP_EMAIL     = `route_temp_${TS}@jest.local`;
  const PENDING_EMAIL  = `route_pending_${TS}@jest.local`;
  const SIREN_DEMANDE  = parseInt(String(TS).slice(-7)) + 80000000;
  const SIREN_PENDING  = parseInt(String(TS).slice(-7)) + 85000000;
  let tempUserId = null;
  let pendingUserId = null;
  let demandeAccepterId = null;
  let demandeRejeterId  = null;
  let demandePendingId  = null;

  beforeAll(async () => {
    // Candidat actif → demande recruteur (flux "devenir recruteur")
    tempUserId = await utilisateur.create('TempNom', 'TempPren', TEMP_EMAIL, TEST_MDP, '');
    const [r1] = await DB.query(
      "INSERT INTO DemandeRecruteur (id_candidat, siren, nom_organisation, statut) VALUES (?, ?, ?, 'ATTENTE')",
      [tempUserId, SIREN_DEMANDE, 'OrgDemandeTmp']
    );
    demandeAccepterId = r1.insertId;
    const [r2] = await DB.query(
      "INSERT INTO DemandeRecruteur (id_candidat, siren, nom_organisation, statut) VALUES (?, ?, ?, 'ATTENTE')",
      [candidatId, '555666777', null]
    );
    demandeRejeterId = r2.insertId;
    // Recruteur en attente (flux inscription_recruteur) : INACTIF + DemandeRecruteur
    pendingUserId = await utilisateur.createRecruteurEnAttente('PendNom', 'PendPren', PENDING_EMAIL, TEST_MDP, '');
    const [r3] = await DB.query(
      "INSERT INTO DemandeRecruteur (id_candidat, siren, nom_organisation, statut) VALUES (?, ?, ?, 'ATTENTE')",
      [pendingUserId, SIREN_PENDING, 'OrgPending']
    );
    demandePendingId = r3.insertId;
  });

  afterAll(async () => {
    await DB.query('DELETE FROM DemandeRecruteur WHERE id_demande IN (?, ?, ?)', [demandeAccepterId, demandeRejeterId, demandePendingId]);
    await cleanupUser(tempUserId);
    await cleanupUser(pendingUserId);
    await DB.query('DELETE FROM Organisation WHERE siren IN (?, ?)', [SIREN_DEMANDE, SIREN_PENDING]);
  });

  test('login avec compte INACTIF + demande ATTENTE redirige vers error=pending', async () => {
    const res = await request(app).post('/login').type('form').send({ email: PENDING_EMAIL, mdp: TEST_MDP });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=pending');
  });

  test('POST /admin/demandes/:id/accepter active le compte, change le rôle, redirige vers /admin', async () => {
    const res = await adminAgent.post(`/admin/demandes/${demandePendingId}/accepter`).type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin');
    // Vérifier que le compte est maintenant ACTIF et rôle Recruteur
    const user = await utilisateur.read(pendingUserId);
    expect(user.statut).toBe('ACTIF');
    expect(user.role).toBe('Recruteur');
  });

  test('POST /admin/demandes/:id/accepter change le rôle et redirige vers /admin', async () => {
    const res = await adminAgent.post(`/admin/demandes/${demandeAccepterId}/accepter`).type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  test('POST /admin/demandes/:id/rejeter redirige vers /admin', async () => {
    const res = await adminAgent.post(`/admin/demandes/${demandeRejeterId}/rejeter`).type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });
});

// ─── POST /admin/adhesions - rejeter ──────────────────────────────────────────

describe('POST /admin/adhesions - rejeter', () => {
  const SIREN_ADH = parseInt(String(TS).slice(-7)) + 90000000;

  beforeAll(async () => {
    await DB.query(
      'INSERT INTO Organisation (siren, nom, type, siege_social, validation, id_admin_createur) VALUES (?, ?, ?, ?, ?, ?)',
      [SIREN_ADH, 'OrgAdhesion', 'Entreprise', '', 'OUI', adminId]
    );
    await DB.query("INSERT INTO Appartient (siren_organisation, id_recruteur, statut) VALUES (?, ?, 'ATTENTE')", [SIREN_ADH, recruteurId]);
  });

  afterAll(async () => {
    await DB.query('DELETE FROM Appartient   WHERE siren_organisation = ?', [SIREN_ADH]);
    await DB.query('DELETE FROM Organisation WHERE siren              = ?', [SIREN_ADH]);
  });

  test('POST /admin/adhesions/:siren/:id/rejeter redirige vers /admin', async () => {
    const res = await adminAgent.post(`/admin/adhesions/${SIREN_ADH}/${recruteurId}/rejeter`).type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });
});

// ─── Recruteur CRUD fiches et offres (avec organisation validée) ──────────────

describe('Recruteur CRUD fiches et offres', () => {
  const SIREN_REC_CRUD = parseInt(String(TS).slice(-7)) + 50000000;
  let ficheId = null;
  let offreId = null;

  beforeAll(async () => {
    await DB.query(
      'INSERT INTO Organisation (siren, nom, type, siege_social, validation, id_admin_createur) VALUES (?, ?, ?, ?, ?, ?)',
      [SIREN_REC_CRUD, 'OrgRecCRUD', 'Entreprise', '', 'OUI', adminId]
    );
    await DB.query("INSERT INTO Appartient (siren_organisation, id_recruteur, statut) VALUES (?, ?, 'ACCEPTEE')", [SIREN_REC_CRUD, recruteurId]);
  });

  afterAll(async () => {
    if (offreId) await DB.query('DELETE FROM OffreEmploi  WHERE id_offre = ?', [offreId]);
    if (ficheId) await DB.query('DELETE FROM FicheDePoste WHERE id_fiche = ?', [ficheId]);
    await DB.query('DELETE FROM Appartient   WHERE siren_organisation = ?', [SIREN_REC_CRUD]);
    await DB.query('DELETE FROM Organisation WHERE siren              = ?', [SIREN_REC_CRUD]);
  });

  test('POST /recruteur/organisation/nouvelle crée une organisation et redirige', async () => {
    const SIREN_NOUVELLE = parseInt(String(TS).slice(-7)) + 60000000;
    const res = await recruteurAgent.post('/recruteur/organisation/nouvelle').type('form').send({
      siren: SIREN_NOUVELLE, nom: 'NouvelleOrg', type: 'Entreprise', siege_social: '1 rue test'
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/recruteur');
    await DB.query('DELETE FROM Appartient   WHERE siren_organisation = ?', [SIREN_NOUVELLE]);
    await DB.query('DELETE FROM Organisation WHERE siren              = ?', [SIREN_NOUVELLE]);
  });

  test('POST /recruteur/fiches/nouvelle crée une fiche et redirige', async () => {
    const res = await recruteurAgent.post('/recruteur/fiches/nouvelle').type('form').send({
      intitule: 'Fiche Test Jest', nom_poste: 'Dev', responsable: 'Chef', lieu: 'Paris',
      salaire_min: '30000', salaire_max: '50000', description: 'desc',
      type_contrat: 'CDI', remote: 'Non', siren_organisation: SIREN_REC_CRUD
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/recruteur/fiches');
    const [[fiche]] = await DB.query(
      'SELECT id_fiche FROM FicheDePoste WHERE siren_organisation = ? ORDER BY id_fiche DESC LIMIT 1',
      [SIREN_REC_CRUD]
    );
    ficheId = fiche ? fiche.id_fiche : null;
  });

  test('GET /recruteur/fiches/:id/modifier répond 200', async () => {
    expect(ficheId).not.toBeNull();
    const res = await recruteurAgent.get(`/recruteur/fiches/${ficheId}/modifier`);
    expect(res.statusCode).toBe(200);
  });

  test('POST /recruteur/fiches/:id/modifier met à jour et redirige', async () => {
    const res = await recruteurAgent.post(`/recruteur/fiches/${ficheId}/modifier`).type('form').send({
      intitule: 'Fiche Modifiée', nom_poste: 'Dev Senior', responsable: 'Lead',
      lieu: 'Lyon', salaire_min: '40000', salaire_max: '60000',
      description: 'modifiée', type_contrat: 'CDI', remote: 'Oui'
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/recruteur/fiches');
  });

  test('POST /recruteur/offres/nouvelle avec date passée retourne 200 avec erreur', async () => {
    expect(ficheId).not.toBeNull();
    const res = await recruteurAgent.post('/recruteur/offres/nouvelle').type('form').send({
      id_fiche: ficheId, statut: 'publiee', date_expiration: '2020-01-01'
    });
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('passé');
    // Aucune offre ne doit avoir été créée
    const [[row]] = await DB.query(
      'SELECT COUNT(*) AS n FROM OffreEmploi WHERE siren_organisation = ? AND date_expiration = ?',
      [SIREN_REC_CRUD, '2020-01-01']
    );
    expect(row.n).toBe(0);
  });

  test('POST /recruteur/offres/nouvelle crée une offre et redirige', async () => {
    const res = await recruteurAgent.post('/recruteur/offres/nouvelle').type('form').send({
      id_fiche: ficheId, statut: 'publiee', date_expiration: '2099-12-31'
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/recruteur');
    const [[offre]] = await DB.query(
      'SELECT id_offre FROM OffreEmploi WHERE siren_organisation = ? ORDER BY id_offre DESC LIMIT 1',
      [SIREN_REC_CRUD]
    );
    offreId = offre ? offre.id_offre : null;
  });

  test('GET /recruteur/offres/:id/modifier répond 200', async () => {
    expect(offreId).not.toBeNull();
    const res = await recruteurAgent.get(`/recruteur/offres/${offreId}/modifier`);
    expect(res.statusCode).toBe(200);
  });

  test('GET /recruteur/offres/:id/candidatures répond 200', async () => {
    const res = await recruteurAgent.get(`/recruteur/offres/${offreId}/candidatures`);
    expect(res.statusCode).toBe(200);
  });

  test('POST /recruteur/offres/:id/modifier avec date passée retourne 200 avec erreur', async () => {
    expect(offreId).not.toBeNull();
    const res = await recruteurAgent.post(`/recruteur/offres/${offreId}/modifier`).type('form').send({
      statut: 'publiee', date_expiration: '2020-01-01'
    });
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('passé');
    // La date en base ne doit pas avoir changé
    const [[row]] = await DB.query('SELECT date_expiration FROM OffreEmploi WHERE id_offre = ?', [offreId]);
    expect(new Date(row.date_expiration).getFullYear()).not.toBe(2020);
  });

  test('POST /recruteur/offres/:id/modifier met à jour et redirige', async () => {
    const res = await recruteurAgent.post(`/recruteur/offres/${offreId}/modifier`).type('form').send({
      statut: 'publiee', date_expiration: '2099-12-31'
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/recruteur');
  });

  test('POST /recruteur/offres/:id/supprimer supprime et redirige', async () => {
    const res = await recruteurAgent.post(`/recruteur/offres/${offreId}/supprimer`).type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/recruteur');
    offreId = null;
  });

  test('POST /recruteur/organisation/:siren/quitter redirige si seul membre', async () => {
    const res = await recruteurAgent.post(`/recruteur/organisation/${SIREN_REC_CRUD}/quitter`).type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('seul-membre');
  });

  test('POST /recruteur/fiches/:id/supprimer supprime et redirige', async () => {
    const res = await recruteurAgent.post(`/recruteur/fiches/${ficheId}/supprimer`).type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/recruteur/fiches');
    ficheId = null;
  });
});

// ─── POST /recruteur/organisation/rejoindre ───────────────────────────────────

describe('POST /recruteur/organisation/rejoindre', () => {
  const SIREN_REJOIN = parseInt(String(TS).slice(-7)) + 65000000;

  beforeAll(async () => {
    await DB.query(
      'INSERT INTO Organisation (siren, nom, type, siege_social, validation, id_admin_createur) VALUES (?, ?, ?, ?, ?, ?)',
      [SIREN_REJOIN, 'OrgRejoindre', 'Entreprise', '', 'OUI', adminId]
    );
  });

  afterAll(async () => {
    await DB.query('DELETE FROM Appartient   WHERE siren_organisation = ?', [SIREN_REJOIN]);
    await DB.query('DELETE FROM Organisation WHERE siren              = ?', [SIREN_REJOIN]);
  });

  test('crée une demande d\'adhésion et redirige vers /recruteur', async () => {
    const res = await recruteurAgent.post('/recruteur/organisation/rejoindre').type('form').send({ siren: SIREN_REJOIN });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/recruteur');
  });
});

// ─── GET et POST /candidature (avec offre publiée réelle) ─────────────────────

describe('GET et POST /candidature', () => {
  const SIREN_CAND_TEST = parseInt(String(TS).slice(-7)) + 75000000;
  let ficheIdCand = null;
  let offreIdCand = null;

  beforeAll(async () => {
    await DB.query(
      'INSERT INTO Organisation (siren, nom, type, siege_social, validation, id_admin_createur) VALUES (?, ?, ?, ?, ?, ?)',
      [SIREN_CAND_TEST, 'OrgCandidature', 'Entreprise', '', 'OUI', adminId]
    );
    const [ficheResult] = await DB.query(
      'INSERT INTO FicheDePoste (intitule, nom_poste, responsable, lieu, salaire_min, salaire_max, description, type_contrat, remote, siren_organisation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['Dev Candidature', 'Dev', 'Chef', 'Paris', 30000, 50000, 'test', 'CDI', 'Non', SIREN_CAND_TEST]
    );
    ficheIdCand = ficheResult.insertId;
    const [offreResult] = await DB.query(
      "INSERT INTO OffreEmploi (statut, date_expiration, id_fiche, siren_organisation) VALUES ('publiee', '2099-12-31', ?, ?)",
      [ficheIdCand, SIREN_CAND_TEST]
    );
    offreIdCand = offreResult.insertId;
  });

  afterAll(async () => {
    await DB.query('DELETE FROM Candidature  WHERE id_offre = ?', [offreIdCand]);
    await DB.query('DELETE FROM OffreEmploi  WHERE id_offre = ?', [offreIdCand]);
    await DB.query('DELETE FROM FicheDePoste WHERE id_fiche = ?', [ficheIdCand]);
    await DB.query('DELETE FROM Organisation WHERE siren    = ?', [SIREN_CAND_TEST]);
  });

  test('POST /upload sans fichier redirige vers /profil_candidat', async () => {
    const res = await candidatAgent.post('/upload').type('form').send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/profil_candidat');
  });

  test('GET /candidature?id=0 redirige vers /offres', async () => {
    const res = await candidatAgent.get('/candidature?id=0');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/offres');
  });

  test('GET /candidature avec offre valide répond 200 (appelle offre.read)', async () => {
    const res = await candidatAgent.get(`/candidature?id=${offreIdCand}`);
    expect(res.statusCode).toBe(200);
  });

  test('POST /candidature crée la candidature et affiche la confirmation', async () => {
    const res = await candidatAgent.post('/candidature').field('id_offre', String(offreIdCand));
    expect(res.statusCode).toBe(200);
  });

  test('POST /candidature redirige si déjà candidaté (appelle existsForOffre)', async () => {
    const res = await candidatAgent.post('/candidature').field('id_offre', String(offreIdCand));
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/profil_candidat');
  });
});
