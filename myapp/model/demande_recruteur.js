const db = require('./db');

db.query(`
  CREATE TABLE IF NOT EXISTS DemandeRecruteur (
    id_demande INT AUTO_INCREMENT PRIMARY KEY,
    id_candidat INT NOT NULL,
    siren VARCHAR(14) NOT NULL,
    nom_organisation VARCHAR(255) DEFAULT NULL,
    statut ENUM('ATTENTE','ACCEPTEE','REJETEE') NOT NULL DEFAULT 'ATTENTE',
    date_demande DATE NOT NULL DEFAULT (CURDATE()),
    FOREIGN KEY (id_candidat) REFERENCES Utilisateur(id_user)
  )
`).catch(() => {});

module.exports = {

  async create(id_candidat, siren, nom_organisation) {
    const [result] = await db.query(
      'INSERT INTO DemandeRecruteur (id_candidat, siren, nom_organisation) VALUES (?, ?, ?)',
      [id_candidat, siren, nom_organisation || null]
    );
    return result.insertId;
  },

  async hasPending(id_candidat) {
    const [rows] = await db.query(
      "SELECT id_demande FROM DemandeRecruteur WHERE id_candidat = ? AND statut = 'ATTENTE'",
      [id_candidat]
    );
    return rows.length > 0;
  },

  async readPending() {
    const [rows] = await db.query(`
      SELECT d.id_demande, d.siren, d.nom_organisation, d.date_demande,
             u.id_user, u.nom, u.prenom, u.email,
             org.nom AS org_existante
      FROM DemandeRecruteur d
      JOIN Utilisateur u ON d.id_candidat = u.id_user
      LEFT JOIN Organisation org ON d.siren = org.siren
      WHERE d.statut = 'ATTENTE'
      ORDER BY d.date_demande ASC
    `);
    return rows;
  },

  async accept(id_demande) {
    await db.query(
      "UPDATE DemandeRecruteur SET statut='ACCEPTEE' WHERE id_demande=?",
      [id_demande]
    );
  },

  async reject(id_demande) {
    await db.query(
      "UPDATE DemandeRecruteur SET statut='REJETEE' WHERE id_demande=?",
      [id_demande]
    );
  },

  async read(id_demande) {
    const [rows] = await db.query(
      'SELECT * FROM DemandeRecruteur WHERE id_demande = ?',
      [id_demande]
    );
    return rows[0];
  }

};