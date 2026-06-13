var express = require('express');
var path = require('path');
var fs = require('fs');
var router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../public/uploads');

/* Nettoie les fichiers que multer a écrits sur disque lorsque le traitement
 * échoue après l'upload (ex. insertion BDD en erreur). Sans cela, chaque échec
 * laisse un fichier orphelin dans public/uploads. Best-effort : on n'interrompt
 * jamais la gestion de l'erreur applicative pour un échec de suppression. */
function cleanupUploads(req) {
  const files = [];
  if (req.file) files.push(req.file);
  if (req.files) {
    for (const key of Object.keys(req.files)) {
      const v = req.files[key];
      if (Array.isArray(v)) files.push(...v); else if (v) files.push(v);
    }
  }
  for (const f of files) {
    if (f && f.path) fs.unlink(f.path, () => {});
  }
}

/* Simple in-memory rate limiter for login.
 * On ne compte QUE les tentatives échouées : une connexion réussie ne doit pas
 * verrouiller un utilisateur légitime. isRateLimited() vérifie le compteur,
 * recordFailedLogin() l'incrémente, resetLoginAttempts() le remet à zéro après
 * un succès. */
const loginAttempts = new Map();
const LOGIN_MAX = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
function getEntry(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + LOGIN_WINDOW_MS; }
  return entry;
}
function isRateLimited(ip) {
  return getEntry(ip).count >= LOGIN_MAX;
}
function recordFailedLogin(ip) {
  const entry = getEntry(ip);
  entry.count++;
  loginAttempts.set(ip, entry);
}
function resetLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

/* Limiteur générique par IP pour les endpoints publics d'écriture (création de
 * compte, demande recruteur, upload). Empêche le spam / l'épuisement de
 * ressources par un client non authentifié. Désactivé en environnement de test
 * pour ne pas interférer avec les suites qui répètent ces appels. */
function makeRateLimiter(max, windowMs) {
  const hits = new Map();
  return function (req, res, next) {
    if (process.env.NODE_ENV === 'test') return next();
    const now = Date.now();
    const e = hits.get(req.ip) || { count: 0, resetAt: now + windowMs };
    if (now > e.resetAt) { e.count = 0; e.resetAt = now + windowMs; }
    e.count++;
    hits.set(req.ip, e);
    if (e.count > max) return res.status(429).send('Trop de requêtes. Veuillez réessayer plus tard.');
    next();
  };
}
// 20 créations de compte / demandes par IP et par 15 min.
const signupLimiter = makeRateLimiter(20, 15 * 60 * 1000);
// 30 uploads par IP et par 15 min.
const uploadLimiter = makeRateLimiter(30, 15 * 60 * 1000);
var passport = require('passport');
const mailer = require('../model/mailer');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

const SPECIAL_CHARS_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
function validatePassword(mdp) {
  if (!mdp || mdp.length < 12) return 'mdp-court';
  if (!/[A-Z]/.test(mdp)) return 'mdp-majuscule';
  if (!/[a-z]/.test(mdp)) return 'mdp-minuscule';
  if (!/[0-9]/.test(mdp)) return 'mdp-chiffre';
  if (!SPECIAL_CHARS_RE.test(mdp)) return 'mdp-special';
  return null;
}
/* Bornage des entrées texte avant insertion en BDD : les colonnes sont en
 * VARCHAR(100/255) — une chaîne trop longue lèverait une 500 (ER_DATA_TOO_LONG).
 * On normalise (trim) et on tronque proprement côté serveur. */
function boundedText(value, maxLen) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLen);
}
/* SIREN : la colonne est un INT — on n'accepte que des chiffres et on rejette
 * tout ce qui déborde la plage INT signée (2 147 483 647) pour éviter une
 * erreur SQL ou une troncature silencieuse. Un SIREN légal fait 9 chiffres,
 * mais on tolère 1 à 9 chiffres pour rester compatible avec les jeux de test. */
function normalizeSiren(value) {
  const digits = String(value || '').trim().replace(/[^0-9]/g, '');
  if (!digits || digits.length > 9) return null;
  if (Number(digits) > 2147483647) return null;
  return digits;
}

const offre = require('../model/offre');
const ficheDePoste = require('../model/fiche_de_poste');
const organisation = require('../model/organisation');
const candidature = require('../model/candidature');
const utilisateur = require('../model/utilisateur');
const upload = require('../model/upload');
const demandeRecruteur = require('../model/demande_recruteur');
const csrf = require('csurf');
const csrfProtection = process.env.NODE_ENV !== 'test' ? csrf({ cookie: false }) : (_req, _res, next) => next();

/* Recharge le rôle/statut faisant autorité depuis la BDD pour éviter qu'une
 * session ouverte conserve d'anciens privilèges après qu'un admin ait modifié
 * le rôle ou désactivé le compte. Met à jour la copie en session si elle a
 * changé, et déconnecte les comptes devenus INACTIF. */
async function refreshSessionUser(req) {
  if (!req.session.user) return null;
  const fresh = await utilisateur.read(req.session.user.id_user);
  if (!fresh) { return { gone: true }; }
  if (fresh.statut === 'INACTIF') { return { inactive: true }; }
  req.session.user.role = fresh.role;
  req.session.user.statut = fresh.statut;
  return req.session.user;
}

/* Middleware admin */
async function isAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/connection');
  try {
    const user = await refreshSessionUser(req);
    if (!user || user.gone || user.inactive) {
      return req.session.destroy(() => res.redirect('/connection'));
    }
    if (user.role === 'Admin') return next();
    return res.status(403).send('Accès refusé');
  } catch (err) { return next(err); }
}

/* Middleware recruteur */
async function isRecruteur(req, res, next) {
  if (!req.session.user) return res.redirect('/connection');
  try {
    const user = await refreshSessionUser(req);
    if (!user || user.gone || user.inactive) {
      return req.session.destroy(() => res.redirect('/connection'));
    }
    if (user.role !== 'Recruteur') return res.status(403).send('Accès refusé');
    return next();
  } catch (err) { return next(err); }
}

/* Middleware candidat bloque les admins et les recruteurs */
async function isCandidat(req, res, next) {
  if (!req.session.user) return res.redirect('/connection');
  try {
    const user = await refreshSessionUser(req);
    if (!user || user.gone || user.inactive) {
      return req.session.destroy(() => res.redirect('/connection'));
    }
    if (user.role === 'Admin') return res.redirect('/admin');
    if (user.role === 'Recruteur') return res.redirect('/recruteur');
    return next();
  } catch (err) { return next(err); }
}

/* Page d'accueil */
router.get('/', function (req, res) {
  res.render('html/accueil');
});

router.get('/accueil', function (req, res) {
  res.render('html/accueil');
});

/* Offres d'emploi */
router.get('/offres', async function (req, res, next) {
  try {
    const { q, localisation, contrat, salaire_min } = req.query;
    const hasFilter = q || localisation || contrat || salaire_min;
    const offres = hasFilter
      ? await offre.filterOffres({ q, localisation, contrat, salaire_min })
      : await offre.readAll();
    res.render('html/offres', {
      offres,
      user: req.session.user || null,
      q: q || '',
      localisation: localisation || '',
      contrat: contrat || '',
      salaire_min: salaire_min || ''
    });
  } catch (err) {
    next(err);
  }
});

/* Organisations */
router.get('/organisations', async function (req, res, next) {
  try {
    const q = req.query.q || '';
    const organisations = await organisation.readAllWithCount(q || null);
    res.render('html/organisations', { organisations, user: req.session.user || null, q });
  } catch (err) {
    next(err);
  }
});

router.get('/organisations/:siren', async function (req, res, next) {
  try {
    const org = await organisation.read(req.params.siren);
    if (!org) return res.status(404).send('Organisation introuvable');
    const offres = await offre.readByOrganisations([org.siren]);
    res.render('html/organisation_detail', { org, offres, user: req.session.user || null });
  } catch (err) {
    next(err);
  }
});

/* Candidatures (admin) */
router.get('/admin/candidatures', isAdmin, async function (req, res, next) {
  try {
    const candidatures = await candidature.readAll();
    res.render('html/candidatures', { user: req.session.user, candidatures });
  } catch (err) {
    next(err);
  }
});

/* Connexion / Inscription */
router.get('/connection', function (req, res) {
  if (req.session.user) {
    const dest = { Admin: '/admin', Recruteur: '/recruteur' }[req.session.user.role] || '/profil_candidat';
    return res.redirect(dest);
  }
  res.render('html/connection', { error: req.query.error });
});

router.get('/inscription_candidat', function (req, res) {
  res.render('html/inscription_candidat', { error: req.query.error });
});

router.get('/inscription_recruteur', function (req, res) {
  res.render('html/inscription_recruteur', { error: req.query.error });
});

router.get('/responsable_recrutement', function (req, res) {
  if (!req.session.inscriptionRec) return res.redirect('/inscription_recruteur');
  res.render('html/responsable_recrutement', { error: req.query.error });
});

/* Inscription recruteur multi-étapes */
router.post('/inscription_recruteur/etape1', signupLimiter, async function (req, res, next) {
  try {
    const { email, mdp, confirm } = req.body;
    if (!validateEmail(email)) return res.redirect('/inscription_recruteur?error=email-invalide');
    const mdpErrRec = validatePassword(mdp);
    if (mdpErrRec) return res.redirect('/inscription_recruteur?error=' + mdpErrRec);
    if (mdp !== confirm) return res.redirect('/inscription_recruteur?error=mdp');
    const existing = await utilisateur.findByEmail(email);
    if (existing) return res.redirect('/inscription_recruteur?error=email');
    req.session.inscriptionRec = { email, mdp };
    res.redirect('/responsable_recrutement');
  } catch (err) { next(err); }
});

router.post('/inscription_recruteur/etape2', async function (req, res, next) {
  try {
    if (!req.session.inscriptionRec) return res.redirect('/inscription_recruteur');
    const nom = boundedText(req.body.nom, 100);
    const prenom = boundedText(req.body.prenom, 100);
    const num_tel = boundedText(req.body.num_tel, 20);
    const siren_organisation = normalizeSiren(req.body.siren_organisation);
    const nom_organisation = boundedText(req.body.nom_organisation, 255) || null;
    if (!siren_organisation) return res.redirect('/inscription_recruteur?error=siren-invalide');
    const { email, mdp } = req.session.inscriptionRec;
    const id_user = await utilisateur.createRecruteurEnAttente(nom, prenom, email, mdp, num_tel);
    await demandeRecruteur.create(id_user, siren_organisation, nom_organisation || null);
    mailer.sendWelcome(email, prenom).catch(console.error);
    req.session.inscriptionRec = null;
    res.render('html/demande_recruteur_confirmation');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.redirect('/inscription_recruteur?error=email');
    next(err);
  }
});

/* Espace candidat */
router.get('/candidature', isCandidat, async function (req, res, next) {
  try {
    const id = parseInt(req.query.id, 10);
    if (!id || id <= 0) return res.redirect('/offres');
    const offreData = await offre.read(id);
    if (!offreData) return res.redirect('/offres');
    // On ne propose pas le formulaire pour une offre non publiée/expirée
    // (cohérent avec le contrôle déjà présent sur le POST /candidature).
    if (offreData.statut !== 'publiee' || new Date(offreData.date_expiration) < new Date(new Date().toDateString())) {
      return res.redirect('/offres');
    }
    const already = await candidature.existsForOffre(req.session.user.id_user, id);
    if (already) return res.redirect('/profil_candidat');
    res.render('html/candidature', { user: req.session.user, offre: offreData });
  } catch (err) {
    next(err);
  }
});

router.post('/candidature', isCandidat, upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'motivation', maxCount: 1 }]), csrfProtection, async function (req, res, next) {
  try {
    const id_offre = parseInt(req.body.id_offre, 10);
    if (!id_offre || id_offre <= 0) { cleanupUploads(req); return res.redirect('/offres'); }
    const offreData = await offre.read(id_offre);
    if (!offreData) { cleanupUploads(req); return res.redirect('/offres'); }
    if (offreData.statut !== 'publiee' || new Date(offreData.date_expiration) < new Date()) {
      cleanupUploads(req);
      return res.redirect('/offres');
    }
    const already = await candidature.existsForOffre(req.session.user.id_user, id_offre);
    if (already) { cleanupUploads(req); return res.redirect('/profil_candidat'); }
    const cv = req.files && req.files.cv ? req.files.cv[0].filename : null;
    const lm = req.files && req.files.motivation ? req.files.motivation[0].filename : null;
    const dispo = boundedText(req.body.dispo, 100) || null;
    await candidature.create(req.session.user.id_user, id_offre, cv, lm, dispo);
    res.render('html/candidature_confirmation', { user: req.session.user });
  } catch (err) {
    cleanupUploads(req);
    next(err);
  }
});

router.get('/profil_professionnel', function (req, res) {
  res.render('html/profil_professionnel');
});

router.get('/informations_personnelles', function (req, res) {
  res.render('html/informations_personnelles');
});

router.get('/profil_candidat', isCandidat, async function (req, res, next) {
  try {
    const id = req.session.user.id_user;

    const [candidatures, documents] = await Promise.all([
      candidature.readByCandidat(id),
      utilisateur.getDocuments(id)
    ]);

    res.render('html/profil_candidat', { user: req.session.user, candidatures, documents });
  } catch (err) {
    next(err);
  }
});

/* Devenir recruteur */
router.get('/devenir_recruteur', isCandidat, function (req, res) {
  res.render('html/devenir_recruteur', { user: req.session.user, error: null, success: null });
});

router.get('/api/organisation/check', async function (req, res) {
  try {
    const siren = (req.query.siren || '').trim();
    if (!siren) return res.json({ exists: false });
    const org = await organisation.read(siren);
    if (org) return res.json({ exists: true, nom: org.nom });
    return res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ exists: false });
  }
});

router.post('/devenir_recruteur', isCandidat, signupLimiter, async function (req, res, next) {
  try {
    const id_candidat = req.session.user.id_user;
    const siren = normalizeSiren(req.body.siren);
    const org_existe = req.body.org_existe === '1';
    const nom_organisation = boundedText(req.body.nom_organisation, 255) || null;

    if (!siren) return res.render('html/devenir_recruteur', { user: req.session.user, error: 'Veuillez saisir un SIREN valide (chiffres uniquement).', success: null });

    const alreadyPending = await demandeRecruteur.hasPending(id_candidat);
    if (alreadyPending) return res.render('html/devenir_recruteur', { user: req.session.user, error: 'Vous avez déjà une demande en attente.', success: null });

    if (!org_existe && !nom_organisation) return res.render('html/devenir_recruteur', { user: req.session.user, error: 'Veuillez saisir le nom de l\'organisation à créer.', success: null });

    await demandeRecruteur.create(id_candidat, siren, org_existe ? null : nom_organisation);
    res.render('html/devenir_recruteur', { user: req.session.user, error: null, success: 'Votre demande a bien été envoyée. Un administrateur la traitera prochainement.' });
  } catch (err) {
    next(err);
  }
});

/* Upload document (depuis le profil) */
router.post('/upload', isCandidat, uploadLimiter, upload.single('document'), csrfProtection, async function (req, res, next) {
  try {
    if (!req.file) return res.redirect('/profil_candidat');

    await utilisateur.addDocument(req.session.user.id_user, req.file.filename);
    res.redirect('/profil_candidat');
  } catch (err) {
    cleanupUploads(req);
    next(err);
  }
});

/* Inscription multi-étapes */
router.post('/inscription/etape1', signupLimiter, async function (req, res, next) {
  try {
    const { email, mdp, confirm } = req.body;

    if (!validateEmail(email)) return res.redirect('/inscription_candidat?error=email-invalide');
    const mdpErrCand = validatePassword(mdp);
    if (mdpErrCand) return res.redirect('/inscription_candidat?error=' + mdpErrCand);
    if (mdp !== confirm) {
      return res.redirect('/inscription_candidat?error=mdp');
    }

    const existingUser = await utilisateur.findByEmail(email);
    if (existingUser) {
      return res.redirect('/inscription_candidat?error=email');
    }

    req.session.inscription = { email, mdp };
    res.redirect('/informations_personnelles');
  } catch (err) {
    next(err);
  }
});

router.post('/inscription/etape2', function (req, res) {
  if (!req.session.inscription) return res.redirect('/inscription_candidat');
  const nom = boundedText(req.body.nom, 100);
  const prenom = boundedText(req.body.prenom, 100);
  const num_tel = boundedText(req.body.num_tel, 20);
  req.session.inscription = { ...req.session.inscription, nom, prenom, num_tel };
  res.redirect('/profil_professionnel');
});

router.post('/inscription/etape3', upload.single('cv'), csrfProtection, async function (req, res, next) {
  try {
    if (!req.session.inscription) return res.redirect('/inscription_candidat');
    const { nom, prenom, email, mdp, num_tel } = req.session.inscription;

    // 1. Création de l'utilisateur
    const id_user = await utilisateur.create(nom, prenom, email, mdp, num_tel);
    mailer.sendWelcome(email, prenom).catch(console.error);

    // 2. Ajout du CV s'il a été téléchargé
    if (req.file) {
      await utilisateur.addDocument(id_user, req.file.filename);
    }

    req.session.inscription = null;
    req.session.user = { id_user, nom, prenom, email, num_tel, role: 'Candidat', statut: 'ACTIF', photo_profil: null };
    res.redirect('/profil_candidat');
  } catch (err) {
    cleanupUploads(req);
    // L'e-mail a pu être pris entre l'étape 1 et l'étape 3 (contrainte UNIQUE) :
    // on renvoie l'utilisateur vers le formulaire avec un message clair plutôt
    // que de lever une 500.
    if (err.code === 'ER_DUP_ENTRY') return res.redirect('/inscription_candidat?error=email');
    next(err);
  }
});

/* Modifier profil */
router.get('/modifier_profil', function (req, res) {
  if (!req.session.user) return res.redirect('/connection');
  res.render('html/modifier_profil', { user: req.session.user });
});

router.post('/modifier_profil', async function (req, res, next) {
  try {
    if (!req.session.user) return res.redirect('/connection');
    const nom = boundedText(req.body.nom, 100);
    const prenom = boundedText(req.body.prenom, 100);
    const num_tel = boundedText(req.body.num_tel, 20);
    const email = (req.body.email || '').trim();
    if (!validateEmail(email)) return res.redirect('/modifier_profil?error=email-invalide');
    // Empêche d'usurper l'e-mail d'un autre compte (et évite une 500 sur la
    // contrainte UNIQUE).
    const existing = await utilisateur.findByEmail(email);
    if (existing && String(existing.id_user) !== String(req.session.user.id_user)) {
      return res.redirect('/modifier_profil?error=email-pris');
    }
    await utilisateur.update(req.session.user.id_user, nom, prenom, email, num_tel);
    req.session.user = { ...req.session.user, nom, prenom, email, num_tel };
    const dest = { Admin: '/admin', Recruteur: '/recruteur' }[req.session.user.role] || '/profil_candidat';
    res.redirect(dest);
  } catch (err) {
    next(err);
  }
});

router.post('/profil/photo', upload.avatar.single('photo'), csrfProtection, async function (req, res, next) {
  try {
    if (!req.session.user) return res.redirect('/connection');
    if (!req.file) return res.redirect('/modifier_profil');
    await utilisateur.setPhoto(req.session.user.id_user, req.file.filename);
    req.session.user = { ...req.session.user, photo_profil: req.file.filename };
    res.redirect('/modifier_profil');
  } catch (err) {
    cleanupUploads(req);
    next(err);
  }
});

/* Google OAuth */
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/connection?error=credentials' }),
  function (req, res, next) {
    const authUser = req.user;
    if (authUser.isNew) mailer.sendWelcome(authUser.email, authUser.prenom).catch(console.error);
    const passportSession = req.session.passport;
    // Régénère l'ID de session après authentification (anti session fixation),
    // puis restaure les données passport + la copie applicative de l'utilisateur.
    req.session.regenerate(function (err) {
      if (err) return next(err);
      if (passportSession) req.session.passport = passportSession;
      req.session.user = authUser;
      const dest = { Admin: '/admin', Recruteur: '/recruteur' }[authUser.role] || '/profil_candidat';
      req.session.save(function (saveErr) {
        if (saveErr) return next(saveErr);
        res.redirect(dest);
      });
    });
  }
);

/* Déconnexion */
router.post('/logout', function (req, res, next) {
  req.session.destroy(function (err) {
    if (err) return next(err);
    res.redirect('/connection');
  });
});

/* Connexion */
router.post('/login', async function (req, res, next) {
  try {
    if (isRateLimited(req.ip)) return res.redirect('/connection?error=ratelimit');
    const { email, mdp } = req.body;
    const user = await utilisateur.findAndCheckByCredentials(email, mdp);

    if (!user) { recordFailedLogin(req.ip); return res.redirect('/connection?error=credentials'); }
    if (user.inactive) {
      const pending = await demandeRecruteur.hasPending(user.id_user);
      if (pending) return res.redirect('/connection?error=pending');
      return res.redirect('/connection?error=inactive');
    }

    // Succès : on réinitialise le compteur de tentatives pour cette IP.
    resetLoginAttempts(req.ip);
    // Régénère l'ID de session pour éviter la session fixation
    req.session.regenerate(function (err) {
      if (err) return next(err);
      req.session.user = user;
      const dest = { Admin: '/admin', Recruteur: '/recruteur' }[user.role] || '/profil_candidat';
      // Persiste la session avant la redirection (store asynchrone).
      req.session.save(function (saveErr) {
        if (saveErr) return next(saveErr);
        res.redirect(dest);
      });
    });
  } catch (err) {
    next(err);
  }
});

/* Admin */
router.post('/admin/users/:id/statut', isAdmin, async function (req, res, next) {
  try {
    if (String(req.params.id) === String(req.session.user.id_user)) {
      return res.status(400).send('Vous ne pouvez pas modifier votre propre statut');
    }
    const target = await utilisateur.read(req.params.id);
    if (!target) return res.status(404).send('Utilisateur introuvable');
    const newStatut = target.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF';
    await utilisateur.setStatut(req.params.id, newStatut);
    res.redirect('/admin');
  } catch (err) { next(err); }
});

router.post('/admin/users/:id/role', isAdmin, async function (req, res, next) {
  try {
    const VALID_ROLES = ['Admin', 'Recruteur', 'Candidat'];
    if (!VALID_ROLES.includes(req.body.role)) return res.status(400).send('Rôle invalide');
    if (req.params.id == req.session.user.id_user) return res.status(400).send('Vous ne pouvez pas modifier votre propre rôle');
    await utilisateur.changeRole(req.params.id, req.body.role, req.body.newAdminId || null, req.session.user.id_user);
    if (req.body.role === 'Recruteur' && req.body.siren_organisation) {
      await organisation.addRecruteur(req.body.siren_organisation, req.params.id);
    }
    if (req.body.role === 'Admin') {
      const targetUser = await utilisateur.read(req.params.id);
      if (targetUser) mailer.sendAdminRights(targetUser.email, targetUser.prenom).catch(console.error);
    }
    res.redirect('/admin');
  } catch (err) {
    if (err.status === 409) return res.redirect('/admin?error=' + encodeURIComponent(err.message));
    next(err);
  }
});

router.get('/admin/offres', isAdmin, async function (req, res, next) {
  try {
    const offres = await offre.readAll();
    res.render('html/admin_offres', { user: req.session.user, offres });
  } catch (err) {
    next(err);
  }
});

router.get('/admin', isAdmin, async function (req, res, next) {
  try {
    const [users, offres, candidatures, organisations, pendingOrgs, pendingJoins, pendingDemandes, pendingDeletions] = await Promise.all([
      utilisateur.readAll(),
      offre.readAll(),
      candidature.readAll(),
      organisation.readAll(),
      organisation.readPending(),
      organisation.readPendingJoins(),
      demandeRecruteur.readPending(),
      organisation.readPendingDeletions()
    ]);
    res.render('html/admin', { user: req.session.user, users, offres, candidatures, organisations, pendingOrgs, pendingJoins, pendingDemandes, pendingDeletions });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/demandes/:id/accepter', isAdmin, async function (req, res, next) {
  try {
    const demande = await demandeRecruteur.read(req.params.id);
    if (!demande) return res.redirect('/admin');

    // Créer l'org si elle n'existe pas encore
    const orgExistante = await organisation.read(demande.siren);
    if (!orgExistante && demande.nom_organisation) {
      await organisation.create(demande.siren, demande.nom_organisation, '', '', req.session.user.id_user);
    }

    // Activer le compte si INACTIF (cas inscription recruteur en attente)
    await utilisateur.setStatut(demande.id_candidat, 'ACTIF');

    // Passer le candidat en recruteur
    await utilisateur.changeRole(demande.id_candidat, 'Recruteur', null, req.session.user.id_user);

    // Lier au SIREN avec statut ATTENTE (l'admin valide l'org séparément si besoin)
    await organisation.addRecruteur(demande.siren, demande.id_candidat);

    await demandeRecruteur.accept(req.params.id);
    const userDemande = await utilisateur.read(demande.id_candidat);
    const orgDemande  = await organisation.read(demande.siren);
    if (userDemande) mailer.sendDemandeAcceptee(userDemande.email, userDemande.prenom, orgDemande ? orgDemande.nom : demande.nom_organisation).catch(console.error);
    res.redirect('/admin');
  } catch (err) { next(err); }
});

router.post('/admin/demandes/:id/rejeter', isAdmin, async function (req, res, next) {
  try {
    await demandeRecruteur.reject(req.params.id);
    res.redirect('/admin');
  } catch (err) { next(err); }
});

router.post('/admin/adhesions/:siren/:id_recruteur/accepter', isAdmin, async function (req, res, next) {
  try {
    await organisation.approveJoin(req.params.siren, req.params.id_recruteur);
    const userAdh = await utilisateur.read(req.params.id_recruteur);
    const orgAdh  = await organisation.read(req.params.siren);
    if (userAdh && orgAdh) mailer.sendAdhesionAcceptee(userAdh.email, userAdh.prenom, orgAdh.nom).catch(console.error);
    res.redirect('/admin');
  } catch (err) { next(err); }
});

router.post('/admin/adhesions/:siren/:id_recruteur/rejeter', isAdmin, async function (req, res, next) {
  try {
    await organisation.rejectJoin(req.params.siren, req.params.id_recruteur);
    res.redirect('/admin');
  } catch (err) { next(err); }
});

router.post('/admin/organisations/:siren/valider', isAdmin, async function (req, res, next) {
  try {
    await organisation.setValidation(req.params.siren, 'OUI');
    res.redirect('/admin');
  } catch (err) { next(err); }
});

router.post('/admin/organisations/:siren/rejeter', isAdmin, async function (req, res, next) {
  try {
    await organisation.setValidation(req.params.siren, 'NON');
    res.redirect('/admin');
  } catch (err) { next(err); }
});

/* ── Recruteur ── */
router.get('/recruteur', isRecruteur, async function (req, res, next) {
  try {
    const id = req.session.user.id_user;
    const orgsAll = await organisation.readAllByRecruteur(id);
    const sirens = orgsAll.filter(o => o.adhesion_statut === 'ACCEPTEE').map(o => o.siren);
    const [offres, pendingDeletionSirens] = await Promise.all([
      offre.readByOrganisations(sirens),
      organisation.pendingDeletionSirens(id)
    ]);
    res.render('html/recruteur_dashboard', { user: req.session.user, orgs: orgsAll, offres, pendingDeletionSirens, error: req.query.error || null });
  } catch (err) { next(err); }
});

/* ── Fiches de poste ── */
router.get('/recruteur/fiches', isRecruteur, async function (req, res, next) {
  try {
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirens = orgs.map(o => o.siren);
    const fiches = await ficheDePoste.readByOrganisations(sirens);
    res.render('html/recruteur_fiches', { user: req.session.user, fiches, error: req.query.error || null });
  } catch (err) { next(err); }
});

router.get('/recruteur/fiches/nouvelle', isRecruteur, async function (req, res, next) {
  try {
    const allOrgs = await organisation.readByRecruteur(req.session.user.id_user);
    const orgs = allOrgs.filter(o => o.validation === 'OUI');
    res.render('html/recruteur_nouvelle_fiche', { user: req.session.user, orgs });
  } catch (err) { next(err); }
});

router.post('/recruteur/fiches/nouvelle', isRecruteur, upload.offer.single('photo'), csrfProtection, async function (req, res, next) {
  try {
    const { siren_organisation, remote, statut_poste, type_metier, rythme, description, pieces_demandees } = req.body;
    const intitule = boundedText(req.body.intitule, 255);
    const nom_poste = boundedText(req.body.nom_poste, 255);
    const responsable = boundedText(req.body.responsable, 255);
    const lieu = boundedText(req.body.lieu, 255);
    const type_contrat = boundedText(req.body.type_contrat, 255);
    if (!intitule || !nom_poste || !responsable || !lieu) { cleanupUploads(req); return res.status(400).send('Champs obligatoires manquants ou invalides.'); }
    const sMin = parseInt(req.body.salaire_min, 10) || 0;
    const sMax = parseInt(req.body.salaire_max, 10) || 0;
    if (sMin < 0 || sMax < 0) { cleanupUploads(req); return res.status(400).send('Les salaires ne peuvent pas être négatifs.'); }
    if (sMax > 0 && sMin > sMax) { cleanupUploads(req); return res.status(400).send('Le salaire minimum ne peut pas être supérieur au salaire maximum.'); }
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const orgCible = orgs.find(o => String(o.siren) === String(siren_organisation));
    if (!orgCible) { cleanupUploads(req); return res.status(403).send('Accès refusé'); }
    if (orgCible.validation !== 'OUI') { cleanupUploads(req); return res.status(403).send('Organisation non validée'); }
    const photo = req.file ? req.file.filename : null;
    await ficheDePoste.create(intitule, nom_poste, responsable, lieu, sMin, sMax, description, type_contrat, remote, photo, siren_organisation, statut_poste, type_metier, rythme, pieces_demandees);
    res.redirect('/recruteur/fiches');
  } catch (err) { cleanupUploads(req); next(err); }
});

router.get('/recruteur/fiches/:id/modifier', isRecruteur, async function (req, res, next) {
  try {
    const ficheData = await ficheDePoste.read(req.params.id);
    if (!ficheData) return res.status(404).send('Fiche introuvable');
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(ficheData.siren_organisation))) return res.status(403).send('Accès refusé');
    res.render('html/recruteur_modifier_fiche', { user: req.session.user, fiche: ficheData });
  } catch (err) { next(err); }
});

router.post('/recruteur/fiches/:id/modifier', isRecruteur, async function (req, res, next) {
  try {
    const ficheData = await ficheDePoste.read(req.params.id);
    if (!ficheData) return res.status(404).send('Fiche introuvable');
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(ficheData.siren_organisation))) return res.status(403).send('Accès refusé');
    const { remote, statut_poste, type_metier, rythme, description, pieces_demandees } = req.body;
    const intitule = boundedText(req.body.intitule, 255);
    const nom_poste = boundedText(req.body.nom_poste, 255);
    const responsable = boundedText(req.body.responsable, 255);
    const lieu = boundedText(req.body.lieu, 255);
    const type_contrat = boundedText(req.body.type_contrat, 255);
    if (!intitule || !nom_poste || !responsable || !lieu) return res.status(400).send('Champs obligatoires manquants ou invalides.');
    const sMin = parseInt(req.body.salaire_min, 10) || 0;
    const sMax = parseInt(req.body.salaire_max, 10) || 0;
    if (sMin < 0 || sMax < 0) return res.status(400).send('Les salaires ne peuvent pas être négatifs.');
    if (sMax > 0 && sMin > sMax) return res.status(400).send('Le salaire minimum ne peut pas être supérieur au salaire maximum.');
    await ficheDePoste.update(req.params.id, intitule, nom_poste, responsable, lieu, sMin, sMax, description, type_contrat, remote, statut_poste, type_metier, rythme, pieces_demandees);
    res.redirect('/recruteur/fiches');
  } catch (err) { next(err); }
});

router.post('/recruteur/fiches/:id/supprimer', isRecruteur, async function (req, res, next) {
  try {
    const ficheData = await ficheDePoste.read(req.params.id);
    if (!ficheData) return res.status(404).send('Fiche introuvable');
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(ficheData.siren_organisation))) return res.status(403).send('Accès refusé');
    await ficheDePoste.delete(req.params.id);
    res.redirect('/recruteur/fiches');
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.redirect('/recruteur/fiches?error=fiche-liee');
    }
    next(err);
  }
});

/* ── Offres d'emploi (recruteur) ── */
router.get('/recruteur/offres/nouvelle', isRecruteur, async function (req, res, next) {
  try {
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirens = orgs.filter(o => o.validation === 'OUI').map(o => o.siren);
    const fiches = await ficheDePoste.readByOrganisations(sirens);
    res.render('html/recruteur_nouvelle_offre', { user: req.session.user, fiches, error: null });
  } catch (err) { next(err); }
});

router.post('/recruteur/offres/nouvelle', isRecruteur, async function (req, res, next) {
  try {
    const { id_fiche, statut, date_expiration } = req.body;
    const ficheData = await ficheDePoste.read(id_fiche);
    if (!ficheData) return res.status(404).send('Fiche introuvable');
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(ficheData.siren_organisation))) return res.status(403).send('Accès refusé');
    const today = new Date().toISOString().split('T')[0];
    if (!date_expiration || date_expiration < today) {
      const sirens = orgs.filter(o => o.validation === 'OUI').map(o => o.siren);
      const fiches = await ficheDePoste.readByOrganisations(sirens);
      return res.render('html/recruteur_nouvelle_offre', {
        user: req.session.user, fiches,
        error: 'La date d\'expiration ne peut pas être dans le passé.'
      });
    }
    await offre.create(statut, date_expiration, id_fiche, ficheData.siren_organisation);
    res.redirect('/recruteur');
  } catch (err) { next(err); }
});

router.get('/recruteur/offres/:id/modifier', isRecruteur, async function (req, res, next) {
  try {
    const offreData = await offre.read(req.params.id);
    if (!offreData) return res.status(404).send('Offre introuvable');
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(offreData.siren_organisation))) return res.status(403).send('Accès refusé');
    res.render('html/recruteur_modifier_offre', { user: req.session.user, offre: offreData, error: null });
  } catch (err) { next(err); }
});

router.post('/recruteur/offres/:id/modifier', isRecruteur, async function (req, res, next) {
  try {
    const offreData = await offre.read(req.params.id);
    if (!offreData) return res.status(404).send('Offre introuvable');
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(offreData.siren_organisation))) return res.status(403).send('Accès refusé');
    const { statut, date_expiration } = req.body;
    const today = new Date().toISOString().split('T')[0];
    if (!date_expiration || date_expiration < today) {
      return res.render('html/recruteur_modifier_offre', {
        user: req.session.user,
        offre: { ...offreData, statut, date_expiration },
        error: 'La date d\'expiration ne peut pas être dans le passé.'
      });
    }
    await offre.update(req.params.id, statut, date_expiration);
    res.redirect('/recruteur');
  } catch (err) { next(err); }
});

router.post('/recruteur/offres/:id/supprimer', isRecruteur, async function (req, res, next) {
  try {
    const offreData = await offre.read(req.params.id);
    if (!offreData) return res.status(404).send('Offre introuvable');
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(offreData.siren_organisation))) return res.status(403).send('Accès refusé');
    await offre.delete(req.params.id);
    res.redirect('/recruteur');
  } catch (err) { next(err); }
});

router.get('/recruteur/offres/:id/candidatures', isRecruteur, async function (req, res, next) {
  try {
    const offreData = await offre.read(req.params.id);
    if (!offreData) return res.status(404).send('Offre introuvable');
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(offreData.siren_organisation))) return res.status(403).send('Accès refusé');
    const candidatures = await candidature.readByOffre(req.params.id);
    res.render('html/recruteur_candidatures_offre', { user: req.session.user, offre: offreData, candidatures });
  } catch (err) { next(err); }
});

router.get('/recruteur/organisation/rejoindre', isRecruteur, async function (req, res, next) {
  try {
    const availableOrgs = await organisation.readValidatedExcluding(req.session.user.id_user);
    res.render('html/recruteur_rejoindre_organisation', { user: req.session.user, orgs: availableOrgs, error: req.query.error || null });
  } catch (err) { next(err); }
});

router.post('/recruteur/organisation/:siren/quitter', isRecruteur, async function (req, res, next) {
  try {
    const { siren } = req.params;
    const [members] = await (require('../model/db')).query(
      "SELECT COUNT(*) AS n FROM Appartient WHERE siren_organisation = ? AND id_recruteur != ? AND statut = 'ACCEPTEE'",
      [siren, req.session.user.id_user]
    );
    if (members[0].n === 0) return res.redirect('/recruteur?error=seul-membre');
    await organisation.rejectJoin(siren, req.session.user.id_user);
    res.redirect('/recruteur');
  } catch (err) { next(err); }
});

router.post('/recruteur/organisation/rejoindre', isRecruteur, async function (req, res, next) {
  try {
    const { siren } = req.body;
    const org = await organisation.read(siren);
    if (!org || org.validation !== 'OUI') return res.redirect('/recruteur/organisation/rejoindre?error=org');
    await organisation.requestJoin(siren, req.session.user.id_user);
    res.redirect('/recruteur');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.redirect('/recruteur/organisation/rejoindre?error=deja');
    next(err);
  }
});

router.post('/recruteur/organisation/:siren/demander-suppression', isRecruteur, async function (req, res, next) {
  try {
    const { siren } = req.params;
    const id = req.session.user.id_user;
    const orgs = await organisation.readByRecruteur(id);
    if (!orgs.some(o => String(o.siren) === String(siren))) return res.status(403).send('Accès refusé');
    const already = await organisation.hasPendingDeletion(siren, id);
    if (already) return res.redirect('/recruteur?error=suppression-deja-demandee');
    await organisation.requestDeletion(siren, id);
    res.redirect('/recruteur');
  } catch (err) { next(err); }
});

router.post('/admin/organisations/:siren/supprimer', isAdmin, async function (req, res, next) {
  try {
    const org = await organisation.read(req.params.siren);
    if (!org) return res.status(404).send('Organisation introuvable');
    await organisation.deleteOrg(req.params.siren);
    res.redirect('/admin');
  } catch (err) { next(err); }
});

router.post('/admin/demandes-suppression/:id/accepter', isAdmin, async function (req, res, next) {
  try {
    const pendingDeletions = await organisation.readPendingDeletions();
    const demande = pendingDeletions.find(d => String(d.id_demande) === String(req.params.id));
    if (!demande) return res.redirect('/admin');
    await organisation.deleteOrg(demande.siren_organisation);
    res.redirect('/admin');
  } catch (err) { next(err); }
});

router.post('/admin/demandes-suppression/:id/rejeter', isAdmin, async function (req, res, next) {
  try {
    await organisation.rejectDeletion(req.params.id);
    res.redirect('/admin');
  } catch (err) { next(err); }
});

router.get('/recruteur/organisation/nouvelle', isRecruteur, function (req, res) {
  res.render('html/recruteur_nouvelle_organisation', { user: req.session.user, error: req.query.error });
});

router.post('/recruteur/organisation/nouvelle', isRecruteur, async function (req, res, next) {
  try {
    const siren = normalizeSiren(req.body.siren);
    const nom = boundedText(req.body.nom, 255);
    const type = boundedText(req.body.type, 100);
    const siege_social = boundedText(req.body.siege_social, 255);
    if (!siren) return res.redirect('/recruteur/organisation/nouvelle?error=siren-invalide');
    if (!nom) return res.redirect('/recruteur/organisation/nouvelle?error=nom');
    const existing = await organisation.read(siren);
    if (existing) return res.redirect('/recruteur/organisation/nouvelle?error=siren');
    await organisation.create(siren, nom, type, siege_social, null);
    await organisation.addRecruteur(siren, req.session.user.id_user);
    res.redirect('/recruteur');
  } catch (err) { next(err); }
});

router.post('/recruteur/organisation/:siren/photo', isRecruteur, upload.org.single('photo'), csrfProtection, async function (req, res, next) {
  try {
    const { siren } = req.params;
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(siren))) { cleanupUploads(req); return res.status(403).send('Accès refusé'); }
    if (!req.file) return res.redirect('/recruteur');
    await organisation.setPhoto(siren, req.file.filename);
    res.redirect('/recruteur');
  } catch (err) { cleanupUploads(req); next(err); }
});

/* Modifier une candidature */
router.get('/candidature/:id/modifier', isCandidat, async function (req, res, next) {
  try {
    const cand = await candidature.read(req.params.id);
    if (!cand || cand.id_candidat !== req.session.user.id_user) return res.status(403).send('Accès refusé');
    const offreData = await offre.read(cand.id_offre);
    if (!offreData || offreData.statut !== 'publiee' || new Date(offreData.date_expiration) < new Date()) {
      return res.redirect('/profil_candidat');
    }
    res.render('html/candidature_modifier', { user: req.session.user, cand, offre: offreData });
  } catch (err) { next(err); }
});

router.post('/candidature/:id/modifier', isCandidat, upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'motivation', maxCount: 1 }]), csrfProtection, async function (req, res, next) {
  try {
    const cand = await candidature.read(req.params.id);
    if (!cand || cand.id_candidat !== req.session.user.id_user) { cleanupUploads(req); return res.status(403).send('Accès refusé'); }
    const offreData = await offre.read(cand.id_offre);
    if (!offreData || offreData.statut !== 'publiee' || new Date(offreData.date_expiration) < new Date()) {
      cleanupUploads(req);
      return res.redirect('/profil_candidat');
    }
    const cv = req.files && req.files.cv ? req.files.cv[0].filename : undefined;
    const lm = req.files && req.files.motivation ? req.files.motivation[0].filename : undefined;
    const dispo = req.body.dispo === undefined ? undefined : boundedText(req.body.dispo, 100);
    await candidature.update(req.params.id, cv, lm, dispo);
    res.redirect('/profil_candidat');
  } catch (err) { cleanupUploads(req); next(err); }
});

/* Annuler une candidature */
router.post('/candidature/:id/annuler', isCandidat, async function (req, res, next) {
  try {
    const cand = await candidature.read(req.params.id);
    if (!cand || cand.id_candidat !== req.session.user.id_user) return res.status(403).send('Accès refusé');
    // Une candidature peut toujours être annulée par son auteur, même si l'offre
    // est expirée ou dépubliée — sinon le candidat resterait coincé.
    await candidature.delete(req.params.id);
    res.redirect('/profil_candidat');
  } catch (err) { next(err); }
});

/* Téléchargement protégé des documents de candidature (CV / lettre de motiv.
 * / documents du profil). Contrairement aux images publiques servies via
 * express.static, ces fichiers contiennent des données personnelles et ne
 * doivent être accessibles qu'à leur propriétaire (candidat), au recruteur de
 * l'offre concernée, ou à un admin. */
router.get('/documents/:file', async function (req, res, next) {
  try {
    if (!req.session.user) return res.redirect('/connection');

    // Empêche toute traversée de répertoire : on ne garde que le basename et on
    // vérifie qu'il reste dans le dossier d'upload après résolution.
    const requested = path.basename(req.params.file);
    const filePath = path.resolve(UPLOAD_DIR, requested);
    if (path.dirname(filePath) !== path.resolve(UPLOAD_DIR)) {
      return res.status(400).send('Nom de fichier invalide');
    }

    const role = req.session.user.role;
    const uid = req.session.user.id_user;
    let authorized = false;

    if (role === 'Admin') {
      authorized = true;
    } else {
      const owner = await candidature.findOwnerByFile(requested);
      if (owner) {
        if (role === 'Candidat' && owner.id_candidat === uid) authorized = true;
        if (role === 'Recruteur') {
          const orgs = await organisation.readByRecruteur(uid);
          if (orgs.some(o => String(o.siren) === String(owner.siren_organisation))) authorized = true;
        }
      }
      // Documents déposés sur le profil candidat (hors candidature).
      if (!authorized && role === 'Candidat') {
        const docs = await utilisateur.getDocuments(uid);
        if (docs.includes(requested)) authorized = true;
      }
    }

    if (!authorized) return res.status(403).send('Accès refusé');
    if (!fs.existsSync(filePath)) return res.status(404).send('Fichier introuvable');
    return res.sendFile(filePath);
  } catch (err) { next(err); }
});

/* Détail d'une offre */
router.get('/offres/:id', async function (req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) return res.redirect('/offres');
    const offreData = await offre.read(id);
    if (!offreData) return res.status(404).send('Offre introuvable');
    // Une offre non publiée ou expirée ne doit pas être visible au public ni aux
    // candidats. Seuls un admin ou un recruteur de l'organisation propriétaire
    // peuvent encore la consulter (prévisualisation / gestion).
    const isPublished = offreData.statut === 'publiee' && new Date(offreData.date_expiration) >= new Date(new Date().toDateString());
    if (!isPublished) {
      const u = req.session.user;
      let canView = false;
      if (u && u.role === 'Admin') canView = true;
      else if (u && u.role === 'Recruteur') {
        const orgs = await organisation.readByRecruteur(u.id_user);
        canView = orgs.some(o => String(o.siren) === String(offreData.siren_organisation));
      }
      if (!canView) return res.status(404).send('Offre introuvable');
    }
    res.render('html/offre_detail', { offre: offreData, user: req.session.user || null });
  } catch (err) { next(err); }
});

module.exports = router;