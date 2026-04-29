var express = require('express');
var router = express.Router();
const offre = require('../model/offre');
const organisation = require('../model/organisation');
const candidature = require('../model/candidature');
const utilisateur = require('../model/utilisateur');
const upload = require('../model/upload');

/* Page d'accueil */
router.get('/', function(req, res) {
  res.render('html/accueil');
});

router.get('/accueil', function(req, res) {
  res.render('html/accueil');
});

/* Offres d'emploi */
router.get('/offres', async function(req, res, next) {
  try {
    const offres = await offre.readAll();
    res.render('html/offres', { offres, user: req.session.user || null });
  } catch (err) {
    next(err);
  }
});

/* Organisations */
router.get('/organisations', async function(req, res, next) {
  try {
    const organisations = await organisation.readAll();
    res.render('html/organisations', { organisations });
  } catch (err) {
    next(err);
  }
});

/* Candidatures */
router.get('/candidatures', async function(req, res, next) {
  try {
    const candidatures = await candidature.readAll();
    res.render('html/candidatures', { candidatures });
  } catch (err) {
    next(err);
  }
});

/* Connexion / Inscription */
router.get('/connection', function(req, res) {
  res.render('html/connection');
});

router.get('/inscription_candidat', function(req, res) {
  res.render('html/inscription_candidat');
});

router.get('/inscription_recruteur', function(req, res) {
  res.render('html/inscription_recruteur');
});

router.get('/responsable_recrutement', function(req, res) {
  res.render('html/responsable_recrutement');
});

/* Espace candidat */
router.get('/candidature', function(req, res) {
  res.render('html/candidature', { user: req.session.user || null });
});

router.post('/candidature', async function(req, res, next) {
  try {
    if (!req.session.user) return res.redirect('/connection');
    const id_candidat = req.session.user.id_user;
    const id_offre = req.body.id_offre;
    await candidature.create(id_candidat, id_offre);
    res.render('html/candidature_confirmation');
  } catch (err) {
    next(err);
  }
});

router.get('/profil_professionnel', function(req, res) {
  res.render('html/profil_professionnel');
});

router.get('/informations_personnelles', function(req, res) {
  res.render('html/informations_personnelles');
});

router.get('/profil_candidat', async function(req, res, next) {
  try {
    if (!req.session.user) return res.redirect('/connection');
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

/* Upload document */
router.post('/upload', upload.single('document'), async function(req, res, next) {
  try {
    if (!req.session.user) return res.redirect('/connection');
    if (!req.file) return res.redirect('/profil_candidat');
    await utilisateur.addDocument(req.session.user.id_user, req.file.filename);
    res.redirect('/profil_candidat');
  } catch (err) {
    next(err);
  }
});

/* Inscription multi-étapes */
router.post('/inscription/etape1', function(req, res) {
  const { email, mdp, confirm } = req.body;
  if (mdp !== confirm) return res.redirect('/inscription_candidat');
  req.session.inscription = { email, mdp };
  res.redirect('/informations_personnelles');
});

router.post('/inscription/etape2', function(req, res) {
  const { nom, prenom, num_tel } = req.body;
  req.session.inscription = { ...req.session.inscription, nom, prenom, num_tel };
  res.redirect('/profil_professionnel');
});

router.post('/inscription/etape3', async function(req, res, next) {
  try {
    const { nom, prenom, email, mdp, num_tel } = req.session.inscription;
    const id_user = await utilisateur.create(nom, prenom, email, mdp, num_tel);
    req.session.inscription = null;
    req.session.user = { id_user, nom, prenom, email, num_tel };
    res.redirect('/profil_candidat');
  } catch (err) {
    next(err);
  }
});

/* Connexion */
router.post('/login', async function(req, res, next) {
  try {
    const { email, mdp } = req.body;
    const user = await utilisateur.findByCredentials(email, mdp);
    if (!user) return res.redirect('/connection');
    // régénère l'ID de session pour éviter la session fixation
    req.session.regenerate(function(err) {
      if (err) return next(err);
      req.session.user = user;
      res.redirect('/profil_candidat');
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
