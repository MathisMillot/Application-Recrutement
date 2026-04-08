const db = require('./db');

module.exports = {

  async readAll() {
    const [rows] = await db.query(`
      SELECT c.id_candidature, c.date,
             u.nom, u.prenom, u.email,
             o.id_offre, o.description AS offre_description
      FROM Candidature c
      JOIN Candidat ca  ON c.id_candidat = ca.id_user
      JOIN Utilisateur u ON ca.id_user = u.id_user
      LEFT JOIN OffreEmploi o ON c.id_offre = o.id_offre
    `);
    return rows;
  },

  async readByCandidat(id_candidat) {
    const [rows] = await db.query(
      `SELECT c.id_candidature, c.date, c.id_candidat, c.id_offre, o.description AS offre_description
       FROM Candidature c
       LEFT JOIN OffreEmploi o ON c.id_offre = o.id_offre
       WHERE c.id_candidat = ?`,
      [id_candidat]
    );
    return rows;
  },

  async read(id_candidature) {
    const [rows] = await db.query(
      'SELECT * FROM Candidature WHERE id_candidature = ?',
      [id_candidature]
    );
    return rows[0];
  },

  async create(id_candidat, id_offre) {
    const [result] = await db.query(
      'INSERT INTO Candidature (date, id_candidat, id_offre) VALUES (CURDATE(), ?, ?)',
      [id_candidat, id_offre]
    );
    return result.insertId;
  },

  async delete(id_candidature) {
    const [result] = await db.query(
      'DELETE FROM Candidature WHERE id_candidature = ?',
      [id_candidature]
    );
    return result.affectedRows;
  }

};
