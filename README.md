# Ryan World

A low-poly Three.js world that presents Ryan's work and interests in an accessible, data-driven experience powered by `content/profile.json`.

## Setup

```sh
npm install
```

## Development

```sh
npm run dev
```

Vite serves the site with hot module replacement. Content updates in `content/profile.json` propagate without code changes.

## Build

```sh
npm run build
```

This emits an optimized static bundle in `dist/` that stays under the 2&nbsp;MB gzipped target by using procedural geometry and inline textures.

Preview the production build locally:

```sh
npm run preview
```

## Type Checking

```sh
npm run typecheck
```

TypeScript runs in strict mode to keep the codebase predictable.

## Editing Content

All copy, projects, posts, talks, and interest summaries live in `content/profile.json`. Update this file to refresh the 3D and fallback views.

## Progressive Enhancement

* If WebGL 2 is unavailable or `prefers-reduced-motion` is enabled, visitors are redirected to `fallback/index.html`, which renders the full profile in a 2D layout.
* Users can re-enable the 3D scene from the fallback view; their choice is persisted.
* Motion, audio, and theme toggles are exposed in the HUD and saved with `localStorage`.

## Performance Notes

* The scene uses low-poly meshes, small custom textures, and lightweight shaders.
* Render loops pause when the tab loses focus, and camera easing is disabled when motion is off.
* Audio is generated procedurally and requires an explicit user gesture to enable.

## Deploying

The project builds to static assets and can be hosted on any CDN or static site provider. Ensure `content/profile.json` is deployed alongside the bundle.

## Useful Commands

```
npm create vite@latest ryan-world -- --template vanilla-ts
npm i three
npm run dev
npm run build
python3 -m http.server 4173 from dist for a simple local serve
```
