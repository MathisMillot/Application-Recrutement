const db = require('./db');

db.query('ALTER TABLE OffreEmploi ADD COLUMN id_fiche INT DEFAULT NULL').catch(() => {});

module.exports = {

  async readAll() {
    const [rows] = await db.query(`
      SELECT o.id_offre, o.statut, o.date_expiration, o.nb_prises_demandes, o.siren_organisation, o.id_fiche,
             COALESCE(f.intitule, o.description) AS intitule,
             COALESCE(f.lieu, o.localisation) AS lieu,
             COALESCE(f.remote, o.remote) AS remote,
             COALESCE(f.type_contrat, o.type_contrat) AS type_contrat,
             COALESCE(f.salaire_min, o.salaire_min) AS salaire_min,
             f.salaire_max,
             COALESCE(f.photo, o.photo) AS photo,
             org.nom AS organisation, org.photo_profil AS organisation_photo
      FROM OffreEmploi o
      LEFT JOIN FicheDePoste f ON o.id_fiche = f.id_fiche
      JOIN Organisation org ON o.siren_organisation = org.siren
      WHERE org.validation = 'OUI'
    `);
    return rows;
  },

  async filterOffres({ q, localisation, contrat, salaire_min } = {}) {
    const conditions = ["org.validation = 'OUI'"];
    const params = [];
    if (q) {
      conditions.push('(COALESCE(f.intitule, o.description) LIKE ? OR org.nom LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (localisation) {
      conditions.push('COALESCE(f.lieu, o.localisation) LIKE ?');
      params.push(`%${localisation}%`);
    }
    if (contrat) {
      conditions.push('COALESCE(f.type_contrat, o.type_contrat) = ?');
      params.push(contrat);
    }
    const salaire = parseInt(salaire_min, 10);
    if (!isNaN(salaire) && salaire > 0) {
      conditions.push('COALESCE(f.salaire_min, o.salaire_min) >= ?');
      params.push(salaire);
    }
    const where = 'WHERE ' + conditions.join(' AND ');
    const [rows] = await db.query(`
      SELECT o.id_offre, o.statut, o.date_expiration, o.nb_prises_demandes, o.siren_organisation, o.id_fiche,
             COALESCE(f.intitule, o.description) AS intitule,
             COALESCE(f.lieu, o.localisation) AS lieu,
             COALESCE(f.remote, o.remote) AS remote,
             COALESCE(f.type_contrat, o.type_contrat) AS type_contrat,
             COALESCE(f.salaire_min, o.salaire_min) AS salaire_min,
             f.salaire_max,
             COALESCE(f.photo, o.photo) AS photo,
             org.nom AS organisation, org.photo_profil AS organisation_photo
      FROM OffreEmploi o
      LEFT JOIN FicheDePoste f ON o.id_fiche = f.id_fiche
      JOIN Organisation org ON o.siren_organisation = org.siren
      ${where}
    `, params);
    return rows;
  },

  async read(id_offre) {
    const [rows] = await db.query(
      `SELECT o.id_offre, o.statut, o.date_expiration, o.nb_prises_demandes, o.siren_organisation, o.id_fiche,
              f.intitule, f.lieu, f.remote, f.type_contrat, f.salaire_min, f.salaire_max, f.photo,
              f.nom_poste, f.responsable, f.description AS fiche_description,
              org.nom AS organisation, org.photo_profil AS organisation_photo
       FROM OffreEmploi o
       LEFT JOIN FicheDePoste f ON o.id_fiche = f.id_fiche
       LEFT JOIN Organisation org ON o.siren_organisation = org.siren
       WHERE o.id_offre = ?`,
      [id_offre]
    );
    return rows[0];
  },

  async create(statut, date_expiration, id_fiche, siren_organisation) {
    const [result] = await db.query(
      'INSERT INTO OffreEmploi (statut, date_expiration, id_fiche, siren_organisation) VALUES (?, ?, ?, ?)',
      [statut, date_expiration, id_fiche, siren_organisation]
    );
    return result.insertId;
  },

  async update(id_offre, statut, date_expiration) {
    const [result] = await db.query(
      'UPDATE OffreEmploi SET statut=?, date_expiration=? WHERE id_offre=?',
      [statut, date_expiration, id_offre]
    );
    return result.affectedRows;
  },

  async delete(id_offre) {
    await db.query('DELETE dc FROM DocumentsCandidature dc JOIN Candidature c ON dc.id_candidature = c.id_candidature WHERE c.id_offre = ?', [id_offre]);
    await db.query('DELETE FROM Candidature WHERE id_offre = ?', [id_offre]);
    const [result] = await db.query('DELETE FROM OffreEmploi WHERE id_offre = ?', [id_offre]);
    return result.affectedRows;
  },

  async readByOrganisations(sirens) {
    if (!sirens.length) return [];
    const placeholders = sirens.map(() => '?').join(',');
    const [rows] = await db.query(`
      SELECT o.id_offre, o.statut, o.date_expiration, o.nb_prises_demandes, o.siren_organisation, o.id_fiche,
             COALESCE(f.intitule, o.description) AS intitule,
             COALESCE(f.lieu, o.localisation) AS lieu,
             COALESCE(f.remote, o.remote) AS remote,
             COALESCE(f.type_contrat, o.type_contrat) AS type_contrat,
             f.photo,
             org.nom AS organisation, org.photo_profil AS organisation_photo,
             COUNT(c.id_candidature) AS nb_candidatures
      FROM OffreEmploi o
      LEFT JOIN FicheDePoste f ON o.id_fiche = f.id_fiche
      JOIN Organisation org ON o.siren_organisation = org.siren
      LEFT JOIN Candidature c ON c.id_offre = o.id_offre
      WHERE o.siren_organisation IN (${placeholders})
      GROUP BY o.id_offre
      ORDER BY o.date_expiration DESC
    `, sirens);
    return rows;
  }

};
