# TrainTracker — Frontend

Interface Angular pour suivre un train SNCF en temps réel sur une carte interactive.

## Stack

- Angular 21 (standalone components)
- Leaflet 1.9 — carte interactive
- RxJS — polling automatique
- TypeScript 5.9

## Fonctionnalités

- Recherche d'un train par numéro et par date
- Carte interactive avec :
  - Tracé de la route (portion passée en gris, portion restante en bleu)
  - Marqueurs de gares avec popup (horaires prévus/réels, statut)
  - Position du train interpolée entre deux gares
  - Gare suivante mise en évidence (orange)
- Indicateur de retard (à l'heure / retard / avance)
- Rafraîchissement automatique toutes les 30 secondes
- Panneau latéral rétractable avec les infos du trajet

## Lancer le projet

```bash
npm install
npm start
```

L'application est disponible sur `http://localhost:4200`.

Le backend doit tourner sur `http://localhost:8080` (voir `../backend`).

## Build de production

```bash
npm run build
```

Les fichiers sont générés dans `dist/`.

## Tests

```bash
npm test
```

## Structure

```
src/app/
├── pages/
│   └── tracking-page/       # Page principale (carte + panneau)
├── services/
│   ├── train-tracking.service.ts   # Appels API backend
│   └── railway.service.ts          # Projection de position sur la route
└── models/
    └── tracking.model.ts    # Types TrackingResponse, StopInfo, etc.
```
