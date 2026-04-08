var express = require('express');
var router = express.Router();
const utilisateur = require('../model/utilisateur');

router.get('/', async function(req, res, next) {
  try {
    const users = await utilisateur.readAll();
    res.render('html/userslist', { users });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
