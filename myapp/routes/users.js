var express = require('express');
var router = express.Router();
var model = require('../model/model');

router.get('/', function(req, res, next) {
  model.getAllUsers(function(err, users) {
    if (err) return next(err);
    res.render('html/userslist', { users: users });
  });
});

module.exports = router;
