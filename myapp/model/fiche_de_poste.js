const db = require('./db');

db.query(`CREATE TABLE IF NOT EXISTS FicheDePoste (
  id_fiche INT AUTO_INCREMENT PRIMARY KEY,
  intitule VARCHAR(255) NOT NULL,
  nom_poste VARCHAR(255) NOT NULL,
  responsable VARCHAR(255) NOT NULL,
  lieu VARCHAR(255) NOT NULL,
  salaire_min INT NOT NULL DEFAULT 0,
  salaire_max INT NOT NULL DEFAULT 0,
  description TEXT,
  siren_organisation INT NOT NULL,
  FOREIGN KEY (siren_organisation) REFERENCES Organisation(siren)
)`).catch(db.ignoreKnownMigrationError('FicheDePoste create'));

db.query('ALTER TABLE FicheDePoste ADD COLUMN type_contrat VARCHAR(50) DEFAULT NULL').catch(db.ignoreKnownMigrationError('FicheDePoste.type_contrat'));
db.query('ALTER TABLE FicheDePoste ADD COLUMN remote VARCHAR(50) DEFAULT NULL').catch(db.ignoreKnownMigrationError('FicheDePoste.remote'));
db.query('ALTER TABLE FicheDePoste ADD COLUMN photo VARCHAR(255) DEFAULT NULL').catch(db.ignoreKnownMigrationError('FicheDePoste.photo'));
db.query('ALTER TABLE FicheDePoste ADD COLUMN statut_poste VARCHAR(50) DEFAULT NULL').catch(db.ignoreKnownMigrationError('FicheDePoste.statut_poste'));
db.query('ALTER TABLE FicheDePoste ADD COLUMN type_metier VARCHAR(100) DEFAULT NULL').catch(db.ignoreKnownMigrationError('FicheDePoste.type_metier'));
db.query('ALTER TABLE FicheDePoste ADD COLUMN rythme VARCHAR(100) DEFAULT NULL').catch(db.ignoreKnownMigrationError('FicheDePoste.rythme'));
db.query('ALTER TABLE FicheDePoste ADD COLUMN pieces_demandees TEXT DEFAULT NULL').catch(db.ignoreKnownMigrationError('FicheDePoste.pieces_demandees'));

module.exports = {

  async create(intitule, nom_poste, responsable, lieu, salaire_min, salaire_max, description, type_contrat, remote, photo, siren_organisation, statut_poste, type_metier, rythme, pieces_demandees) {
    const [result] = await db.query(
      'INSERT INTO FicheDePoste (intitule, nom_poste, responsable, lieu, salaire_min, salaire_max, description, type_contrat, remote, photo, siren_organisation, statut_poste, type_metier, rythme, pieces_demandees) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [intitule, nom_poste, responsable, lieu, salaire_min || 0, salaire_max || 0, description || null, type_contrat || null, remote || null, photo || null, siren_organisation, statut_poste || null, type_metier || null, rythme || null, pieces_demandees || null]
    );
    return result.insertId;
  },

  async read(id_fiche) {
    const [rows] = await db.query(
      `SELECT f.*, org.nom AS organisation
       FROM FicheDePoste f
       JOIN Organisation org ON f.siren_organisation = org.siren
       WHERE f.id_fiche = ?`,
      [id_fiche]
    );
    return rows[0];
  },

  async readByOrganisations(sirens) {
    if (!sirens.length) return [];
    const placeholders = sirens.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT f.*, org.nom AS organisation
       FROM FicheDePoste f
       JOIN Organisation org ON f.siren_organisation = org.siren
       WHERE f.siren_organisation IN (${placeholders})
       ORDER BY f.intitule ASC`,
      sirens
    );
    return rows;
  },

  async update(id_fiche, intitule, nom_poste, responsable, lieu, salaire_min, salaire_max, description, type_contrat, remote, statut_poste, type_metier, rythme, pieces_demandees) {
    const [result] = await db.query(
      'UPDATE FicheDePoste SET intitule=?, nom_poste=?, responsable=?, lieu=?, salaire_min=?, salaire_max=?, description=?, type_contrat=?, remote=?, statut_poste=?, type_metier=?, rythme=?, pieces_demandees=? WHERE id_fiche=?',
      [intitule, nom_poste, responsable, lieu, salaire_min || 0, salaire_max || 0, description || null, type_contrat || null, remote || null, statut_poste || null, type_metier || null, rythme || null, pieces_demandees || null, id_fiche]
    );
    return result.affectedRows;
  },

  async delete(id_fiche) {
    const [result] = await db.query('DELETE FROM FicheDePoste WHERE id_fiche = ?', [id_fiche]);
    return result.affectedRows;
  }

};
