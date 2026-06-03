const db = require('./db');

module.exports = {

  async readAll() {
    const [rows] = await db.query(`
      SELECT c.id_candidature, c.date,
             u.nom, u.prenom, u.email,
             o.id_offre, COALESCE(f.intitule, o.description) AS offre_description
      FROM Candidature c
      JOIN Candidat ca  ON c.id_candidat = ca.id_user
      JOIN Utilisateur u ON ca.id_user = u.id_user
      LEFT JOIN OffreEmploi o ON c.id_offre = o.id_offre
      LEFT JOIN FicheDePoste f ON o.id_fiche = f.id_fiche
    `);
    return rows;
  },

  async readByCandidat(id_candidat) {
    const [rows] = await db.query(
      `SELECT c.id_candidature, c.date, c.id_candidat, c.id_offre,
              COALESCE(f.intitule, o.description) AS offre_description, o.statut,
              org.nom AS organisation, org.photo_profil AS organisation_photo,
              COALESCE(f.photo, o.photo) AS photo,
              COALESCE(f.lieu, o.localisation) AS lieu,
              COALESCE(f.type_contrat, o.type_contrat) AS type_contrat,
              COALESCE(f.remote, o.remote) AS remote
       FROM Candidature c
       LEFT JOIN OffreEmploi o ON c.id_offre = o.id_offre
       LEFT JOIN FicheDePoste f ON o.id_fiche = f.id_fiche
       LEFT JOIN Organisation org ON o.siren_organisation = org.siren
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

  async existsForOffre(id_candidat, id_offre) {
    const [rows] = await db.query(
      'SELECT 1 FROM Candidature WHERE id_candidat = ? AND id_offre = ? LIMIT 1',
      [id_candidat, id_offre]
    );
    return rows.length > 0;
  },

  async create(id_candidat, id_offre, cv, lm, dispo) {
    const [result] = await db.query(
      'INSERT INTO Candidature (date, id_candidat, id_offre, cv, lm, dispo) VALUES (CURDATE(), ?, ?, ?, ?, ?)',
      [id_candidat, id_offre, cv || null, lm || null, dispo || null]
    );
    return result.insertId;
  },

  async update(id_candidature, cv, lm, dispo) {
    const sets = [];
    const vals = [];
    if (cv !== undefined) { sets.push('cv = ?'); vals.push(cv || null); }
    if (lm !== undefined) { sets.push('lm = ?'); vals.push(lm || null); }
    if (dispo !== undefined) { sets.push('dispo = ?'); vals.push(dispo || null); }
    if (!sets.length) return 0;
    vals.push(id_candidature);
    const [result] = await db.query(`UPDATE Candidature SET ${sets.join(', ')} WHERE id_candidature = ?`, vals);
    return result.affectedRows;
  },

  async delete(id_candidature) {
    const [result] = await db.query(
      'DELETE FROM Candidature WHERE id_candidature = ?',
      [id_candidature]
    );
    return result.affectedRows;
  },

  async readByOffre(id_offre) {
    const [rows] = await db.query(`
      SELECT c.id_candidature, c.date, c.cv, c.lm, c.dispo,
             u.id_user, u.nom, u.prenom, u.email, u.num_tel, u.photo_profil
      FROM Candidature c
      JOIN Candidat ca ON c.id_candidat = ca.id_user
      JOIN Utilisateur u ON ca.id_user = u.id_user
      WHERE c.id_offre = ?
      ORDER BY c.date DESC
    `, [id_offre]);
    return rows;
  }

};
