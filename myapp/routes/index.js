var express = require('express');
var router = express.Router();

/* Simple in-memory rate limiter for login */
const loginAttempts = new Map();
const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + LOGIN_WINDOW_MS; }
  entry.count++;
  loginAttempts.set(ip, entry);
  return entry.count > LOGIN_MAX;
}
var passport = require('passport');
const offre = require('../model/offre');
const ficheDePoste = require('../model/fiche_de_poste');
const organisation = require('../model/organisation');
const candidature = require('../model/candidature');
const utilisateur = require('../model/utilisateur');
const upload = require('../model/upload');
const demandeRecruteur = require('../model/demande_recruteur');

/* Middleware admin */
function isAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/connection');
  if (req.session.user.role === 'Admin') return next();
  res.status(403).send('Accès refusé');
}

/* Middleware recruteur */
function isRecruteur(req, res, next) {
  if (!req.session.user) return res.redirect('/connection');
  if (req.session.user.role !== 'Recruteur') return res.status(403).send('Accès refusé');
  next();
}

/* Middleware candidat bloque les admins et les recruteurs */
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
    if (!mdp || mdp.length < 8) return res.redirect('/inscription_recruteur?error=mdp-court');
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
router.get('/candidature', isCandidat, async function (req, res, next) {
  try {
    const id = parseInt(req.query.id, 10);
    if (!id || id <= 0) return res.redirect('/offres');
    const offreData = await offre.read(id);
    if (!offreData) return res.redirect('/offres');
    res.render('html/candidature', { user: req.session.user, offre: offreData });
  } catch (err) {
    next(err);
  }
});

router.post('/candidature', isCandidat, upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'motivation', maxCount: 1 }]), async function (req, res, next) {
  try {
    const id_offre = parseInt(req.body.id_offre, 10);
    if (!id_offre || id_offre <= 0) return res.redirect('/offres');
    const offreData = await offre.read(id_offre);
    if (!offreData) return res.redirect('/offres');
    if (offreData.statut !== 'publiee' || new Date(offreData.date_expiration) < new Date()) {
      return res.redirect('/offres');
    }
    const already = await candidature.existsForOffre(req.session.user.id_user, id_offre);
    if (already) return res.redirect('/profil_candidat');
    const cv = req.files && req.files.cv ? req.files.cv[0].filename : null;
    const lm = req.files && req.files.motivation ? req.files.motivation[0].filename : null;
    const dispo = req.body.dispo || null;
    await candidature.create(req.session.user.id_user, id_offre, cv, lm, dispo);
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

router.post('/devenir_recruteur', isCandidat, async function (req, res, next) {
  try {
    const id_candidat = req.session.user.id_user;
    const siren = (req.body.siren || '').trim();
    const org_existe = req.body.org_existe === '1';
    const nom_organisation = (req.body.nom_organisation || '').trim() || null;

    if (!siren) return res.render('html/devenir_recruteur', { user: req.session.user, error: 'Veuillez saisir un SIREN.', success: null });

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

    if (!mdp || mdp.length < 8) return res.redirect('/inscription_candidat?error=mdp-court');
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
  const { nom, prenom, num_tel } = req.body;
  req.session.inscription = { ...req.session.inscription, nom, prenom, num_tel };
  res.redirect('/profil_professionnel');
});

router.post('/inscription/etape3', upload.single('cv'), async function (req, res, next) {
  try {
    if (!req.session.inscription) return res.redirect('/inscription_candidat');
    const { nom, prenom, email, mdp, num_tel } = req.session.inscription;

    // 1. Création de l'utilisateur
    const id_user = await utilisateur.create(nom, prenom, email, mdp, num_tel);

    // 2. Ajout du CV s'il a été téléchargé
    if (req.file) {
      await utilisateur.addDocument(id_user, req.file.filename);
    }

    req.session.inscription = null;
    req.session.user = { id_user, nom, prenom, email, num_tel, role: 'Candidat', statut: 'ACTIF', photo_profil: null };
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
    const dest = { Admin: '/admin', Recruteur: '/recruteur' }[req.session.user.role] || '/profil_candidat';
    res.redirect(dest);
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
    if (checkRateLimit(req.ip)) return res.redirect('/connection?error=ratelimit');
    const { email, mdp } = req.body;
    const user = await utilisateur.findAndCheckByCredentials(email, mdp);

    if (!user) return res.redirect('/connection?error=credentials');
    if (user.inactive) return res.redirect('/connection?error=inactive');

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
router.post('/admin/users/:id/statut', isAdmin, async function (req, res, next) {
  try {
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

    // Passer le candidat en recruteur
    await utilisateur.changeRole(demande.id_candidat, 'Recruteur', null, req.session.user.id_user);

    // Lier au SIREN avec statut ATTENTE (l'admin valide l'org séparément si besoin)
    await organisation.addRecruteur(demande.siren, demande.id_candidat);

    await demandeRecruteur.accept(req.params.id);
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

router.post('/recruteur/fiches/nouvelle', isRecruteur, upload.offer.single('photo'), async function (req, res, next) {
  try {
    const { intitule, nom_poste, responsable, lieu, salaire_min, salaire_max, description, type_contrat, remote, siren_organisation } = req.body;
    const orgs = await organisation.readByRecruteur(req.session.user.id_user);
    const sirensAutorisés = orgs.map(o => String(o.siren));
    if (!sirensAutorisés.includes(String(siren_organisation))) return res.status(403).send('Accès refusé');
    const photo = req.file ? req.file.filename : null;
    await ficheDePoste.create(intitule, nom_poste, responsable, lieu, salaire_min, salaire_max, description, type_contrat, remote, photo, siren_organisation);
    res.redirect('/recruteur/fiches');
  } catch (err) { next(err); }
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
    const { intitule, nom_poste, responsable, lieu, salaire_min, salaire_max, description, type_contrat, remote } = req.body;
    await ficheDePoste.update(req.params.id, intitule, nom_poste, responsable, lieu, salaire_min, salaire_max, description, type_contrat, remote);
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
    res.render('html/recruteur_nouvelle_offre', { user: req.session.user, fiches });
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
    res.render('html/recruteur_modifier_offre', { user: req.session.user, offre: offreData });
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