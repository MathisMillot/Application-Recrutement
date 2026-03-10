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

## Structure du projet

```
.
├── README.md
└── use_cases/
    ├── use_cases.puml      
    └── use_cases.docx      
```

## Outils & Technologies

- **Modélisation** : [PlantUML](https://plantuml.com/) pour les diagrammes UML
- **Hébergement** : [GitLab UTC](https://gitlab.utc.fr)

## Auteur

- **Mathis Millot** — UTC GI02
