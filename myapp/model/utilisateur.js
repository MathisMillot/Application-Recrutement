const db = require('./db');
const bcrypt = require('bcrypt');

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

  async findByCredentials(email, mdp) {
    // on récupère d'abord le hash stocké, puis on compare avec bcrypt
    const [rows] = await db.query(
      'SELECT id_user, nom, prenom, email, num_tel, statut, mdp FROM Utilisateur WHERE email = ?',
      [email]
    );
    if (!rows[0]) return null;
    const valide = await bcrypt.compare(mdp, rows[0].mdp);
    if (!valide) return null;
    const { mdp: _, ...user } = rows[0]; // on ne retourne pas le hash
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

  async setStatut(id_user, statut) {
    const [result] = await db.query(
      'UPDATE Utilisateur SET statut = ? WHERE id_user = ?',
      [statut, id_user]
    );
    return result.affectedRows;
  }

};
