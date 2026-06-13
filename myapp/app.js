var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var csrf = require('csurf');
var helmet = require('helmet');
var session = require('express-session');
var MySQLStore = require('express-mysql-session')(session);
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth20').Strategy;
var utilisateur = require('./model/utilisateur');
require('dotenv').config();

var indexRouter = require('./routes/index');

var app = express();

// Derrière un reverse proxy (Azure / gunicorn) : nécessaire pour que les
// cookies `secure` soient émis sur HTTPS et que req.ip reflète l'IP cliente
// réelle (X-Forwarded-For) utilisée par le rate-limiter de /login.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:        ["'self'", "https://fonts.gstatic.com"],
      imgSrc:         ["'self'", "data:"],
      connectSrc:     ["'self'"],
      formAction:     ["'self'"],
      frameAncestors: ["'none'"],
    }
  }
}));

var sessionStore = new MySQLStore({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
}));

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  '/auth/google/callback'
}, async (_accessToken, _refreshToken, profile, done) => {
  try {
    const user = await utilisateur.findOrCreateByGoogle(profile);
    if (user && user.inactive) return done(null, false);
    done(null, user);
  } catch (err) {
    done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id_user));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await utilisateur.read(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

app.use(passport.initialize());
app.use(passport.session());

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'views', 'css')));

var csrfProtection = csrf({ cookie: false });
if (process.env.NODE_ENV !== 'test') {
  // On saute le CSRF global pour le multipart : multer n'a pas encore parsé le
  // corps, donc csurf ne trouve pas _csrf dans req.body. La validation se fait
  // par route, après multer.
  app.use(function(req, res, next) {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) return next();
    csrfProtection(req, res, next);
  });
}
app.use(function(req, res, next) {
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
  next();
});

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// CSRF error handler
app.use(function(err, req, res, next) {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).send('Token CSRF invalide ou manquant.');
  }
  next(err);
});

// Multer error handler (file too large, wrong type)
app.use(function(err, req, res, next) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).send('Fichier trop volumineux. Taille maximale : 10 Mo pour les documents, 5 Mo pour les images.');
  }
  if (err.message && (err.message.includes('PDF') || err.message.includes('image'))) {
    return res.status(400).send(err.message);
  }
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  const isDev = req.app.get('env') === 'development';
  const status = err.status || 500;
  if (status >= 500 && !isDev) {
    // En production, ne jamais exposer le message d'erreur interne (peut
    // contenir des détails SQL/infrastructure). On journalise côté serveur et
    // on n'affiche qu'un message générique au client.
    console.error(err);
    res.locals.message = 'Une erreur interne est survenue.';
  } else {
    // Erreurs « clientes » (404, 400…) : le message est sûr à afficher.
    res.locals.message = err.message;
  }
  res.locals.error = isDev ? err : {};
  res.status(status);
  res.render('error');
});

module.exports = app;
