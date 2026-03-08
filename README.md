# Spatial Webapp (React + Mapbox GL) — Starter Scaffold

This repo is a starter for a spatial filtering webapp:
- Loads LGA boundaries (GeoJSON) + attributes (JSON).
- Joins on `LGA_CODE`.
- Filters by vacancy rate threshold.
- Highlights matching LGAs on the map.
- Shows hover tooltip.

## 1) Prerequisites
- Node.js 18+ (recommended)
- A Mapbox access token (create one in Mapbox Studio)

## 2) Setup
From the repo root:

```bash
npm install
npm run dev
```

## 3) Configure Mapbox token
Create `apps/web/.env.local`:

```bash
VITE_MAPBOX_TOKEN=YOUR_TOKEN_HERE
```

## 4) Data files
The web app reads from `apps/web/public/data/`:
- `lga.geojson` (polygons with `LGA_CODE` in `properties`)
- `attributes.json` (object keyed by `LGA_CODE`)

Placeholders are provided so the app runs immediately.

## 5) Data pipeline (placeholder)
See `packages/data-pipeline/` for scripts and structure. The included Python scripts are placeholders
to show how to:
- convert shapefile -> GeoJSON
- simplify geometry
- normalise attributes
- output `lga.geojson` + `attributes.json`

## Notes
- For large datasets, move to vector tiles and/or a PostGIS backend.
