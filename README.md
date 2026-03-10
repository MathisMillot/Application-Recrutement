# 📋 Application de Recrutement

> Projet réalisé dans le cadre de l'UV **SR10** — Université de Technologie de Compiègne (UTC)

## Description

Application web de recrutement permettant de mettre en relation **candidats**, **recruteurs** et **administrateurs**. La plateforme offre une gestion complète du processus de recrutement, de la publication des offres d'emploi jusqu'au suivi des candidatures.

## 🎭 Acteurs

| Acteur | Rôle |
|--------|------|
| **Utilisateur** | Utilisateur non-authentifié — accès aux fonctionnalités de base (inscription, connexion, consultation des offres) |
| **Candidat** | Recherche et postule à des offres d'emploi, gère ses candidatures |
| **Recruteur** | Publie et gère les offres d'emploi, consulte les candidatures reçues |
| **Administrateur** | Gère les utilisateurs, valide les demandes d'organisation et de rôle recruteur |

## ⚙️ Fonctionnalités

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

## 📁 Structure du projet

```
.
├── .gitlab-ci.yml          # Pipeline CI/CD (SAST + Secret Detection)
├── README.md
└── use_cases/
    ├── use_cases.puml      # Diagramme de cas d'utilisation (PlantUML)
    └── use_cases.docx      # Documentation des cas d'utilisation
```

## 🛠️ Outils & Technologies

- **Modélisation** : [PlantUML](https://plantuml.com/) pour les diagrammes UML
- **CI/CD** : GitLab CI avec SAST et Secret Detection
- **Hébergement** : [GitLab UTC](https://gitlab.utc.fr)

## 🚀 Démarrage rapide

### Cloner le dépôt

```bash
git clone https://gitlab.utc.fr/millomat/application-de-recrutement.git
cd application-de-recrutement
```

### Générer le diagramme de cas d'utilisation

```bash
# Avec PlantUML installé localement
plantuml use_cases/use_cases.puml

# Ou via Docker
docker run --rm -v $(pwd):/data plantuml/plantuml use_cases/use_cases.puml
```

## 👥 Auteurs

- **millomat** — UTC GI02

## 📄 Licence

Projet universitaire — UTC SR10
