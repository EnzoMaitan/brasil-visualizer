// Projects the real IBGE GeoJSON into SVG paths once, at load.
// Equirectangular projection with cos(centerLat) aspect correction — accurate
// enough for a national choropleth and keeps Brazil's familiar silhouette.
import { BR_STATES_GEOJSON } from "../data/br-states.geo";
import type { Position, StateFeature } from "../data/types";

export interface StatePath {
  d: string;
  centroid: [number, number];
  area: number;
  bbox: [number, number, number, number];
}

const gj = BR_STATES_GEOJSON;
const W = 1000, PAD = 26;

// bounds across all coordinates
let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
function scanRing(r: Position[]) {
  for (const [lon, lat] of r) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
}
function scanGeom(g: StateFeature["geometry"]) {
  (g.type === "Polygon" ? [g.coordinates] : g.coordinates).forEach((poly) => poly.forEach(scanRing));
}
gj.features.forEach((f) => scanGeom(f.geometry));

const cosC = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
const rawW = (maxLon - minLon) * cosC;
const rawH = maxLat - minLat;
const scale = (W - 2 * PAD) / rawW;
const H = Math.round(rawH * scale + 2 * PAD);
function project(lon: number, lat: number): [number, number] {
  return [PAD + (lon - minLon) * cosC * scale, PAD + (maxLat - lat) * scale];
}

function ringPath(r: Position[]): string {
  let s = "";
  for (let i = 0; i < r.length; i++) {
    const [x, y] = project(r[i][0], r[i][1]);
    s += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return s + "Z";
}
// shoelace area + centroid of a projected ring
function ringStats(r: Position[]): { area: number; cx: number; cy: number } {
  let a = 0, cx = 0, cy = 0;
  const p0 = project(r[0][0], r[0][1]);
  let px = p0[0], py = p0[1];
  for (let i = 1; i < r.length; i++) {
    const [x, y] = project(r[i][0], r[i][1]);
    const cross = px * y - x * py;
    a += cross;
    cx += (px + x) * cross;
    cy += (py + y) * cross;
    px = x;
    py = y;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-6) return { area: 0, cx: px, cy: py };
  return { area: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
}

const paths: Record<string, StatePath> = {};
gj.features.forEach((f) => {
  const code = f.properties.code;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = "";
  let best = { area: -1, cx: 0, cy: 0 };
  let total = 0;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  polys.forEach((poly) => {
    poly.forEach((ring, ri) => {
      d += ringPath(ring);
      if (ri === 0) {
        const st = ringStats(ring);
        total += st.area;
        if (st.area > best.area) best = st;
      }
    });
    // bbox from outer ring
    poly[0].forEach(([lon, lat]) => {
      const [x, y] = project(lon, lat);
      if (x < bx0) bx0 = x;
      if (y < by0) by0 = y;
      if (x > bx1) bx1 = x;
      if (y > by1) by1 = y;
    });
  });
  paths[code] = { d, centroid: [best.cx, best.cy], area: total, bbox: [bx0, by0, bx1, by1] };
});

export const BR_GEO = { width: W, height: H, paths, project };
