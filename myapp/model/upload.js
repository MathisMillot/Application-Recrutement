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

const DOCUMENT_MIMES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const IMAGE_MIMES    = ['image/jpeg', 'image/png', 'image/webp'];

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

// User profile photo  one file per user (overwrite on update)
const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'avatar-' + req.session.user.id_user + ext);
  }
});

// Organisation logo one file per org SIREN (overwrite on update)
const orgStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'org-' + req.params.siren + ext);
  }
});

// Offer photo unique file per upload (timestamp-based)
const offerStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'offer-' + Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
  }
});

const DOC_SIZE_LIMIT   = 10 * 1024 * 1024; // 10 MB
const IMAGE_SIZE_LIMIT =  5 * 1024 * 1024; //  5 MB

const documentUpload = multer({ storage, fileFilter, limits: { fileSize: DOC_SIZE_LIMIT } });
module.exports = documentUpload;
module.exports.avatar = multer({ storage: avatarStorage, fileFilter: imageFilter, limits: { fileSize: IMAGE_SIZE_LIMIT } });
module.exports.org    = multer({ storage: orgStorage,    fileFilter: imageFilter, limits: { fileSize: IMAGE_SIZE_LIMIT } });
module.exports.offer  = multer({ storage: offerStorage,  fileFilter: imageFilter, limits: { fileSize: IMAGE_SIZE_LIMIT } });