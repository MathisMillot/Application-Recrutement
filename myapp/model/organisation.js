const db = require('./db');

db.query('ALTER TABLE Organisation ADD COLUMN photo_profil VARCHAR(255) DEFAULT NULL').catch(() => {});
db.query('ALTER TABLE Organisation MODIFY COLUMN id_admin_createur INT DEFAULT NULL').catch(() => {});
// Orgs created by an admin before the approval flow existed: auto-validate them
db.query("UPDATE Organisation SET validation = 'OUI' WHERE validation = 'ATTENTE' AND id_admin_createur IS NOT NULL").catch(() => {});

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
      WHERE a.id_recruteur = ?
    `, [id_recruteur]);
    return rows;
  },

  async setPhoto(siren, filename) {
    await db.query('UPDATE Organisation SET photo_profil = ? WHERE siren = ?', [filename, siren]);
  },

  async addRecruteur(siren, id_recruteur) {
    await db.query(
      'INSERT IGNORE INTO Appartient (id_recruteur, siren_organisation) VALUES (?, ?)',
      [id_recruteur, siren]
    );
  }

};
