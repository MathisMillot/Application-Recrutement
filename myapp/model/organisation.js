const db = require('./db');

db.query('ALTER TABLE Organisation ADD COLUMN photo_profil VARCHAR(255) DEFAULT NULL').catch(db.ignoreKnownMigrationError('Organisation.photo_profil'));
db.query('ALTER TABLE Organisation MODIFY COLUMN id_admin_createur INT DEFAULT NULL').catch(db.ignoreKnownMigrationError('Organisation.id_admin_createur'));
db.query("UPDATE Organisation SET validation = 'OUI' WHERE validation = 'ATTENTE' AND id_admin_createur IS NOT NULL").catch(db.ignoreKnownMigrationError('Organisation.validation backfill'));
db.query("ALTER TABLE Appartient ADD COLUMN statut VARCHAR(10) NOT NULL DEFAULT 'ACCEPTEE'").catch(db.ignoreKnownMigrationError('Appartient.statut'));
db.query(`CREATE TABLE IF NOT EXISTS DemandeSuppressionOrg (
  id_demande         INT          AUTO_INCREMENT PRIMARY KEY,
  siren_organisation INT          NOT NULL,
  id_recruteur       INT          NOT NULL,
  date_demande       DATE         NOT NULL,
  statut             VARCHAR(10)  NOT NULL DEFAULT 'ATTENTE',
  FOREIGN KEY (siren_organisation) REFERENCES Organisation(siren),
  FOREIGN KEY (id_recruteur)       REFERENCES Recruteur(id_user)
)`).catch(db.ignoreKnownMigrationError('DemandeSuppressionOrg create'));

module.exports = {

  async readAll() {
    const [rows] = await db.query('SELECT * FROM Organisation');
    return rows;
  },

  async readAllWithCount(q) {
    const conditions = ["org.validation = 'OUI'"];
    const params = [];
    if (q) { conditions.push('org.nom LIKE ?'); params.push(`%${q}%`); }
    const where = 'WHERE ' + conditions.join(' AND ');
    const [rows] = await db.query(`
      SELECT org.*, COUNT(o.id_offre) AS nb_offres
      FROM Organisation org
      LEFT JOIN OffreEmploi o ON o.siren_organisation = org.siren
      ${where}
      GROUP BY org.siren
      ORDER BY org.nom ASC
    `, params);
    return rows;
  },

  async readPending() {
    const [rows] = await db.query(`
      SELECT org.*,
             u.nom AS recruteur_nom, u.prenom AS recruteur_prenom, u.email AS recruteur_email
      FROM Organisation org
      LEFT JOIN Appartient a ON org.siren = a.siren_organisation
      LEFT JOIN Utilisateur u ON a.id_recruteur = u.id_user
      WHERE org.validation = 'ATTENTE'
      GROUP BY org.siren
      ORDER BY org.nom ASC
    `);
    return rows;
  },

  async read(siren) {
    const [rows] = await db.query(
      'SELECT * FROM Organisation WHERE siren = ?',
      [siren]
    );
    return rows[0];
  },

  async create(siren, nom, type, siege_social, id_admin_createur) {
    const [result] = await db.query(
      'INSERT INTO Organisation (siren, nom, type, siege_social, validation, id_admin_createur) VALUES (?, ?, ?, ?, ?, ?)',
      [siren, nom, type, siege_social, 'ATTENTE', id_admin_createur]
    );
    return result.affectedRows;
  },

  async setValidation(siren, validation) {
    const [result] = await db.query(
      'UPDATE Organisation SET validation = ? WHERE siren = ?',
      [validation, siren]
    );
    return result.affectedRows;
  },

  async readByRecruteur(id_recruteur) {
    const [rows] = await db.query(`
      SELECT org.*
      FROM Organisation org
      JOIN Appartient a ON org.siren = a.siren_organisation
      WHERE a.id_recruteur = ? AND a.statut = 'ACCEPTEE'
    `, [id_recruteur]);
    return rows;
  },

  async readAllByRecruteur(id_recruteur) {
    const [rows] = await db.query(`
      SELECT org.*, a.statut AS adhesion_statut
      FROM Organisation org
      JOIN Appartient a ON org.siren = a.siren_organisation
      WHERE a.id_recruteur = ?
      ORDER BY FIELD(a.statut, 'ACCEPTEE', 'ATTENTE') ASC, org.nom ASC
    `, [id_recruteur]);
    return rows;
  },

  async readValidatedExcluding(id_recruteur) {
    const [rows] = await db.query(`
      SELECT org.*
      FROM Organisation org
      WHERE org.validation = 'OUI'
        AND org.siren NOT IN (
          SELECT siren_organisation FROM Appartient WHERE id_recruteur = ?
        )
      ORDER BY org.nom ASC
    `, [id_recruteur]);
    return rows;
  },

  async requestJoin(siren, id_recruteur) {
    await db.query(
      "INSERT INTO Appartient (id_recruteur, siren_organisation, statut) VALUES (?, ?, 'ATTENTE')",
      [id_recruteur, siren]
    );
  },

  async readPendingJoins() {
    const [rows] = await db.query(`
      SELECT a.id_recruteur, a.siren_organisation,
             org.nom AS org_nom, org.type AS org_type,
             u.nom AS recruteur_nom, u.prenom AS recruteur_prenom, u.email AS recruteur_email
      FROM Appartient a
      JOIN Organisation org ON a.siren_organisation = org.siren
      JOIN Utilisateur u ON a.id_recruteur = u.id_user
      WHERE a.statut = 'ATTENTE'
      ORDER BY org.nom ASC
    `);
    return rows;
  },

  async approveJoin(siren, id_recruteur) {
    await db.query(
      "UPDATE Appartient SET statut='ACCEPTEE' WHERE siren_organisation=? AND id_recruteur=?",
      [siren, id_recruteur]
    );
  },

  async rejectJoin(siren, id_recruteur) {
    await db.query(
      'DELETE FROM Appartient WHERE siren_organisation=? AND id_recruteur=?',
      [siren, id_recruteur]
    );
  },

  async setPhoto(siren, filename) {
    await db.query('UPDATE Organisation SET photo_profil = ? WHERE siren = ?', [filename, siren]);
  },

  async addRecruteur(siren, id_recruteur) {
    await db.query(
      "INSERT INTO Appartient (id_recruteur, siren_organisation, statut) VALUES (?, ?, 'ACCEPTEE') ON DUPLICATE KEY UPDATE statut='ACCEPTEE'",
      [id_recruteur, siren]
    );
  },

  async requestDeletion(siren, id_recruteur) {
    await db.query(
      "INSERT INTO DemandeSuppressionOrg (siren_organisation, id_recruteur, date_demande, statut) VALUES (?, ?, CURDATE(), 'ATTENTE')",
      [siren, id_recruteur]
    );
  },

  async hasPendingDeletion(siren, id_recruteur) {
    const [rows] = await db.query(
      "SELECT 1 FROM DemandeSuppressionOrg WHERE siren_organisation = ? AND id_recruteur = ? AND statut = 'ATTENTE' LIMIT 1",
      [siren, id_recruteur]
    );
    return rows.length > 0;
  },

  async pendingDeletionSirens(id_recruteur) {
    const [rows] = await db.query(
      "SELECT siren_organisation FROM DemandeSuppressionOrg WHERE id_recruteur = ? AND statut = 'ATTENTE'",
      [id_recruteur]
    );
    return rows.map(r => String(r.siren_organisation));
  },

  async readPendingDeletions() {
    const [rows] = await db.query(`
      SELECT d.id_demande, d.siren_organisation, d.date_demande,
             org.nom AS org_nom, org.type AS org_type,
             u.nom AS recruteur_nom, u.prenom AS recruteur_prenom, u.email AS recruteur_email
      FROM DemandeSuppressionOrg d
      JOIN Organisation org ON d.siren_organisation = org.siren
      JOIN Utilisateur u   ON d.id_recruteur = u.id_user
      WHERE d.statut = 'ATTENTE'
      ORDER BY d.date_demande DESC
    `);
    return rows;
  },

  async acceptDeletion(id_demande) {
    await db.query(
      "UPDATE DemandeSuppressionOrg SET statut = 'ACCEPTEE' WHERE id_demande = ?",
      [id_demande]
    );
  },

  async rejectDeletion(id_demande) {
    await db.query(
      "UPDATE DemandeSuppressionOrg SET statut = 'REJETEE' WHERE id_demande = ?",
      [id_demande]
    );
  },

  async deleteOrg(siren) {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      await conn.query(`DELETE dc FROM DocumentsCandidature dc
        JOIN Candidature c ON dc.id_candidature = c.id_candidature
        JOIN OffreEmploi o ON c.id_offre = o.id_offre
        WHERE o.siren_organisation = ?`, [siren]);
      await conn.query(`DELETE c FROM Candidature c
        JOIN OffreEmploi o ON c.id_offre = o.id_offre
        WHERE o.siren_organisation = ?`, [siren]);
      await conn.query('DELETE FROM OffreEmploi WHERE siren_organisation = ?', [siren]);
      await conn.query('DELETE FROM FicheDePoste WHERE siren_organisation = ?', [siren]);
      await conn.query('DELETE FROM Appartient WHERE siren_organisation = ?', [siren]);
      await conn.query('DELETE FROM DemandeSuppressionOrg WHERE siren_organisation = ?', [siren]);
      await conn.query('DELETE FROM Organisation WHERE siren = ?', [siren]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

};
