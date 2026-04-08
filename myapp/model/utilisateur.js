const db = require('./db');

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
    const [rows] = await db.query(
      'SELECT * FROM Utilisateur WHERE id_user = ?',
      [id_user]
    );
    return rows[0];
  },

  async areValid(email, mdp) {
    const [rows] = await db.query(
      'SELECT mdp FROM Utilisateur WHERE email = ?',
      [email]
    );
    return rows.length === 1 && rows[0].mdp === mdp;
  },

  async create(nom, prenom, email, mdp, num_tel) {
    const [result] = await db.query(
      'INSERT INTO Utilisateur (nom, prenom, email, mdp, num_tel, statut) VALUES (?, ?, ?, ?, ?, ?)',
      [nom, prenom, email, mdp, num_tel, 'ACTIF']
    );
    return result.insertId;
  },

  async update(id_user, nom, prenom, email, num_tel) {
    const [result] = await db.query(
      'UPDATE Utilisateur SET nom = ?, prenom = ?, email = ?, num_tel = ? WHERE id_user = ?',
      [nom, prenom, email, num_tel, id_user]
    );
    return result.affectedRows;
  },

  async setStatut(id_user, statut) {
    const [result] = await db.query(
      'UPDATE Utilisateur SET statut = ? WHERE id_user = ?',
      [statut, id_user]
    );
    return result.affectedRows;
  }

};
