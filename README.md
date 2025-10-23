# Ryan 3D World

Ryan's 3D world is a lightweight personal experience that showcases five themed islands, interactive hotspots, and overlay content sourced from `content/profile.json`. The project is written in TypeScript, powered by Three.js, and bundled with Vite.

## Features

- **Five interactive islands** arranged around a central hub: cooking, infrastructure, gardening, AI, and music.
- **Accessible UI** with keyboard navigation, overlay panels, HTML labels, and aria-live announcements.
- **Hash-based routing** for deep links to interests, projects, writing, talks, resume, and contact information.
- **Reduced motion awareness** and an audio controller with persisted preferences.
- **Automatic fallback** page that renders the same content when WebGL is unavailable.

## Project structure

- `src/world` – Three.js scene setup, camera rig, hotspots, labels, and island builders.
- `src/ui` – HUD navigation, overlay panels, and router helpers.
- `src/utils` – Asset loader (procedural textures) and audio controller.
- `content/profile.json` – Single source of truth for profile data.
- `src/fallback/index.html` – Static experience served when WebGL checks fail.

## Development

```bash
npm install
npm run dev
```

The dev server starts on port 5173. Navigate to `http://localhost:5173` and explore the 3D world. Press `H` to return home, `1-5` to jump to islands, and use the HUD toggles for theme and audio.

## Building & previewing

```bash
npm run build
npm run preview
```

The preview server hosts the production build on port 4173.

## Fallback experience

If `supports3D()` detects missing WebGL2 features, users are redirected to the fallback page. You can test it manually by visiting `/src/fallback/index.html` during development.

## Data updates

All overlay and fallback content is populated from [`content/profile.json`](content/profile.json). Update that file to change skills, links, projects, or island summaries.

## Deployment notes

- Ensure `/content/profile.json` and the fallback HTML are hosted alongside the bundle.
- Keep the gzipped build under 2 MB by relying on procedurally generated assets.
- The site is static and can be served from any CDN or static file host.

## Commands history

- npm create vite@latest ryan-world -- --template vanilla-ts
- npm i three
- npm run dev
- npm run build
- python3 -m http.server 4173 from dist for a simple local serve
