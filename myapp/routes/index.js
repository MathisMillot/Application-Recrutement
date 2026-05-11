var express = require('express');
var router = express.Router();
var passport = require('passport');
const offre = require('../model/offre');
const organisation = require('../model/organisation');
const candidature = require('../model/candidature');
const utilisateur = require('../model/utilisateur');
const upload = require('../model/upload');

/* Middleware admin */
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'Admin') return next();
  res.status(403).send('Accès refusé');
}

/* Middleware recruteur */
function isRecruteur(req, res, next) {
  if (!req.session.user) return res.redirect('/connection');
  if (req.session.user.role !== 'Recruteur') return res.status(403).send('Accès refusé');
  next();
}

/* Middleware candidat — bloque les admins et les recruteurs */
function isCandidat(req, res, next) {
  if (!req.session.user) return res.redirect('/connection');
  if (req.session.user.role === 'Admin') return res.redirect('/admin');
  if (req.session.user.role === 'Recruteur') return res.redirect('/recruteur');
  next();
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
router.post('/inscription_recruteur/etape1', async function (req, res, next) {
  try {
    const { email, mdp, confirm } = req.body;
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
    const { nom, prenom, num_tel, siren_organisation, nom_organisation } = req.body;
    const { email, mdp } = req.session.inscriptionRec;
    const id_user = await utilisateur.createRecruteur(nom, prenom, email, mdp, num_tel, siren_organisation, nom_organisation);
    const user = await utilisateur.read(id_user);
    req.session.inscriptionRec = null;
    req.session.user = { id_user: user.id_user, nom: user.nom, prenom: user.prenom, email: user.email, num_tel: user.num_tel, statut: user.statut, photo_profil: user.photo_profil || null, role: 'Recruteur' };
    res.redirect('/recruteur');
  } catch (err) { next(err); }
});

/* Espace candidat */
router.get('/candidature', isCandidat, function (req, res) {
  res.render('html/candidature', { user: req.session.user });
});

router.post('/candidature', isCandidat, async function (req, res, next) {
  try {
    const { id_offre } = req.body;
    await candidature.create(req.session.user.id_user, id_offre);
    res.render('html/candidature_confirmation', { user: req.session.user });
  } catch (err) {
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

/* Upload document (depuis le profil) */
router.post('/upload', isCandidat, upload.single('document'), async function (req, res, next) {
  try {
    if (!req.file) return res.redirect('/profil_candidat');

    await utilisateur.addDocument(req.session.user.id_user, req.file.filename);
    res.redirect('/profil_candidat');
  } catch (err) {
    next(err);
  }
});

/* Inscription multi-étapes */
router.post('/inscription/etape1', async function (req, res, next) {
  try {
    const { email, mdp, confirm } = req.body;

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
  const { nom, prenom, num_tel } = req.body;
  req.session.inscription = { ...req.session.inscription, nom, prenom, num_tel };
  res.redirect('/profil_professionnel');
});

router.post('/inscription/etape3', upload.single('cv'), async function (req, res, next) {
  try {
    const { nom, prenom, email, mdp, num_tel } = req.session.inscription;

    // 1. Création de l'utilisateur
    const id_user = await utilisateur.create(nom, prenom, email, mdp, num_tel);

    // 2. Ajout du CV s'il a été téléchargé
    if (req.file) {
      await utilisateur.addDocument(id_user, req.file.filename);
    }

    req.session.inscription = null;
    req.session.user = { id_user, nom, prenom, email, num_tel };
    res.redirect('/profil_candidat');
  } catch (err) {
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
    const { nom, prenom, email, num_tel } = req.body;
    await utilisateur.update(req.session.user.id_user, nom, prenom, email, num_tel);
    req.session.user = { ...req.session.user, nom, prenom, email, num_tel };
    res.redirect('/profil_candidat');
  } catch (err) {
    next(err);
  }
});

router.post('/profil/photo', upload.avatar.single('photo'), async function (req, res, next) {
  try {
    if (!req.session.user) return res.redirect('/connection');
    if (!req.file) return res.redirect('/modifier_profil');
    await utilisateur.setPhoto(req.session.user.id_user, req.file.filename);
    req.session.user = { ...req.session.user, photo_profil: req.file.filename };
    res.redirect('/modifier_profil');
  } catch (err) {
    next(err);
  }
});

/* Google OAuth */
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/connection?error=credentials' }),
  function (req, res) {
    req.session.user = req.user;
    const dest = { Admin: '/admin', Recruteur: '/recruteur' }[req.user.role] || '/profil_candidat';
    res.redirect(dest);
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
    const { email, mdp } = req.body;
    const user = await utilisateur.findByCredentials(email, mdp);

    if (!user) return res.redirect('/connection?error=credentials');

    // Régénère l'ID de session pour éviter la session fixation
    req.session.regenerate(function (err) {
      if (err) return next(err);
      req.session.user = user;
      const dest = { Admin: '/admin', Recruteur: '/recruteur' }[user.role] || '/profil_candidat';
      res.redirect(dest);
    });
  } catch (err) {
    next(err);
  }
});

/* Admin */
router.post('/admin/users/:id/role', isAdmin, async function (req, res, next) {
  try {
    await utilisateur.changeRole(req.params.id, req.body.role, req.body.newAdminId || null, req.session.user.id_user);
    if (req.body.role === 'Recruteur' && req.body.siren_organisation) {
      await organisation.addRecruteur(req.body.siren_organisation, req.params.id);
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
    const [users, offres, candidatures, organisations, pendingOrgs] = await Promise.all([
      utilisateur.readAll(),
      offre.readAll(),
      candidature.readAll(),
      organisation.readAll(),
      organisation.readPending()
    ]);
    res.render('html/admin', { user: req.session.user, users, offres, candidatures, organisations, pendingOrgs });
  } catch (err) {
    next(err);
  }
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
    const orgs = await organisation.readByRecruteur(id);
    const sirens = orgs.map(o => o.siren);
    const offres = await offre.readByOrganisations(sirens);
    res.render('html/recruteur_dashboard', { user: req.session.user, orgs, offres });
  } catch (err) { next(err); }
});

router.get('/recruteur/offres/nouvelle', isRecruteur, async function (req, res, next) {
  try {
    const allOrgs = await organisation.readByRecruteur(req.session.user.id_user);
    const orgs = allOrgs.filter(o => o.validation === 'OUI');
    res.render('html/recruteur_nouvelle_offre', { user: req.session.user, orgs });
  } catch (err) { next(err); }
});

router.post('/recruteur/offres/nouvelle', isRecruteur, upload.offer.single('photo'), async function (req, res, next) {
  try {
    const { statut, date_expiration, description, localisation, remote, siren_organisation, type_contrat, salaire_min } = req.body;
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(siren_organisation))) return res.status(403).send('Accès refusé');
    const photo = req.file ? req.file.filename : null;
    await offre.createFull(statut, date_expiration, description, localisation, remote, siren_organisation, photo, type_contrat, salaire_min);
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

router.get('/recruteur/organisation/nouvelle', isRecruteur, function (req, res) {
  res.render('html/recruteur_nouvelle_organisation', { user: req.session.user, error: req.query.error });
});

router.post('/recruteur/organisation/nouvelle', isRecruteur, async function (req, res, next) {
  try {
    const { siren, nom } = req.body;
    const type = req.body.type || '';
    const siege_social = req.body.siege_social || '';
    const existing = await organisation.read(siren);
    if (existing) return res.redirect('/recruteur/organisation/nouvelle?error=siren');
    await organisation.create(siren, nom, type, siege_social, null);
    await organisation.addRecruteur(siren, req.session.user.id_user);
    res.redirect('/recruteur');
  } catch (err) { next(err); }
});

router.post('/recruteur/organisation/:siren/photo', isRecruteur, upload.org.single('photo'), async function (req, res, next) {
  try {
    const { siren } = req.params;
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(siren))) return res.status(403).send('Accès refusé');
    if (!req.file) return res.redirect('/recruteur');
    await organisation.setPhoto(siren, req.file.filename);
    res.redirect('/recruteur');
  } catch (err) { next(err); }
});

module.exports = router;