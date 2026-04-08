var express = require('express');
var router = express.Router();
const offre = require('../model/offre');
const organisation = require('../model/organisation');
const candidature = require('../model/candidature');

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
    res.render('html/offres', { offres });
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
  res.render('html/candidature');
});

router.get('/profil_professionnel', function(req, res) {
  res.render('html/profil_professionnel');
});

router.get('/informations_personnelles', function(req, res) {
  res.render('html/informations_personnelles');
});

router.get('/profil_candidat', function(req, res) {
  res.render('html/profil_candidat');
});

module.exports = router;
