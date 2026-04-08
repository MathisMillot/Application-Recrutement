const db = require('./db');

module.exports = {

  async readAll() {
    const [rows] = await db.query(`
      SELECT o.id_offre, o.statut, o.date_expiration, o.description,
             o.nb_prises_demandes, org.nom AS organisation
      FROM OffreEmploi o
      JOIN Organisation org ON o.siren_organisation = org.siren
    `);
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
  }

};
