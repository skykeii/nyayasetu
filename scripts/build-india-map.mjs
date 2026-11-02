// Builds lib/india-paths.ts from DataMeet's India boundaries (CC BY 4.0, https://github.com/datameet/maps).
//   node scripts/build-india-map.mjs <states.geojson> <dists11.geojson>
// Both files are in website/docs/data/geojson in that repository. No network at runtime.
// Ladakh is not separate in states.geojson, so it is built from the Leh and Kargil districts of dists11.geojson.
import fs from "fs";
import { geoArea, geoConicEqualArea, geoPath } from "d3-geo";
import { topology } from "topojson-server";
import { feature, merge } from "topojson-client";
import { presimplify, quantile, simplify } from "topojson-simplify";

const [statesFile, distsFile] = process.argv.slice(2);
if (!statesFile || !distsFile) {
  console.error("Usage: node scripts/build-india-map.mjs <states.geojson> <dists11.geojson>");
  process.exit(1);
}
const W = 760;
const H = 860;
const INSET_LD = [[20, 640], [120, 800]];
const INSET_AN = [[630, 560], [740, 830]];
const TARGET_BYTES = 180 * 1024;

const RENAME = {
  "Andaman & Nicobar Island": "Andaman & Nicobar Islands",
  "Arunanchal Pradesh": "Arunachal Pradesh",
  "NCT of Delhi": "Delhi",
};
const MERGED_UT = "Dadra & Nagar Haveli and Daman & Diu";
const CODES = { "Andaman & Nicobar Islands": "AN", "Andhra Pradesh": "AP", "Arunachal Pradesh": "AR", Assam: "AS", Bihar: "BR", Chandigarh: "CH", Chhattisgarh: "CG", [MERGED_UT]: "DD", Goa: "GA", Gujarat: "GJ", Haryana: "HR", "Himachal Pradesh": "HP", "Jammu & Kashmir": "JK", Jharkhand: "JH", Karnataka: "KA", Kerala: "KL", Ladakh: "LA", Lakshadweep: "LD", "Madhya Pradesh": "MP", Maharashtra: "MH", Manipur: "MN", Meghalaya: "ML", Mizoram: "MZ", Nagaland: "NL", Delhi: "DL", Puducherry: "PY", Punjab: "PB", Rajasthan: "RJ", Sikkim: "SK", "Tamil Nadu": "TN", Telangana: "TS", Tripura: "TR", "Uttar Pradesh": "UP", Uttarakhand: "UK", "West Bengal": "WB", Odisha: "OD" };
const CALLOUTS = ["Delhi", "Chandigarh", "Goa", "Puducherry", MERGED_UT];
const INSETS = { Lakshadweep: INSET_LD, "Andaman & Nicobar Islands": INSET_AN };

const states = JSON.parse(fs.readFileSync(statesFile, "utf8")).features;
const dists = JSON.parse(fs.readFileSync(distsFile, "utf8")).features.filter((f) => /Jammu/.test(f.properties.ST_NM));

// Build shapes; J&K and Ladakh come from districts because they share an internal line missing from the state file.
const objects = {};
for (const f of states) {
  const raw = f.properties.ST_NM;
  if (raw === "Jammu & Kashmir" || raw === "Dadara & Nagar Havelli" || raw === "Daman & Diu") continue;
  objects[RENAME[raw] ?? raw] = f;
}
const isLadakh = (f) => /^(Leh|Kargil)/.test(f.properties.DISTRICT);
const fc = (features) => ({ type: "FeatureCollection", features });
const jkParts = fc(dists.filter((f) => !isLadakh(f)));
const ladakhParts = fc(dists.filter(isLadakh));
const utParts = fc(states.filter((f) => f.properties.ST_NM === "Dadara & Nagar Havelli" || f.properties.ST_NM === "Daman & Diu"));
const dissolve = (collection) => {
  const t = topology({ c: collection }, 1e6);
  return { type: "Feature", properties: {}, geometry: merge(t, t.objects.c.geometries) };
};
objects["Jammu & Kashmir"] = dissolve(jkParts);
objects.Ladakh = dissolve(ladakhParts);
objects[MERGED_UT] = dissolve(utParts);

const names = Object.keys(objects).sort();
if (names.length !== 36) throw new Error(`Expected 36 states and UTs, found ${names.length}: ${names}`);
for (const n of names) if (!CODES[n]) throw new Error(`No code for ${n}`);

// d3 treats polygons as spherical, so a wrongly wound ring would cover the rest of the globe
function rewind(f) {
  const fix = (polygon) => {
    const p = { type: "Polygon", coordinates: polygon };
    return geoArea(p) > 2 * Math.PI ? polygon.map((r) => [...r].reverse()) : polygon;
  };
  if (f.geometry.type === "Polygon") return { ...f, geometry: { type: "Polygon", coordinates: fix(f.geometry.coordinates) } };
  return { ...f, geometry: { type: "MultiPolygon", coordinates: f.geometry.coordinates.map(fix) } };
}

const conic = () => geoConicEqualArea().parallels([12, 32]).rotate([-80, 0]);
const topo = presimplify(topology(Object.fromEntries(names.map((n) => [n, objects[n]])), 1e6));

function build(q) {
  const min = quantile(topo, q);
  const simple = simplify(topo, min);
  const features = Object.fromEntries(names.map((n) => [n, rewind(feature(simple, simple.objects[n]))]));
  const mainland = { type: "FeatureCollection", features: names.filter((n) => !INSETS[n]).map((n) => features[n]) };
  const mainPad = 16;
  const main = conic().fitExtent([[mainPad, mainPad], [W - 130, H - mainPad]], mainland);
  const out = names.map((n) => {
    const proj = INSETS[n] ? conic().fitExtent(INSETS[n], features[n]) : main;
    const path = geoPath(proj).digits(1);
    const d = path(features[n]);
    const [cx, cy] = path.centroid(features[n]);
    return { name: n, code: CODES[n], d, cx: Math.round(cx), cy: Math.round(cy), small: CALLOUTS.includes(n) || undefined, inset: INSETS[n] ? true : undefined };
  });
  return out;
}

let shapes;
for (const q of [0.3, 0.2, 0.15, 0.1, 0.08, 0.06, 0.05, 0.04, 0.03, 0.025, 0.02, 0.015, 0.01]) {
  shapes = build(q);
  const size = JSON.stringify(shapes).length;
  if (size <= TARGET_BYTES) {
    console.log(`Simplified at quantile ${q}: ${Math.round(size / 1024)} KB`);
    break;
  }
}
const missing = shapes.filter((s) => !s.d);
if (missing.length) throw new Error(`Empty shapes: ${missing.map((s) => s.name)}`);

const lines = shapes.map((s) => `  { name: ${JSON.stringify(s.name)}, code: "${s.code}", cx: ${s.cx}, cy: ${s.cy}${s.small ? ", small: true" : ""}${s.inset ? ", inset: true" : ""}, d: ${JSON.stringify(s.d)} },`);
const body = `// Generated by scripts/build-india-map.mjs. Do not edit by hand.
// Boundaries: DataMeet India community, CC BY 4.0 (https://github.com/datameet/maps).
export interface IndiaShape {
  name: string;
  code: string;
  cx: number;
  cy: number;
  small?: boolean;
  inset?: boolean;
  d: string;
}

export const MAP_WIDTH = ${W};
export const MAP_HEIGHT = ${H};
export const INSET_BOXES = [
  { label: "Lakshadweep", x: ${INSET_LD[0][0] - 8}, y: ${INSET_LD[0][1] - 18}, w: ${INSET_LD[1][0] - INSET_LD[0][0] + 16}, h: ${INSET_LD[1][1] - INSET_LD[0][1] + 26} },
  { label: "Andaman & Nicobar", x: ${INSET_AN[0][0] - 8}, y: ${INSET_AN[0][1] - 18}, w: ${INSET_AN[1][0] - INSET_AN[0][0] + 16}, h: ${INSET_AN[1][1] - INSET_AN[0][1] + 26} },
];

export const INDIA_SHAPES: IndiaShape[] = [
${lines.join("\n")}
];
`;
fs.writeFileSync(new URL("../lib/india-paths.ts", import.meta.url), body);
console.log(`Wrote lib/india-paths.ts: ${shapes.length} shapes, ${Math.round(body.length / 1024)} KB`);
