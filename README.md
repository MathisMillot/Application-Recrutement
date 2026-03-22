# 📋 Application de Recrutement

> Projet réalisé dans le cadre de l'UV **SR10** — Université de Technologie de Compiègne (UTC)

## Description

Application web de recrutement permettant de mettre en relation **candidats**, **recruteurs** et **administrateurs**. La plateforme offre une gestion complète du processus de recrutement, de la publication des offres d'emploi jusqu'au suivi des candidatures.

## Acteurs

| Acteur | Rôle |
|--------|------|
| **Utilisateur** | Utilisateur non-authentifié — accès aux fonctionnalités de base (inscription, connexion, consultation des offres) |
| **Candidat** | Recherche et postule à des offres d'emploi, gère ses candidatures |
| **Recruteur** | Publie et gère les offres d'emploi, consulte les candidatures reçues |
| **Administrateur** | Gère les utilisateurs, valide les demandes d'organisation et de rôle recruteur |

## Fonctionnalités

### Utilisateur (tous)
- Créer un compte
- S'authentifier / Se déconnecter
- Lister les offres d'emploi
- Rechercher une offre
- Consulter le détail d'une offre

### Candidat
- Candidater à une offre
- Modifier / Compléter une candidature
- Annuler une candidature
- Lister ses candidatures
- Demander à devenir recruteur
- Demander la création d'une organisation

### Recruteur
- Ajouter une offre d'emploi
- Éditer / Supprimer une offre d'emploi
- Lister ses offres
- Consulter les candidatures reçues sur une offre
- Télécharger les dossiers de candidature

### Administrateur
- Gérer les utilisateurs
- Attribuer le rôle administrateur
- Valider / Refuser les demandes d'organisation
- Valider / Refuser les demandes de rôle recruteur

## Design / Maquettes

🎨 **[Voir le design interactif sur Figma](https://www.figma.com/design/xgd9JJ3HCEs81UgGbPXefr/Projet-SR10?node-id=1-410&t=ae0jYcE9vUCI0NpB-1)**

![Aperçu des maquettes](design/maquette.png)

## Structure du projet

```
.
├── README.md
├── .gitignore
├── design/
│   └── maquette.png           # Aperçu des maquettes (Figma)
├── MCD/
│   └── MCD.puml               # Modèle Conceptuel de Données (PlantUML)
├── MLD/
│   ├── MLD.puml               # Modèle Logique de Données (PlantUML)
│   ├── MLD.md                  # Documentation du MLD
│   └── MLD_SR10.png            # Export du diagramme MLD
├── SQL/
│   └── BDD_SR10.sql            # Script SQL de création de la base de données
└── use_cases/
    ├── use_cases.puml          # Diagramme de cas d'utilisation (PlantUML)
    └── use_cases.docx          # Documentation des cas d'utilisation
```

## Outils & Technologies

- **Design** : [Figma](https://www.figma.com/) pour les maquettes UI
- **Modélisation** : [PlantUML](https://plantuml.com/) pour les diagrammes UML (cas d'utilisation, MCD, MLD)
- **Base de données** : SQL
- **Hébergement** : [GitLab UTC](https://gitlab.utc.fr)

## Auteurs

- **Mathis Millot** — UTC GI02
- **Romain Pierre** — UTC GI02
