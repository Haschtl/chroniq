# ChronIQ

ChronIQ ist eine standalone PWA fuer lokale Partyspiele im Browser. Der erste Modus ist ein Hitster-aehnliches Timeline-Spiel mit Spotify-Generator: Teams ziehen verdeckte Karten, hoeren nur das Audio, sortieren die Karte in ihre Timeline ein und andere Teams koennen mit Korrekturpunkten widersprechen.

## Tech Stack

- React
- TanStack Router
- Vite
- TypeScript
- PWA-Manifest und Service Worker
- Persistenter Browser-State via `localStorage`

## Entwicklung

```bash
pnpm install
pnpm dev
```

Oeffne die App lokal fuer Spotify-Login ueber `http://127.0.0.1:5173`, nicht ueber `localhost`.

Build und Typecheck:

```bash
pnpm build
pnpm typecheck
```

## Connectoren, Spielstand und Historie

Der komplette App-State liegt versioniert unter `chroniq:app-state:v1` im Browser-`localStorage`. Dadurch bleiben Connector-Status, aktives Spiel und Historie nach Reloads erhalten. Abgeschlossene Spiele koennen in die Historie verschoben werden.

Der Spotify-Connector nutzt Authorization Code mit PKCE direkt im Browser. Lege im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) eine App an, trage fuer lokale Entwicklung als Redirect URI `http://127.0.0.1:5173/connectors/spotify/callback` ein und hinterlege die Client ID als Build-Konfiguration. Spotify erlaubt `localhost` nicht mehr als Redirect URI; HTTP ist nur fuer Loopback-IP-Adressen wie `127.0.0.1` erlaubt. Der Spotify-Generator verlangt einen verbundenen Spotify-Connector, nimmt einen Spotify-Seed entgegen und praesentiert Karten in der Runde nur als Audio-Control. Titel, Artist, Cover und Jahr werden erst in Aufloesung und Timeline sichtbar.

Fuer lokale Entwicklung liegt die Spotify Client ID in `.env.local`:

```bash
VITE_SPOTIFY_CLIENT_ID=deine_spotify_client_id
```

Die Client ID ist bei PKCE kein Secret und darf im Frontend-Bundle enthalten sein. Nutzer der fertigen App muessen keine eigene Client ID eintragen.

## Projektstruktur

- `src/types.tsx`: zentrale Domain-Typen fuer Game, Teams, Generator, Connectoren, Runden und App-State
- `src/game.ts`: Game-Logik, Demo-Generator, Rundenauswertung, Archivierung
- `src/store.ts`: persistenter Browser-State
- `src/router.tsx`: TanStack Router und Screens
- `public/manifest.webmanifest`: PWA-Metadaten
- `public/sw.js`: einfacher App-Shell Cache
