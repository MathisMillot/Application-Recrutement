const db = require('./db');

db.query('ALTER TABLE OffreEmploi ADD COLUMN localisation VARCHAR(255) DEFAULT NULL').catch(() => {});
db.query('ALTER TABLE OffreEmploi ADD COLUMN remote VARCHAR(50) DEFAULT NULL').catch(() => {});
db.query('ALTER TABLE OffreEmploi ADD COLUMN photo VARCHAR(255) DEFAULT NULL').catch(() => {});
db.query('ALTER TABLE OffreEmploi ADD COLUMN type_contrat VARCHAR(50) DEFAULT NULL').catch(() => {});
db.query('ALTER TABLE OffreEmploi ADD COLUMN salaire_min INT DEFAULT NULL').catch(() => {});

module.exports = {

  async readAll() {
    const [rows] = await db.query(`
      SELECT o.id_offre, o.statut, o.date_expiration, o.description,
             o.nb_prises_demandes, o.localisation, o.remote, o.photo,
             o.type_contrat, o.salaire_min,
             org.nom AS organisation, org.photo_profil AS organisation_photo
      FROM OffreEmploi o
      JOIN Organisation org ON o.siren_organisation = org.siren
      WHERE org.validation = 'OUI'
    `);
    return rows;
  },

  async searchOffres(keyword) {
    const searchTerm = `%${keyword}%`;
    const [rows] = await db.query(`
      SELECT o.id_offre, o.statut, o.date_expiration, o.description,
             o.nb_prises_demandes, o.localisation, o.remote, o.photo,
             o.type_contrat, o.salaire_min,
             org.nom AS organisation, org.photo_profil AS organisation_photo
      FROM OffreEmploi o
      JOIN Organisation org ON o.siren_organisation = org.siren
      WHERE o.description LIKE ? OR org.nom LIKE ?
    `, [searchTerm, searchTerm]);
    return rows;
  },

  async filterOffres({ q, localisation, contrat, salaire_min } = {}) {
    const conditions = ["org.validation = 'OUI'"];
    const params = [];
    if (q) {
      conditions.push('(o.description LIKE ? OR org.nom LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (localisation) {
      conditions.push('o.localisation LIKE ?');
      params.push(`%${localisation}%`);
    }
    if (contrat) {
      conditions.push('o.type_contrat = ?');
      params.push(contrat);
    }
    if (salaire_min) {
      conditions.push('o.salaire_min >= ?');
      params.push(Number(salaire_min));
    }
    const where = 'WHERE ' + conditions.join(' AND ');
    const [rows] = await db.query(`
      SELECT o.id_offre, o.statut, o.date_expiration, o.description,
             o.nb_prises_demandes, o.localisation, o.remote, o.photo,
             o.type_contrat, o.salaire_min,
             org.nom AS organisation, org.photo_profil AS organisation_photo
      FROM OffreEmploi o
      JOIN Organisation org ON o.siren_organisation = org.siren
      ${where}
    `, params);
    return rows;
  },

  async read(id_offre) {
    const [rows] = await db.query(
      `SELECT o.*, org.nom AS organisation
       FROM OffreEmploi o
       JOIN Organisation org ON o.siren_organisation = org.siren
       WHERE o.id_offre = ?`,
      [id_offre]
    );
    return rows[0];
  },

  async create(statut, date_expiration, description, siren_organisation) {
    const [result] = await db.query(
      'INSERT INTO OffreEmploi (statut, date_expiration, description, siren_organisation) VALUES (?, ?, ?, ?)',
      [statut, date_expiration, description, siren_organisation]
    );
    return result.insertId;
  },

  async update(id_offre, statut, date_expiration, description) {
    const [result] = await db.query(
      'UPDATE OffreEmploi SET statut = ?, date_expiration = ?, description = ? WHERE id_offre = ?',
      [statut, date_expiration, description, id_offre]
    );
    return result.affectedRows;
  },

  async delete(id_offre) {
    const [result] = await db.query(
      'DELETE FROM OffreEmploi WHERE id_offre = ?',
      [id_offre]
    );
    return result.affectedRows;
  },

  async readByOrganisations(sirens) {
    if (!sirens.length) return [];
    const placeholders = sirens.map(() => '?').join(',');
    const [rows] = await db.query(`
      SELECT o.id_offre, o.statut, o.date_expiration, o.description,
             o.nb_prises_demandes, o.localisation, o.remote, o.photo,
             org.nom AS organisation, org.photo_profil AS organisation_photo,
             o.siren_organisation,
             COUNT(c.id_candidature) AS nb_candidatures
      FROM OffreEmploi o
      JOIN Organisation org ON o.siren_organisation = org.siren
      LEFT JOIN Candidature c ON c.id_offre = o.id_offre
      WHERE o.siren_organisation IN (${placeholders})
      GROUP BY o.id_offre
      ORDER BY o.date_expiration DESC
    `, sirens);
    return rows;
  },

  async createFull(statut, date_expiration, description, localisation, remote, siren_organisation, photo, type_contrat, salaire_min) {
    const [result] = await db.query(
      'INSERT INTO OffreEmploi (statut, date_expiration, description, localisation, remote, siren_organisation, photo, type_contrat, salaire_min) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [statut, date_expiration, description, localisation, remote, siren_organisation, photo || null, type_contrat || null, salaire_min || null]
    );
    return result.insertId;
  }

};
