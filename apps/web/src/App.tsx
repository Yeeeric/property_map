// apps/web/src/App.tsx
import { useEffect, useMemo, useState } from "react";
import type { FeatureCollection, GeoJsonProperties } from "geojson";
import MapView, { HoverInfo } from "./components/Map/MapView";
import { loadDatasets } from "./data/loader";
import { joinAttributesToGeojson, type AttributesByLga } from "./data/join";

type JoinedProps = GeoJsonProperties & {
  POA_CODE?: string;
  POA_NAME?: string;
  [key: string]: unknown;
};

export type NumericFilter = {
  enabled: boolean;
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
};

export type FiltersByField = Record<string, NumericFilter>;

function computeStep(min: number, max: number): number {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return 1;
  const raw = span / 200;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const pow10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const scaled = raw / pow10;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * pow10;
}

function prettyLabel(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function App() {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [attrs, setAttrs] = useState<AttributesByLga | null>(null);
  const [filters, setFilters] = useState<FiltersByField>({});
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { boundaries, attributes } = await loadDatasets();
        setGeojson(boundaries);
        setAttrs(attributes);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load datasets.");
      }
    })();
  }, []);

  const joined: FeatureCollection | null = useMemo(() => {
    if (!geojson || !attrs) return null;
    return joinAttributesToGeojson(geojson, attrs);
  }, [geojson, attrs]);

  useEffect(() => {
    if (!attrs) return;
    const fieldValues: Record<string, number[]> = {};
    for (const row of Object.values(attrs)) {
      for (const [k, v] of Object.entries(row as any)) {
        if (k === "POA_CODE" || k === "POA_NAME" || k === "STATE") continue;
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        (fieldValues[k] ??= []).push(v);
      }
    }
    const next: FiltersByField = {};
    for (const [field, values] of Object.entries(fieldValues)) {
      if (values.length === 0) continue;
      const min = Math.min(...values);
      const max = Math.max(...values);
      if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
      if (min === max) continue;
      next[field] = {
        enabled: false,
        min,
        max,
        valueMin: min,
        valueMax: max
      };
    }
    setFilters(next);
  }, [attrs]);

  const matchCount = useMemo(() => {
    if (!joined) return 0;
    const enabled = Object.entries(filters).filter(([, f]) => f.enabled);
    if (enabled.length === 0) return joined.features.length;
    return joined.features.filter((feat) => {
      const p = (feat.properties ?? {}) as JoinedProps;
      for (const [field, f] of enabled) {
        const raw = p[field];
        const n =
          typeof raw === "number" ? raw :
          typeof raw === "string" ? Number(raw) :
          NaN;
        if (!Number.isFinite(n)) return false;
        if (n < f.valueMin || n > f.valueMax) return false;
      }
      return true;
    }).length;
  }, [joined, filters]);

  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="h1">Spatial Webapp Starter</h1>

        {error ? (
          <div className="section">
            <div className="badge">Error</div>
            <div className="kv">{error}</div>
          </div>
        ) : null}

        <div className="section">
          <div className="section-heading">Filters</div>
          {Object.keys(filters).length === 0 ? (
            <div className="note">No numeric fields detected in your attributes data.</div>
          ) : (
            Object.entries(filters).map(([field, f]) => {
              const step = computeStep(f.min, f.max);
              return (
                <div key={field} className="filter-card">
                  <div className="filter-title-row">
                    <input
                      type="checkbox"
                      checked={f.enabled}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          [field]: { ...prev[field], enabled: e.target.checked }
                        }))
                      }
                      id={`enable-${field}`}
                    />
                    <label htmlFor={`enable-${field}`} className="filter-name">
                      {prettyLabel(field)}
                    </label>
                    <span className="badge">
                      {f.valueMin.toFixed(2)} – {f.valueMax.toFixed(2)}
                    </span>
                  </div>
                  <div className="range-row">
                    <span className="range-label">Min</span>
                    <input
                      type="range"
                      min={f.min}
                      max={f.max}
                      step={step}
                      value={f.valueMin}
                      disabled={!f.enabled}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setFilters((prev) => ({
                          ...prev,
                          [field]: {
                            ...prev[field],
                            valueMin: Math.min(v, prev[field].valueMax)
                          }
                        }));
                      }}
                    />
                  </div>
                  <div className="range-row">
                    <span className="range-label">Max</span>
                    <input
                      type="range"
                      min={f.min}
                      max={f.max}
                      step={step}
                      value={f.valueMax}
                      disabled={!f.enabled}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setFilters((prev) => ({
                          ...prev,
                          [field]: {
                            ...prev[field],
                            valueMax: Math.max(v, prev[field].valueMin)
                          }
                        }));
                      }}
                    />
                  </div>
                  <div className="filter-range-note">
                    Range: {f.min.toFixed(2)} – {f.max.toFixed(2)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="section">
          <div className="section-heading">Hover details</div>
          {hover ? (
            <div className="kv">
              <div><strong>Postcode {hover.code ?? "—"}</strong></div>
            </div>
          ) : (
            <div className="note">Move the cursor over a postcode area.</div>
          )}
        </div>

        <div className="section">
          <div className="section-heading">Data contract</div>
          <div className="note">
            Boundaries: GeoJSON features must contain <code>properties.POA_CODE</code> (string).
            <br />
            Attributes: must include <code>POA_CODE</code> and numeric columns for filtering.
          </div>
        </div>
      </aside>

      <main className="map">
        <div className="match-banner">
          <span className="badge">{matchCount}</span>
          <span className="note" style={{ margin: 0 }}>Matching postcodes highlighted</span>
        </div>
        <MapView
          joined={joined}
          filters={filters}
          onHover={(info) => setHover(info)}
        />
      </main>
    </div>
  );
}