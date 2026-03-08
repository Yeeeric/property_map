import type { FeatureCollection, Feature } from "geojson";

export type AttributeRow = {
  POA_CODE: string;
  POA_NAME?: string;
  vacancy_rate?: number;
  owner_occupier_ratio?: number;
  population?: number;
};

export type AttributesByLga = Record<string, AttributeRow>;

export function joinAttributesToGeojson(
  boundaries: FeatureCollection,
  attributesByLga: AttributesByLga
): FeatureCollection {
  const features = boundaries.features.map((f) => {
    const props = f.properties ?? {};
    const code = String(props["POA_CODE"] ?? "");
    const attrs = attributesByLga[code];

    const mergedProps = {
      ...props,
      ...(attrs ? attrs : {})
    };

    const out: Feature = {
      ...f,
      properties: mergedProps
    };

    return out;
  });

  return {
    ...boundaries,
    features
  };
}