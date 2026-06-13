const multer = require('multer');
const path = require('path');
const fs = require('fs'); // On importe le module 'fs' (File System)

// On définit le chemin absolu du dossier d'upload
const uploadDir = path.join(__dirname, '../public/uploads');

// On vérifie si le dossier existe, sinon on le crée automatiquement
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Assainit le nom de fichier fourni par l'utilisateur : on ne conserve que le
// basename (élimine tout composant de chemin pour empêcher la traversée de
// répertoires) et on supprime tout caractère non sûr.
function sanitizeName(originalname) {
  const base = path.basename(originalname || '');
  const ext = path.extname(base).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const stem = path.basename(base, path.extname(base))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80) || 'fichier';
  return stem + ext;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // On utilise notre chemin sécurisé
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + sanitizeName(file.originalname);
    cb(null, unique);
  }
});

const DOCUMENT_MIMES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const IMAGE_MIMES    = ['image/jpeg', 'image/png', 'image/webp'];

// Restreint l'extension à une liste blanche fixe pour que path.extname ne
// puisse jamais produire une séquence de traversée ou une double extension.
function safeImageExt(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
}

const fileFilter = function (req, file, cb) {
  const allowed = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext) && DOCUMENT_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Seuls les fichiers PDF et Word sont acceptés'));
  }
};

const imageFilter = function (req, file, cb) {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext) && IMAGE_MIMES.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Seuls les fichiers image sont acceptés'));
};

// Photo de profil utilisateur, un fichier par utilisateur (écrase l'ancien à la mise à jour)
const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    if (!req.session || !req.session.user) return cb(new Error('Non authentifié'));
    // id_user est toujours un entier issu de la BDD, mais on coerce par sécurité.
    const id = String(parseInt(req.session.user.id_user, 10));
    cb(null, 'avatar-' + id + safeImageExt(file.originalname));
  }
});

// Logo organisation, un fichier par SIREN (écrase l'ancien à la mise à jour)
const orgStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    // Le SIREN vient de l'URL : on ne conserve que les chiffres pour qu'il ne
    // puisse jamais injecter de séparateurs de chemin dans le nom de fichier.
    const siren = String(req.params.siren || '').replace(/[^0-9]/g, '');
    if (!siren) return cb(new Error('SIREN invalide'));
    cb(null, 'org-' + siren + safeImageExt(file.originalname));
  }
});

// Photo d'offre, fichier unique par upload 
const offerStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    cb(null, 'offer-' + Date.now() + '-' + Math.random().toString(36).slice(2) + safeImageExt(file.originalname));
  }
});

const DOC_SIZE_LIMIT   = 10 * 1024 * 1024; // 10 Mo
const IMAGE_SIZE_LIMIT =  5 * 1024 * 1024; //  5 Mo

const documentUpload = multer({ storage, fileFilter, limits: { fileSize: DOC_SIZE_LIMIT } });
module.exports = documentUpload;
module.exports.avatar = multer({ storage: avatarStorage, fileFilter: imageFilter, limits: { fileSize: IMAGE_SIZE_LIMIT } });
module.exports.org    = multer({ storage: orgStorage,    fileFilter: imageFilter, limits: { fileSize: IMAGE_SIZE_LIMIT } });
module.exports.offer  = multer({ storage: offerStorage,  fileFilter: imageFilter, limits: { fileSize: IMAGE_SIZE_LIMIT } });