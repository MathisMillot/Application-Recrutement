const db = require('./db');

module.exports = {

  async readAll() {
    const [rows] = await db.query('SELECT * FROM Organisation');
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
  }

};
