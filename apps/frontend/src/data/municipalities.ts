// Lazy loader for municipality geometry — the ~2.9MB mesh is its own Vite chunk, fetched
// only when the user first enables the "show municipalities" toggle (mirrors the on-demand
// pattern of dataset.ts). Projects each municipality to an SVG path via the SAME transform
// as the states (projection.ts), tags it with its parent UF code (first 2 digits of the
// IBGE code) for color inheritance, and memoizes the result so projection runs once.
import { geometryToPath } from "../viz/projection";
import type { MuniPath } from "./types";

let cache: MuniPath[] | null = null;
let inFlight: Promise<MuniPath[]> | null = null;

export function loadMunicipalities(): Promise<MuniPath[]> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;
  inFlight = import("./br-municipalities.geo")
    .then((mod) => {
      const paths: MuniPath[] = mod.default.features.map((f) => ({
        code: f.code,
        parentCode: f.code.slice(0, 2),
        d: geometryToPath(f.geometry),
      }));
      cache = paths;
      inFlight = null;
      return paths;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}
