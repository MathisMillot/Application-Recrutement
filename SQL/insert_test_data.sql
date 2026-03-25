-- ============================================================
-- Données de test — Application de Recrutement
-- Ordre d'insertion respectant les contraintes FK
-- ============================================================

INSERT INTO Utilisateur (nom, prenom, email, mdp, num_tel, statut) VALUES
('Dupont',   'Alice',   'alice.dupont@mail.com',   SHA2('Admin1234!', 256), '0601020304', 'ACTIF'),
('Martin',   'Bruno',   'bruno.martin@mail.com',   SHA2('Admin5678!', 256), NULL,         'ACTIF'),
('Leroy',    'Claire',  'claire.leroy@mail.com',   SHA2('Admin9012!', 256), '0611223344', 'ACTIF'),
('Morel',    'David',   'david.morel@mail.com',    SHA2('Recru1234!', 256), '0622334455', 'ACTIF'),
('Simon',    'Emma',    'emma.simon@mail.com',     SHA2('Recru5678!', 256), NULL,         'ACTIF'),
('Bernard',  'Fabrice', 'fabrice.bernard@mail.com',SHA2('Recru9012!', 256), '0633445566', 'INACTIF'),
('Thomas',   'Gaelle',  'gaelle.thomas@mail.com',  SHA2('Candi1234!', 256), '0644556677', 'ACTIF'),
('Petit',    'Hugo',    'hugo.petit@mail.com',     SHA2('Candi5678!', 256), NULL,         'ACTIF'),
('Robert',   'Inès',    'ines.robert@mail.com',    SHA2('Candi9012!', 256), '0655667788', 'ACTIF'),
('Richard',  'Jules',   'jules.richard@mail.com',  SHA2('Candi3456!', 256), NULL,         'ACTIF');

-- ------------------------------------------------------------
-- Admins (id_user 1, 2, 3)
-- ------------------------------------------------------------
INSERT INTO Admin (id_user) VALUES (1), (2), (3);

-- ------------------------------------------------------------
-- Recruteurs (id_user 4, 5, 6) validés par les admins
-- ------------------------------------------------------------
INSERT INTO Recruteur (id_user, id_admin_validateur) VALUES
(4, 1),
(5, 1),
(6, 2);

-- ------------------------------------------------------------
-- Candidats (id_user 7, 8, 9, 10)
-- ------------------------------------------------------------
INSERT INTO Candidat (id_user, documents) VALUES
(7,  'CV, Lettre de motivation'),
(8,  'CV'),
(9,  'CV, Portfolio, Lettre de motivation'),
(10, NULL);

-- ------------------------------------------------------------
-- Organisations
-- ------------------------------------------------------------
INSERT INTO Organisation (siren, nom, type, siege_social, validation, id_admin_createur) VALUES
(123456789, 'TechCorp',      'SASU',        '12 rue de la Paix, Paris',       'VALIDE',  1),
(987654321, 'DataSolutions', 'SARL',        '45 avenue Victor Hugo, Lyon',     'VALIDE',  2),
(111222333, 'GreenStart',    'Association', '8 impasse des Lilas, Bordeaux',   'ATTENTE', 3),
(444555666, 'WebAgency',     'EURL',        '3 boulevard Haussmann, Paris',    'REFUSE',  1);

-- ------------------------------------------------------------
-- Appartient (affectation des recruteurs aux organisations)
-- ------------------------------------------------------------
INSERT INTO Appartient (id_recruteur, siren_organisation) VALUES
(4, 123456789),
(5, 123456789),
(5, 987654321),
(6, 987654321);

-- ------------------------------------------------------------
-- Fiches de poste
-- ------------------------------------------------------------
INSERT INTO FicheDePoste (intitule, nom_poste, responsable, lieu, salaire_min, salaire_max, description, siren_organisation) VALUES
('Développeur Backend', 'Développeur', 'Marie Durand','Paris', 38000, 50000, "Développement d\'APIs REST en Python/Django.", 123456789),
('Data Analyst', 'Analyste de données','Paul Girard', 'Lyon', 35000, 48000, 'Analyse et visualisation de données clients.', 987654321),
('Chef de projet digital', 'Chef de projet', 'Sophie Blanc', 'Paris', 45000, 60000, 'Pilotage de projets web.', 123456789),
('Développeur Frontend',   'Développeur',       'Marc Noir',    'Bordeaux', 32000, 42000, "Intégration d\'interfaces en React/TypeScript.", 111222333);

-- ------------------------------------------------------------
-- Offres d'emploi
-- ------------------------------------------------------------
INSERT INTO OffreEmploi (statut, date_expiration, description, nb_prises_demandes, siren_organisation) VALUES
('publiee',  '2026-06-30', 'Poste de dev backend ouvert immédiatement.', 2, 123456789),
('publiee',  '2026-05-15', 'Recherche analyste data expérimenté.', 1, 987654321),
('inactive', '2026-07-01', 'Offre en préparation pour chef de projet.', 1, 123456789),
('expiree',  '2025-12-31', 'Offre expirée pour développeur frontend.', 3, 111222333);
-- id_offre : 1, 2, 3, 4

-- ------------------------------------------------------------
-- Candidatures
-- ------------------------------------------------------------
INSERT INTO Candidature (date, id_candidat, id_offre) VALUES
('2026-03-10', 7, 1),
('2026-03-12', 8, 1),
('2026-03-15', 9, 2),
('2026-03-18', 7, 2),
('2026-03-20', 10, NULL);

-- ------------------------------------------------------------
-- Documents de candidature
-- ------------------------------------------------------------
INSERT INTO DocumentsCandidature (nom, id_candidature) VALUES
('CV_Gaelle_Thomas.pdf',        1),
('Lettre_motivation_Gaelle.pdf',1),
('CV_Hugo_Petit.pdf',           2),
('CV_Ines_Robert.pdf',          3),
('Portfolio_Ines_Robert.pdf',   3),
('LM_Ines_Robert.pdf',         3),
('CV_Gaelle_Thomas_v2.pdf',     4),
('CV_Jules_Richard.pdf',        5);
