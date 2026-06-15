// Shared data-layer types. Kept deliberately small: the frontend treats
// indicator keys, regions, and periods as opaque data (see root CLAUDE.md §2).

export type Lang = "en" | "pt-BR";

export interface StateMeta {
  sigla: string;
  name: string;
  capital: string;
  region: number; // 1 South, 2 Southeast, 3 North, 4 Northeast, 5 Center-West
  area_km2: number;
}

// A per-state indicator snapshot for one year. Indicator props are dynamic
// (keyed by the vocabulary in modes.ts), so we use an index signature.
export interface StateRecord {
  code: string;
  year: number;
  [prop: string]: number | string;
}

// --- GeoJSON (only the subset we project) ---
export type Position = [number, number];
export type PolygonCoords = Position[][];
export type MultiPolygonCoords = Position[][][];

export interface StateFeature {
  type: "Feature";
  properties: { name: string; sigla: string; code: string; regiao: string };
  geometry:
    | { type: "Polygon"; coordinates: PolygonCoords }
    | { type: "MultiPolygon"; coordinates: MultiPolygonCoords };
}

export interface StatesGeoJSON {
  type: "FeatureCollection";
  features: StateFeature[];
}
