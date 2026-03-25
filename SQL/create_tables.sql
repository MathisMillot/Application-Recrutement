-- ============================================================
-- MLD - Application de Recrutement
-- Script de création des tables
-- ============================================================

CREATE TABLE Utilisateur (
    id_user         SERIAL          PRIMARY KEY,
    nom             VARCHAR(100)    NOT NULL,
    prenom          VARCHAR(100)    NOT NULL,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    mdp             VARCHAR(255)    NOT NULL,
    num_tel         VARCHAR(20),
    statut          VARCHAR(10)     NOT NULL CHECK (statut IN ('ACTIF', 'INACTIF'))
);

CREATE TABLE Candidat (
    id_user         INT             PRIMARY KEY,
    documents       TEXT,
    FOREIGN KEY (id_user) REFERENCES Utilisateur(id_user)
);

CREATE TABLE Admin (
    id_user         INT             PRIMARY KEY,
    FOREIGN KEY (id_user) REFERENCES Utilisateur(id_user)
);

CREATE TABLE Recruteur (
    id_user                 INT     PRIMARY KEY,
    id_admin_validateur     INT     NOT NULL,
    FOREIGN KEY (id_user)               REFERENCES Utilisateur(id_user),
    FOREIGN KEY (id_admin_validateur)   REFERENCES Admin(id_user)
);

CREATE TABLE Organisation (
    siren               INT             PRIMARY KEY,
    nom                 VARCHAR(255)    NOT NULL,
    type                VARCHAR(100)    NOT NULL,
    siege_social        VARCHAR(255)    NOT NULL,
    validation          VARCHAR(10)     NOT NULL CHECK (validation IN ('ATTENTE', 'OUI', 'NON')),
    id_admin_createur   INT             NOT NULL,
    FOREIGN KEY (id_admin_createur) REFERENCES Admin(id_user)
);

CREATE TABLE Appartient (
    id_recruteur        INT     NOT NULL,
    siren_organisation  INT     NOT NULL,
    PRIMARY KEY (id_recruteur, siren_organisation),
    FOREIGN KEY (id_recruteur)      REFERENCES Recruteur(id_user),
    FOREIGN KEY (siren_organisation) REFERENCES Organisation(siren)
);

CREATE TABLE FicheDePoste (
    id_fiche            SERIAL          PRIMARY KEY,
    intitule            VARCHAR(255)    NOT NULL,
    nom_poste           VARCHAR(255)    NOT NULL,
    responsable         VARCHAR(255)    NOT NULL,
    lieu                VARCHAR(255)    NOT NULL,
    salaire_min         INT             NOT NULL,
    salaire_max         INT             NOT NULL,
    description         TEXT,
    siren_organisation  INT             NOT NULL,
    FOREIGN KEY (siren_organisation) REFERENCES Organisation(siren)
);

CREATE TABLE OffreEmploi (
    id_offre            SERIAL          PRIMARY KEY,
    statut              VARCHAR(20)     NOT NULL CHECK (statut IN ('inactive', 'publiee', 'expiree')),
    date_expiration     DATE            NOT NULL,
    description         TEXT,
    nb_prises_demandes  INT             NOT NULL DEFAULT 0,
    siren_organisation  INT             NOT NULL,
    FOREIGN KEY (siren_organisation) REFERENCES Organisation(siren)
);

CREATE TABLE Candidature (
    id_candidature  SERIAL  PRIMARY KEY,
    date            DATE    NOT NULL,
    id_candidat     INT     NOT NULL,
    id_offre        INT,
    FOREIGN KEY (id_candidat)   REFERENCES Candidat(id_user),
    FOREIGN KEY (id_offre)      REFERENCES OffreEmploi(id_offre)
);

CREATE TABLE DocumentsCandidature (
    id_dossier      SERIAL          PRIMARY KEY,
    nom             VARCHAR(255)    NOT NULL,
    id_candidature  INT             NOT NULL,
    FOREIGN KEY (id_candidature) REFERENCES Candidature(id_candidature)
);
