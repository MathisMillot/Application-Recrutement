# MLD — Application de Recrutement

Les clés primaires sont **soulignées** (notées `PK`), les clés étrangères sont notées `FK`.

---

**Utilisateur**(<u>id_user</u> `PK`, nom, prenom, email, mdp, num_tel `[0..1]`, statut)

**Candidat**(<u>id_user</u> `PK, FK`, documents)

- `id_user` → Utilisateur.id_user

**Admin**(<u>id_user</u> `PK, FK`)

- `id_user` → Utilisateur.id_user

**Recruteur**(<u>id_user</u> `PK, FK`, id_admin_validateur `FK`)

- `id_user` → Utilisateur.id_user
- `id_admin_validateur` → Admin.id_user

**Organisation**(<u>siren</u> `PK`, nom, type, siege_social, validation, id_admin_createur `FK`)

- `id_admin_createur` → Admin.id_user

**Appartient**(<u>id_recruteur</u> `PK, FK`, <u>siren_organisation</u> `PK, FK`)

- `id_recruteur` → Recruteur.id_user
- `siren_organisation` → Organisation.siren

**FicheDePoste**(<u>id_fiche</u> `PK`, intitule, nom_poste, responsable, lieu, salaire_min, salaire_max, description, siren_organisation `FK`)

- `siren_organisation` → Organisation.siren

**OffreEmploi**(<u>id_offre</u> `PK`, statut, date_expiration, description, nb_prises_demandes, siren_organisation `FK`, id_fiche_de_poste `FK`)

- `siren_organisation` → Organisation.siren

**Candidature**(<u>id_candidature</u> `PK`, date, id_candidat `FK`, id_offre `FK [0..1]`, documents)

- `id_candidat` → Candidat.id_user
- `id_offre` → OffreEmploi.id_offre _(nullable)_

---

## Contraintes

- `Utilisateur.statut` ∈ {ACTIF, INACTIF}
- `Organisation.validation` ∈ {ATTENTE, OUI, NON}
- `OffreEmploi.statut` ∈ {inactive, publiee, expiree}
- Une `Candidature` doit contenir au moins un `DocumentsCandidature` (cardinalité 1..\*)
- Un `Recruteur` doit appartenir à au moins une `Organisation` (cardinalité 1..\* via **Appartient**)
- `Candidature.id_offre` est nullable (cardinalité 0..1 côté OffreEmploi)
