jest.setTimeout(15000);

const DB = require('../model/db');
const utilisateur = require('../model/utilisateur');

const TS = Date.now();
const TEST_EMAIL = `jest_${TS}@jest.local`;
const TEST_MDP = 'TestMdp123!';
let testUserId = null;

beforeAll(async () => {
  testUserId = await utilisateur.create('TestNom', 'TestPrenom', TEST_EMAIL, TEST_MDP, '0600000000');
});

afterAll(async () => {
  if (testUserId) {
    await DB.query('DELETE FROM Candidature WHERE id_candidat  = ?', [testUserId]);
    await DB.query('DELETE FROM Appartient  WHERE id_recruteur = ?', [testUserId]);
    await DB.query('DELETE FROM Candidat    WHERE id_user      = ?', [testUserId]);
    await DB.query('DELETE FROM Recruteur   WHERE id_user      = ?', [testUserId]);
    await DB.query('DELETE FROM Admin       WHERE id_user      = ?', [testUserId]);
    await DB.query('DELETE FROM Utilisateur WHERE id_user      = ?', [testUserId]);
  }
  await DB.end();
});

// ─── readAll ──────────────────────────────────────────────────────────────────
describe('readAll', () => {
  test('retourne un tableau non vide', async () => {
    const users = await utilisateur.readAll();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
  });

  test("l'utilisateur de test est présent avec les bons champs", async () => {
    const users = await utilisateur.readAll();
    const user = users.find(u => u.id_user === testUserId);
    expect(user).toBeDefined();
    expect(user.email).toBe(TEST_EMAIL);
    expect(user).toHaveProperty('role');
  });
});

// ─── read ─────────────────────────────────────────────────────────────────────
describe('read', () => {
  test("retourne l'utilisateur correspondant à l'id", async () => {
    const user = await utilisateur.read(testUserId);
    expect(user).toBeDefined();
    expect(user.id_user).toBe(testUserId);
    expect(user.email).toBe(TEST_EMAIL);
  });

  test('retourne undefined pour un id inexistant', async () => {
    const user = await utilisateur.read(999999);
    expect(user).toBeUndefined();
  });
});

// ─── findByEmail ─────────────────────────────────────────────────────────────
describe('findByEmail', () => {
  test("retourne l'utilisateur si l'email existe", async () => {
    const user = await utilisateur.findByEmail(TEST_EMAIL);
    expect(user).toBeDefined();
    expect(user.email).toBe(TEST_EMAIL);
  });

  test("retourne undefined si l'email est inconnu", async () => {
    const user = await utilisateur.findByEmail('inconnu_jest@jest.local');
    expect(user).toBeUndefined();
  });
});

// ─── findAndCheckByCredentials ────────────────────────────────────────────────
describe('findAndCheckByCredentials', () => {
  test("retourne null si l'email est inexistant", async () => {
    const result = await utilisateur.findAndCheckByCredentials('inconnu@jest.local', 'mdp');
    expect(result).toBeNull();
  });

  test('retourne null si le mot de passe est incorrect', async () => {
    const result = await utilisateur.findAndCheckByCredentials(TEST_EMAIL, 'mauvaismdp');
    expect(result).toBeNull();
  });

  test("retourne l'utilisateur sans le champ mdp si credentials valides", async () => {
    const result = await utilisateur.findAndCheckByCredentials(TEST_EMAIL, TEST_MDP);
    expect(result).not.toBeNull();
    expect(result.mdp).toBeUndefined();
    expect(result.email).toBe(TEST_EMAIL);
  });

  test('retourne { inactive: true } si le compte est INACTIF', async () => {
    await utilisateur.setStatut(testUserId, 'INACTIF');
    const result = await utilisateur.findAndCheckByCredentials(TEST_EMAIL, TEST_MDP);
    expect(result).toEqual({ inactive: true });
    await utilisateur.setStatut(testUserId, 'ACTIF');
  });
});

// ─── update ──────────────────────────────────────────────────────────────────
describe('update', () => {
  test("met à jour les informations de l'utilisateur", async () => {
    const rows = await utilisateur.update(testUserId, 'NouveauNom', 'NouveauPrenom', TEST_EMAIL, '0700000000');
    expect(rows).toBe(1);
    const user = await utilisateur.read(testUserId);
    expect(user.nom).toBe('NouveauNom');
    expect(user.prenom).toBe('NouveauPrenom');
  });

  test('retourne 0 pour un id inexistant', async () => {
    const rows = await utilisateur.update(999999, 'X', 'Y', 'z@z.fr', '');
    expect(rows).toBe(0);
  });
});

// ─── getDocuments & addDocument ───────────────────────────────────────────────
describe('getDocuments & addDocument', () => {
  test('retourne un tableau vide si aucun document', async () => {
    const docs = await utilisateur.getDocuments(testUserId);
    expect(docs).toEqual([]);
  });

  test('addDocument ajoute un fichier, getDocuments le retourne', async () => {
    await utilisateur.addDocument(testUserId, 'cv_jest.pdf');
    const docs = await utilisateur.getDocuments(testUserId);
    expect(docs).toContain('cv_jest.pdf');
  });
});

// ─── setPhoto ─────────────────────────────────────────────────────────────────
describe('setPhoto', () => {
  test('met à jour la photo de profil', async () => {
    await utilisateur.setPhoto(testUserId, 'photo_jest.jpg');
    const user = await utilisateur.read(testUserId);
    expect(user.photo_profil).toBe('photo_jest.jpg');
  });
});

// ─── setStatut ────────────────────────────────────────────────────────────────
describe('setStatut', () => {
  test('change le statut à INACTIF puis retour à ACTIF', async () => {
    let rows = await utilisateur.setStatut(testUserId, 'INACTIF');
    expect(rows).toBe(1);
    let user = await utilisateur.read(testUserId);
    expect(user.statut).toBe('INACTIF');

    rows = await utilisateur.setStatut(testUserId, 'ACTIF');
    expect(rows).toBe(1);
    user = await utilisateur.read(testUserId);
    expect(user.statut).toBe('ACTIF');
  });
});

// ─── findOrCreateByGoogle ─────────────────────────────────────────────────────
describe('findOrCreateByGoogle', () => {
  const GOOGLE_EMAIL = `jest_google_${TS}@gmail.com`;
  let googleUserId = null;

  afterAll(async () => {
    if (googleUserId) {
      await DB.query('DELETE FROM Candidat    WHERE id_user = ?', [googleUserId]);
      await DB.query('DELETE FROM Utilisateur WHERE id_user = ?', [googleUserId]);
    }
  });

  test("crée un nouvel utilisateur si l'email Google est inconnu", async () => {
    const profile = {
      emails: [{ value: GOOGLE_EMAIL }],
      name: { familyName: 'GoogleNom', givenName: 'GooglePrenom' },
    };
    const result = await utilisateur.findOrCreateByGoogle(profile);
    expect(result).toBeDefined();
    expect(result.email).toBe(GOOGLE_EMAIL);
    expect(result.role).toBe('Candidat');
    googleUserId = result.id_user;
  });

  test("retourne l'utilisateur existant si l'email Google est déjà connu", async () => {
    const profile = {
      emails: [{ value: TEST_EMAIL }],
      name: { familyName: 'TestNom', givenName: 'TestPrenom' },
    };
    const result = await utilisateur.findOrCreateByGoogle(profile);
    expect(result).toBeDefined();
    expect(result.id_user).toBe(testUserId);
  });

  test("retourne { inactive: true } si l'utilisateur est INACTIF", async () => {
    await utilisateur.setStatut(testUserId, 'INACTIF');
    const profile = {
      emails: [{ value: TEST_EMAIL }],
      name: { familyName: 'TestNom', givenName: 'TestPrenom' },
    };
    const result = await utilisateur.findOrCreateByGoogle(profile);
    expect(result).toEqual({ inactive: true });
    await utilisateur.setStatut(testUserId, 'ACTIF');
  });
});

// ─── createRecruteur ──────────────────────────────────────────────────────────
// Nécessite au moins un Admin en base (FK id_admin_validateur NOT NULL)
describe('createRecruteur', () => {
  const REC_EMAIL      = `jest_rec_${TS}@jest.local`;
  const REC_EMAIL2     = `jest_rec2_${TS}@jest.local`;
  const SIREN_ORG      = parseInt(String(TS).slice(-7)) + 10000000; // INT unique par run
  let recruteurId      = null;
  let recruteurIdOrg   = null;

  afterAll(async () => {
    if (recruteurId) {
      await DB.query('DELETE FROM Recruteur   WHERE id_user = ?', [recruteurId]);
      await DB.query('DELETE FROM Utilisateur WHERE id_user = ?', [recruteurId]);
    }
    if (recruteurIdOrg) {
      await DB.query('DELETE FROM Appartient  WHERE id_recruteur      = ?', [recruteurIdOrg]);
      await DB.query('DELETE FROM Organisation WHERE siren             = ?', [SIREN_ORG]);
      await DB.query('DELETE FROM Recruteur   WHERE id_user           = ?', [recruteurIdOrg]);
      await DB.query('DELETE FROM Utilisateur WHERE id_user           = ?', [recruteurIdOrg]);
    }
  });

  test("crée un recruteur sans organisation et retourne son id", async () => {
    const [[admin]] = await DB.query('SELECT id_user FROM Admin LIMIT 1');
    if (!admin) { console.warn("⚠️  Pas d'admin en BDD — test ignoré"); return; }
    recruteurId = await utilisateur.createRecruteur(
      'RecNom', 'RecPrenom', REC_EMAIL, 'RecMdp123!', '0600000001', null, null
    );
    expect(typeof recruteurId).toBe('number');
    expect(recruteurId).toBeGreaterThan(0);
    const user = await utilisateur.read(recruteurId);
    expect(user.role).toBe('Recruteur');
  });

  // Couvre les lignes 159-166 : branche if (siren_organisation)
  test("crée un recruteur avec organisation et insère dans Appartient", async () => {
    const [[admin]] = await DB.query('SELECT id_user FROM Admin LIMIT 1');
    if (!admin) { console.warn("⚠️  Pas d'admin en BDD — test ignoré"); return; }
    recruteurIdOrg = await utilisateur.createRecruteur(
      'RecNomOrg', 'RecPrenomOrg', REC_EMAIL2, 'RecMdp123!', '', SIREN_ORG, 'OrgJestTest'
    );
    expect(recruteurIdOrg).toBeGreaterThan(0);
    const user = await utilisateur.read(recruteurIdOrg);
    expect(user.role).toBe('Recruteur');
    const [[lien]] = await DB.query(
      'SELECT * FROM Appartient WHERE id_recruteur = ? AND siren_organisation = ?',
      [recruteurIdOrg, SIREN_ORG]
    );
    expect(lien).toBeDefined();
  });
});

// ─── changeRole ───────────────────────────────────────────────────────────────
describe('changeRole', () => {
  test("passe l'utilisateur de Candidat à Admin puis retour à Candidat", async () => {
    await utilisateur.changeRole(testUserId, 'Admin', null, null);
    let user = await utilisateur.read(testUserId);
    expect(user.role).toBe('Admin');

    await utilisateur.changeRole(testUserId, 'Candidat', null, null);
    user = await utilisateur.read(testUserId);
    expect(user.role).toBe('Candidat');
  });

  // Couvre la ligne 197 : branche newRole === 'Recruteur'
  test("passe l'utilisateur de Candidat à Recruteur puis retour à Candidat", async () => {
    const [[admin]] = await DB.query('SELECT id_user FROM Admin LIMIT 1');
    if (!admin) { console.warn("⚠️  Pas d'admin en BDD — test ignoré"); return; }

    await utilisateur.changeRole(testUserId, 'Recruteur', null, admin.id_user);
    let user = await utilisateur.read(testUserId);
    expect(user.role).toBe('Recruteur');

    await utilisateur.changeRole(testUserId, 'Candidat', null, null);
    user = await utilisateur.read(testUserId);
    expect(user.role).toBe('Candidat');
  });
});

// ─── changeRole - admin avec organisations liées ──────────────────────────────
// Couvre les lignes 175-178 (erreur 409) et 186-188 (réassignation)
describe('changeRole - admin avec organisations liées', () => {
  const ADMIN2_EMAIL = `jest_admin2_${TS}@jest.local`;
  const SIREN_ADMIN  = parseInt(String(TS).slice(-7)) + 20000000; // INT unique par run
  let admin2Id       = null;

  beforeAll(async () => {
    admin2Id = await utilisateur.create('Admin2Test', 'Admin2', ADMIN2_EMAIL, 'AdminMdp123!', '');
    await utilisateur.changeRole(admin2Id, 'Admin', null, null);
    await DB.query(
      'INSERT INTO Organisation (siren, nom, type, siege_social, validation, id_admin_createur) VALUES (?, ?, ?, ?, ?, ?)',
      [SIREN_ADMIN, 'OrgJestAdmin', 'Entreprise', '', 'ATTENTE', admin2Id]
    );
  });

  afterAll(async () => {
    await DB.query('DELETE FROM Organisation WHERE siren    = ?', [SIREN_ADMIN]);
    if (admin2Id) {
      await DB.query('DELETE FROM Candidat    WHERE id_user = ?', [admin2Id]);
      await DB.query('DELETE FROM Admin       WHERE id_user = ?', [admin2Id]);
      await DB.query('DELETE FROM Utilisateur WHERE id_user = ?', [admin2Id]);
    }
  });

  test("lance une erreur 409 si l'admin a des orgs liées sans newAdminId", async () => {
    await expect(
      utilisateur.changeRole(admin2Id, 'Candidat', null, null)
    ).rejects.toMatchObject({ status: 409 });
  });

  // Couvre les lignes 186-188 : UPDATE Organisation / Recruteur vers le nouvel admin
  test("réassigne les orgs à un autre admin et change le rôle avec succès", async () => {
    const [[otherAdmin]] = await DB.query(
      'SELECT id_user FROM Admin WHERE id_user != ? LIMIT 1', [admin2Id]
    );
    if (!otherAdmin) {
      console.warn("⚠️  Pas d'autre admin en BDD — test de réassignation ignoré");
      return;
    }
    await utilisateur.changeRole(admin2Id, 'Candidat', otherAdmin.id_user, otherAdmin.id_user);
    const user = await utilisateur.read(admin2Id);
    expect(user.role).toBe('Candidat');

    const [[org]] = await DB.query(
      'SELECT id_admin_createur FROM Organisation WHERE siren = ?', [SIREN_ADMIN]
    );
    expect(org.id_admin_createur).toBe(otherAdmin.id_user);
  });
});

// ─── candidature.read & candidature.delete ────────────────────────────────────
const candidature = require('../model/candidature');

describe('candidature.read et candidature.delete', () => {
  let candidatureId = null;

  beforeAll(async () => {
    const [[offre]] = await DB.query('SELECT id_offre FROM OffreEmploi LIMIT 1');
    if (!offre) { console.warn('⚠️  Aucune offre en BDD — tests candidature ignorés'); return; }
    candidatureId = await candidature.create(testUserId, offre.id_offre, null, null, null);
  });

  afterAll(async () => {
    if (candidatureId) {
      await DB.query('DELETE FROM Candidature WHERE id_candidature = ?', [candidatureId]);
    }
  });

  test('read retourne la candidature correspondante', async () => {
    if (!candidatureId) return;
    const c = await candidature.read(candidatureId);
    expect(c).toBeDefined();
    expect(c.id_candidature).toBe(candidatureId);
  });

  test('read retourne undefined pour un id inexistant', async () => {
    const c = await candidature.read(999999);
    expect(c).toBeUndefined();
  });

  test('delete supprime la candidature et retourne 1', async () => {
    if (!candidatureId) return;
    const rows = await candidature.delete(candidatureId);
    expect(rows).toBe(1);
    candidatureId = null;
  });
});
