const db = require('./db');
const bcrypt = require('bcrypt');

db.query('ALTER TABLE Utilisateur ADD COLUMN photo_profil VARCHAR(255) DEFAULT NULL').catch(() => {});


module.exports = {

  async readAll() {
    const [rows] = await db.query(`
      SELECT u.id_user, u.nom, u.prenom, u.email, u.num_tel, u.statut,
        CASE
          WHEN a.id_user IS NOT NULL THEN 'Admin'
          WHEN r.id_user IS NOT NULL THEN 'Recruteur'
          WHEN c.id_user IS NOT NULL THEN 'Candidat'
          ELSE 'Inconnu'
        END AS role
      FROM Utilisateur u
      LEFT JOIN Admin a      ON u.id_user = a.id_user
      LEFT JOIN Recruteur r  ON u.id_user = r.id_user
      LEFT JOIN Candidat c   ON u.id_user = c.id_user
    `);
    return rows;
  },

  async read(id_user) {
    const [rows] = await db.query(`
      SELECT u.*,
        CASE
          WHEN a.id_user IS NOT NULL THEN 'Admin'
          WHEN r.id_user IS NOT NULL THEN 'Recruteur'
          ELSE 'Candidat'
        END AS role
      FROM Utilisateur u
      LEFT JOIN Admin a     ON u.id_user = a.id_user
      LEFT JOIN Recruteur r ON u.id_user = r.id_user
      WHERE u.id_user = ?
    `, [id_user]);
    return rows[0];
  },

  async findByEmail(email) {
    const [rows] = await db.query(
      'SELECT * FROM Utilisateur WHERE email = ?',
      [email]
    );
    return rows[0]; // Retourne l'utilisateur s'il existe, sinon undefined
  },

  async areValid(email, mdp) {
    const [rows] = await db.query(
      'SELECT mdp FROM Utilisateur WHERE email = ?',
      [email]
    );
    return rows.length === 1 && rows[0].mdp === mdp;
  },

  async findByCredentials(email, mdp) {//change name
    const [rows] = await db.query(`
      SELECT u.id_user, u.nom, u.prenom, u.email, u.num_tel, u.statut, u.photo_profil, u.mdp,
        CASE
          WHEN a.id_user IS NOT NULL THEN 'Admin'
          WHEN r.id_user IS NOT NULL THEN 'Recruteur'
          ELSE 'Candidat'
        END AS role
      FROM Utilisateur u
      LEFT JOIN Admin a     ON u.id_user = a.id_user
      LEFT JOIN Recruteur r ON u.id_user = r.id_user
      WHERE u.email = ?
    `, [email]);
    if (!rows[0]) return null;
    const valide = await bcrypt.compare(mdp, rows[0].mdp);
    if (!valide) return null;
    const { mdp: _, ...user } = rows[0];
    return user;
  },

  async create(nom, prenom, email, mdp, num_tel) {
    const hash = await bcrypt.hash(mdp, 10); // hash le mdp avant stockage
    const [result] = await db.query(
      'INSERT INTO Utilisateur (nom, prenom, email, mdp, num_tel, statut) VALUES (?, ?, ?, ?, ?, ?)',
      [nom, prenom, email, hash, num_tel, 'ACTIF']
    );
    const id_user = result.insertId;
    await db.query('INSERT INTO Candidat (id_user) VALUES (?)', [id_user]);
    return id_user;
  },

  async update(id_user, nom, prenom, email, num_tel) {
    const [result] = await db.query(
      'UPDATE Utilisateur SET nom = ?, prenom = ?, email = ?, num_tel = ? WHERE id_user = ?',
      [nom, prenom, email, num_tel, id_user]
    );
    return result.affectedRows;
  },

  async getDocuments(id_user) {
    const [rows] = await db.query(
      'SELECT documents FROM Candidat WHERE id_user = ?',
      [id_user]
    );
    if (!rows[0] || !rows[0].documents) return [];
    return JSON.parse(rows[0].documents);
  },

  async addDocument(id_user, filename) {
    const docs = await this.getDocuments(id_user);
    docs.push(filename);
    await db.query(
      'INSERT INTO Candidat (id_user, documents) VALUES (?, ?) ON DUPLICATE KEY UPDATE documents = ?',
      [id_user, JSON.stringify(docs), JSON.stringify(docs)]
    );
  },

  async findOrCreateByGoogle(profile) {
    const email = profile.emails[0].value;
    const [rows] = await db.query(`
      SELECT u.id_user, u.nom, u.prenom, u.email, u.num_tel, u.statut, u.photo_profil,
        CASE
          WHEN a.id_user IS NOT NULL THEN 'Admin'
          WHEN r.id_user IS NOT NULL THEN 'Recruteur'
          ELSE 'Candidat'
        END AS role
      FROM Utilisateur u
      LEFT JOIN Admin a     ON u.id_user = a.id_user
      LEFT JOIN Recruteur r ON u.id_user = r.id_user
      WHERE u.email = ?
    `, [email]);
    if (rows[0]) return rows[0];
    const nom = profile.name.familyName || '';
    const prenom = profile.name.givenName || '';
    const [result] = await db.query(
      'INSERT INTO Utilisateur (nom, prenom, email, mdp, num_tel, statut) VALUES (?, ?, ?, ?, ?, ?)',
      [nom, prenom, email, '', '', 'ACTIF']
    );
    const id_user = result.insertId;
    await db.query('INSERT INTO Candidat (id_user) VALUES (?)', [id_user]);
    return { id_user, nom, prenom, email, num_tel: '', statut: 'ACTIF', photo_profil: null, role: 'Candidat' };
  },

  async setPhoto(id_user, filename) {
    await db.query('UPDATE Utilisateur SET photo_profil = ? WHERE id_user = ?', [filename, id_user]);
  },

  async setStatut(id_user, statut) {
    const [result] = await db.query(
      'UPDATE Utilisateur SET statut = ? WHERE id_user = ?',
      [statut, id_user]
    );
    return result.affectedRows;
  },

  async createRecruteur(nom, prenom, email, mdp, num_tel, siren_organisation, nom_organisation) {
    const hash = await bcrypt.hash(mdp, 10);
    const [result] = await db.query(
      'INSERT INTO Utilisateur (nom, prenom, email, mdp, num_tel, statut) VALUES (?, ?, ?, ?, ?, ?)',
      [nom, prenom, email, hash, num_tel, 'ACTIF']
    );
    const id_user = result.insertId;
    const [[firstAdmin]] = await db.query('SELECT id_user FROM Admin LIMIT 1');
    const validateur = firstAdmin ? firstAdmin.id_user : null;
    await db.query('INSERT INTO Recruteur (id_user, id_admin_validateur) VALUES (?, ?)', [id_user, validateur]);
    if (siren_organisation) {
      const [existing] = await db.query('SELECT siren FROM Organisation WHERE siren = ?', [siren_organisation]);
      if (!existing.length && nom_organisation) {
        await db.query(
          'INSERT INTO Organisation (siren, nom, type, siege_social, validation, id_admin_createur) VALUES (?, ?, ?, ?, ?, ?)',
          [siren_organisation, nom_organisation, 'Entreprise', '', 'ATTENTE', validateur]
        );
      }
      await db.query('INSERT INTO Appartient (id_recruteur, siren_organisation) VALUES (?, ?)', [id_user, siren_organisation]);
    }
    return id_user;
  },

  async changeRole(id_user, newRole, newAdminId, validatorAdminId) {
    const [orgs] = await db.query('SELECT COUNT(*) AS n FROM Organisation WHERE id_admin_createur = ?', [id_user]);
    const [recs] = await db.query('SELECT COUNT(*) AS n FROM Recruteur WHERE id_admin_validateur = ?', [id_user]);
    if (orgs[0].n > 0 || recs[0].n > 0) {
      if (!newAdminId) {
        const err = new Error(`Cet admin est lié à ${orgs[0].n} organisation(s) et ${recs[0].n} recruteur(s). Choisissez un admin pour les réassigner.`);
        err.status = 409;
        throw err;
      }
      if (orgs[0].n > 0)
        await db.query('UPDATE Organisation SET id_admin_createur = ? WHERE id_admin_createur = ?', [newAdminId, id_user]);
      if (recs[0].n > 0)
        await db.query('UPDATE Recruteur SET id_admin_validateur = ? WHERE id_admin_validateur = ?', [newAdminId, id_user]);
    }
    await db.query('DELETE FROM Candidature WHERE id_candidat = ?', [id_user]);
    await db.query('DELETE FROM Appartient WHERE id_recruteur = ?', [id_user]);
    await db.query('DELETE FROM Admin WHERE id_user = ?', [id_user]);
    await db.query('DELETE FROM Recruteur WHERE id_user = ?', [id_user]);
    await db.query('DELETE FROM Candidat WHERE id_user = ?', [id_user]);
    if (newRole === 'Admin') {
      await db.query('INSERT INTO Admin (id_user) VALUES (?)', [id_user]);
    } else if (newRole === 'Recruteur') {
      await db.query('INSERT INTO Recruteur (id_user, id_admin_validateur) VALUES (?, ?)', [id_user, validatorAdminId]);
    } else {
      await db.query('INSERT INTO Candidat (id_user) VALUES (?)', [id_user]);
    }
  }

};
