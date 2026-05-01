const multer = require('multer');
const path = require('path');
const fs = require('fs'); // On importe le module 'fs' (File System)

// On définit le chemin absolu du dossier d'upload
const uploadDir = path.join(__dirname, '../public/uploads');

// On vérifie si le dossier existe, sinon on le crée automatiquement
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // On utilise notre chemin sécurisé
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + file.originalname;
    cb(null, unique);
  }
});

const fileFilter = function (req, file, cb) {
  const allowed = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Seuls les fichiers PDF et Word sont acceptés'));
  }
};

module.exports = multer({ storage, fileFilter });