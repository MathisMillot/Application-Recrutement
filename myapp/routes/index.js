var express = require('express');
var router = express.Router();

/* Page d'accueil */
router.get('/', function(req, res) {
  res.render('html/accueil');
});

router.get('/accueil', function(req, res) {
  res.render('html/accueil');
});

/* Offres d'emploi */
router.get('/offres', function(req, res) {
  res.render('html/offres');
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

module.exports = router;
