# TrainTracker

Suivi en temps réel des trains SNCF sur une carte interactive. L'application combine les données GTFS statiques (horaires, gares) et GTFS-RT (retards en direct) pour afficher la position du train, les horaires réels et l'ETA à destination.

## Repos

| Partie | Repo |
|---|---|
| Backend | [TrainTracker-backend](https://github.com/ayoub-el-moutaouakkil/TrainTracker-backend) |
| Frontend | [TrainTracker-frontend](https://github.com/ayoub-el-moutaouakkil/TrainTracker-frontend) |

## Architecture

```
TrainTracker/
├── backend/   # API REST — Spring Boot / Java 17
└── front/     # Interface — Angular 21 + Leaflet
```

## Fonctionnalités

- Recherche d'un train par numéro et date
- Carte interactive : tracé de la route, position du train interpolée entre deux gares
- Retard en temps réel, ETA, prochain arrêt
- Rafraîchissement automatique (toutes les 30 s côté client, 2 min côté serveur)
- Pas d'authentification requise — données open data SNCF

## Lancer le projet

### Backend

```bash
cd backend
./mvnw spring-boot:run
```

Démarre sur `http://localhost:8080`. Le chargement initial des données GTFS prend quelques secondes.

### Frontend

```bash
cd front
npm install
npm start
```

Démarre sur `http://localhost:4200`.

## API

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/api/journeys` | Démarre le tracking d'un train |
| `GET` | `/api/journeys` | Liste tous les trajets suivis |
| `GET` | `/api/journeys/{id}` | Position + ETA + retard |
| `POST` | `/api/journeys/{id}/refresh` | Mise à jour forcée |
| `DELETE` | `/api/journeys/{id}` | Arrête le tracking |

**Exemple :**

```json
POST /api/journeys
{ "trainNumber": "6201", "date": "2026-05-10" }
```

## Sources de données

| Source | Description |
|---|---|
| `eu.ftp.opendatasoft.com` — SNCF GTFS | Horaires et gares (statique) |
| `proxy.transport.data.gouv.fr` — GTFS-RT | Retards en temps réel |

Aucune clé API nécessaire.

## Collection Postman

`TrainTracker.postman_collection.json` à la racine — importer dans Postman pour tester tous les endpoints.
