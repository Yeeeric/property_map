import type { FeatureCollection } from "geojson";
import { parseCsv } from "./csv";
import type { AttributesByLga } from "./join";

export async function loadDatasets(): Promise<{
  boundaries: FeatureCollection;
  attributes: AttributesByLga;
}> {
  const [boundariesRes, csvRes] = await Promise.all([
    fetch("/data/postcode.geojson"),
    fetch("/data/attributes.csv")
  ]);

  if (!boundariesRes.ok) throw new Error(`Failed to load postcode.geojson (${boundariesRes.status})`);
  if (!csvRes.ok) throw new Error(`Failed to load attributes.csv (${csvRes.status})`);

  const boundaries = (await boundariesRes.json()) as FeatureCollection;
  const csvText = await csvRes.text();
  const rows = parseCsv(csvText);

  const attributes: AttributesByLga = {};

  for (const r of rows) {
    const code = String(r["POA_CODE"] ?? "").trim();
    if (!code) continue;

    const out: any = { POA_CODE: code };

    for (const [k, v] of Object.entries(r)) {
      if (k === "POA_CODE") continue;
      const trimmed = v.trim();
      const n = Number(trimmed);
      out[k] = trimmed !== "" && Number.isFinite(n) ? n : trimmed;
    }

    attributes[code] = out;
  }

  return { boundaries, attributes };
}