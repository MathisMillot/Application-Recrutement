require('dotenv').config();
var mysql = require('mysql2');

var db = mysql.createConnection({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

function getAllUsers(callback) {
  var sql = `
    SELECT u.id_user, u.nom, u.prenom, u.email, u.statut,
      CASE
        WHEN a.id_user IS NOT NULL THEN 'Admin'
        WHEN r.id_user IS NOT NULL THEN 'Recruteur'
        WHEN c.id_user IS NOT NULL THEN 'Candidat'
        ELSE 'Inconnu'
      END AS role
    FROM Utilisateur u
    LEFT JOIN Admin a ON u.id_user = a.id_user
    LEFT JOIN Recruteur r ON u.id_user = r.id_user
    LEFT JOIN Candidat c ON u.id_user = c.id_user
  `;
  db.query(sql, callback);
}

module.exports = { getAllUsers };
