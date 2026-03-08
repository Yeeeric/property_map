import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { FeatureCollection } from "geojson";

export type HoverInfo = {
  x: number;
  y: number;
  code?: string;
  name?: string;
  properties: Record<string, unknown>;
};

type NumericFilter = {
  enabled: boolean;
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
};

type FiltersByField = Record<string, NumericFilter>;

type Props = {
  joined: FeatureCollection | null;
  filters: FiltersByField;
  onHover: (info: HoverInfo | null) => void;
};

const SOURCE_ID = "postcode-source";
const LAYER_MATCH = "postcode-match";
const LAYER_OTHER = "postcode-other";

const EXCLUDED_FIELDS = new Set(["POA_CODE", "POA_NAME"]);

function enabledFilters(filters: FiltersByField): Array<[string, NumericFilter]> {
  return Object.entries(filters).filter(([, f]) => f.enabled);
}

function buildMatchFilter(filters: FiltersByField): any | null {
  const enabled = enabledFilters(filters);
  if (enabled.length === 0) return null;
  const parts: any[] = [];
  for (const [field, f] of enabled) {
    const n: any = ["to-number", ["get", field], -1];
    parts.push(["has", field]);
    parts.push([">=", n, f.valueMin]);
    parts.push(["<=", n, f.valueMax]);
  }
  return ["all", ...parts];
}

function buildNonMatchFilter(filters: FiltersByField): any | null {
  const mf = buildMatchFilter(filters);
  if (!mf) return null;
  return ["!", mf];
}

function formatValue(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (Number.isFinite(n)) {
    return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
  }
  return String(v);
}

function prettyLabel(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function MapView({ joined, filters, onHover }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  const canRenderMap = Boolean(token && token.trim().length > 0);

  const data = useMemo(
    () => joined ?? { type: "FeatureCollection", features: [] },
    [joined]
  );

  function ensureSourceAndLayers(map: mapboxgl.Map) {
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] } as any,
      });
    }
    if (!map.getLayer(LAYER_OTHER)) {
      map.addLayer({
        id: LAYER_OTHER,
        type: "fill",
        source: SOURCE_ID,
        paint: { "fill-color": "#666", "fill-opacity": 0.1 },
      });
      map.addLayer({
        id: `${LAYER_OTHER}-outline`,
        type: "line",
        source: SOURCE_ID,
        paint: { "line-color": "#444", "line-width": 1 },
      });
    }
    if (!map.getLayer(LAYER_MATCH)) {
      map.addLayer({
        id: LAYER_MATCH,
        type: "fill",
        source: SOURCE_ID,
        paint: { "fill-color": "#2b6cb0", "fill-opacity": 0.55 },
      });
      map.addLayer({
        id: `${LAYER_MATCH}-outline`,
        type: "line",
        source: SOURCE_ID,
        paint: { "line-color": "#1a365d", "line-width": 2 },
      });
    }
  }

  function applyDataAndFilters(
    map: mapboxgl.Map,
    nextData: any,
    nextFilters: FiltersByField
  ) {
    ensureSourceAndLayers(map);
    const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
    src.setData(nextData);
    const anyEnabled = Object.values(nextFilters).some((f) => f.enabled);
    if (!anyEnabled) {
      const never: any = ["==", 1, 0];
      map.setFilter(LAYER_OTHER, null);
      map.setFilter(`${LAYER_OTHER}-outline`, null);
      map.setFilter(LAYER_MATCH, never);
      map.setFilter(`${LAYER_MATCH}-outline`, never);
      return;
    }
    const mf = buildMatchFilter(nextFilters);
    const nmf = buildNonMatchFilter(nextFilters);
    map.setFilter(LAYER_MATCH, mf);
    map.setFilter(`${LAYER_MATCH}-outline`, mf);
    map.setFilter(LAYER_OTHER, nmf);
    map.setFilter(`${LAYER_OTHER}-outline`, nmf);
  }

  useEffect(() => {
    if (!containerRef.current || !canRenderMap || mapRef.current) return;
    mapboxgl.accessToken = token!;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [133.0, -28.0],
      zoom: 4,
    });
    mapRef.current = map;
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "top-right"
    );
    const onLoad = () => {
      applyDataAndFilters(map, data as any, filters);
      map.on("mousemove", LAYER_OTHER, (e) => handleHover(map, e));
      map.on("mousemove", LAYER_MATCH, (e) => handleHover(map, e));
      map.on("mouseleave", LAYER_OTHER, () => clearHover(map));
      map.on("mouseleave", LAYER_MATCH, () => clearHover(map));
    };
    map.on("load", onLoad);
    return () => {
      map.off("load", onLoad);
      map.remove();
      mapRef.current = null;
    };
  }, [canRenderMap, token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      map.once("load", () => applyDataAndFilters(map, data as any, filters));
      return;
    }
    applyDataAndFilters(map, data as any, filters);
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      map.once("load", () => applyDataAndFilters(map, data as any, filters));
      return;
    }
    applyDataAndFilters(map, data as any, filters);
  }, [filters]);

  function handleHover(
    map: mapboxgl.Map,
    e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }
  ) {
    const f = e.features?.[0];
    if (!f) return;
    map.getCanvas().style.cursor = "pointer";
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const info: HoverInfo = {
      x: e.point.x,
      y: e.point.y,
      code: props["POA_CODE"] ? String(props["POA_CODE"]) : undefined,
      name: props["POA_NAME"] ? String(props["POA_NAME"]) : undefined,
      properties: props,
    };
    setHover(info);
    onHover(info);
  }

  function clearHover(map: mapboxgl.Map) {
    map.getCanvas().style.cursor = "";
    setHover(null);
    onHover(null);
  }

  return (
    <div style={{ height: "100%", width: "100%" }}>
      {!canRenderMap ? (
        <div style={{ padding: 16 }}>
          <div className="badge">Mapbox token required</div>
          <div className="note">
            Create <code>apps/web/.env.local</code> with{" "}
            <code>VITE_MAPBOX_TOKEN</code>.
          </div>
        </div>
      ) : null}
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      {hover ? (
        <div className="tooltip">
          <div className="tooltip-title">
            Postcode {hover.code ?? "—"}
            {hover.name ? ` · ${hover.name}` : ""}
          </div>
          {Object.entries(hover.properties)
            .filter(([k]) => !EXCLUDED_FIELDS.has(k))
            .map(([k, v]) => (
              <div key={k} className="tooltip-row">
                <span className="tooltip-key">{prettyLabel(k)}</span>
                <span className="tooltip-value">{formatValue(v)}</span>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}