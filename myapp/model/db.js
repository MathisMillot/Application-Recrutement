require('dotenv').config();
const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Helper pour les migrations « best-effort » exécutées au require-time.
// Ignore silencieusement les erreurs attendues (colonne/table déjà présente)
// mais journalise toute autre erreur (perte de connexion, droits manquants…)
// au lieu de les avaler complètement.
const IGNORABLE_MIGRATION_ERRORS = [
  'Duplicate column',
  'already exists',
  "Can't DROP",
  'check that column/key exists',
  'Duplicate key name',
];
db.ignoreKnownMigrationError = function (context) {
  return function (err) {
    if (!err || !err.message) return;
    if (IGNORABLE_MIGRATION_ERRORS.some((m) => err.message.includes(m))) return;
    console.warn('Migration (' + context + '):', err.message);
  };
};

module.exports = db;
