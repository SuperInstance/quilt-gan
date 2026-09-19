// gesture.mjs — read the SHAPE of the arena's own breed trajectory.
//
// Every round, app.js appends the arena's config to `state.traj` as an exact
// ℚ¹⁶ state (dial 0 strategy, 1 palette, 2 seed, 3 cohesion, 4 score, rest 0) —
// the breed record of the arena itself. Today that record is *provenance*: the
// referee discloses it and the law is structural — **no scoring term may ever
// read state.traj**.
//
// This module reads it too, but it is NOT a scoring term. It is pure, read-only
// analysis: it never mutates its input, and it is never imported by engine.js or
// the referee. It reads the breed record's GEOMETRY — the shape of how the arena
// moved through config-space over a run — order by order:
//
//   1st  arcLength / heading  — how far the breeding travelled, and where it is
//        heading now (the d_mu: which way the next round is trending).
//   2nd  bendingEnergy        — curvature: how much the run keeps *turning
//        within a plane* (a breeder that oscillates between two strategies).
//   3rd  twistEnergy          — torsion: how much it turns *out of* that plane,
//        into a fresh config dimension (a run genuinely exploring, not pacing).
//        `planarity` is the scale-free inverse.
//
// This is the SuperInstance fleet's shared "abstraction as gesture" reading — a
// tensor approximates a function; we approximate the *shape of the motion* — the
// same three orders that read notes (musician-soul), rooms (elephant),
// conversations (tensor-midi), cells (quilt) and federated convergence
// (federated-tinyml-vessel). Here it reads an evolutionary arena's own descent.
// "The property is in the twist" (twist-engine).
//
// Pure JS (ESM), zero dependencies. Never throws on empty/degenerate input.

// The semantic dials worth reading as a trajectory. Dial 2 (seed) is per-round
// entropy — huge in magnitude and meaningless as a direction — so it is excluded
// by default; dials 5-15 are structurally zero. What remains is the arena's
// meaningful config: strategy, palette, cohesion, score.
export const SEMANTIC_DIALS = [0, 1, 3, 4];

function toFloat(q) {
  // A dial is { num: BigInt, den: BigInt }; tolerate plain numbers too.
  if (q == null) return 0;
  if (typeof q === 'number') return q;
  const den = q.den === undefined ? 1 : Number(q.den);
  return den === 0 ? 0 : Number(q.num) / den;
}

/** One ℚ¹⁶ dial-state → a plain float vector over the chosen dial indices. */
export function dialVector(dial, dims = SEMANTIC_DIALS) {
  return dims.map((i) => toFloat(dial[i]));
}

// Per-column min-max normalization to [0,1] so no single dial dominates the
// geometry (a constant column maps to 0). This is what makes score (~tens) and
// cohesion (0..1) comparable directions rather than score drowning cohesion.
function normalizeColumns(rows) {
  if (rows.length === 0) return rows;
  const d = rows[0].length;
  const min = new Array(d).fill(Infinity);
  const max = new Array(d).fill(-Infinity);
  for (const r of rows) {
    for (let k = 0; k < d; k++) {
      if (r[k] < min[k]) min[k] = r[k];
      if (r[k] > max[k]) max[k] = r[k];
    }
  }
  return rows.map((r) =>
    r.map((x, k) => {
      const span = max[k] - min[k];
      return span > 1e-12 ? (x - min[k]) / span : 0;
    })
  );
}

function sub(a, b) {
  return a.map((x, i) => x - b[i]);
}
function norm(a) {
  return Math.sqrt(a.reduce((s, x) => s + x * x, 0));
}
function dot(a, b) {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}
function cosine(a, b) {
  const na = norm(a);
  const nb = norm(b);
  return na < 1e-12 || nb < 1e-12 ? 0 : dot(a, b) / (na * nb);
}

function steps(points) {
  const out = [];
  for (let i = 1; i < points.length; i++) out.push(sub(points[i], points[i - 1]));
  return out;
}

function arcLength(points) {
  return steps(points).reduce((s, d) => s + norm(d), 0);
}

function heading(points) {
  const s = steps(points);
  if (s.length === 0) return points[0] ? points[0].map(() => 0) : [];
  const last = s[s.length - 1];
  const n = norm(last);
  return n > 1e-12 ? last.map((x) => x / n) : last.map(() => 0);
}

// Curvature: summed 1 - cos between consecutive step directions.
function bendingEnergy(points) {
  const s = steps(points);
  let e = 0;
  for (let i = 1; i < s.length; i++) {
    if (norm(s[i - 1]) > 1e-12 && norm(s[i]) > 1e-12) e += 1 - cosine(s[i - 1], s[i]);
  }
  return e;
}

// Torsion: per interior vertex, sin of the angle the next step makes with the
// osculating plane of the previous two. 0 for any planar path; needs >=4 points.
function twistEnergy(points) {
  const s = steps(points);
  let e = 0;
  for (let i = 2; i < s.length; i++) {
    const s1 = s[i - 2];
    const s2 = s[i - 1];
    const s3 = s[i];
    const n1 = norm(s1);
    if (n1 < 1e-12) continue;
    const e1 = s1.map((x) => x / n1);
    const d21 = dot(s2, e1);
    const perp = s2.map((x, k) => x - d21 * e1[k]);
    const np = norm(perp);
    if (np < 1e-12) continue;
    const e2 = perp.map((x) => x / np);
    const n3 = norm(s3);
    if (n3 < 1e-12) continue;
    const d3 = s3.map((x) => x / n3);
    const c1 = dot(d3, e1);
    const c2 = dot(d3, e2);
    const out = d3.map((x, k) => x - c1 * e1[k] - c2 * e2[k]);
    e += Math.min(norm(out), 1);
  }
  return e;
}

function planarity(points) {
  const vertices = Math.max(0, steps(points).length - 1);
  if (vertices === 0) return 1;
  return Math.min(1, Math.max(0, 1 - twistEnergy(points) / vertices));
}

/**
 * Read the geometry of an arena's breed trajectory (`state.traj`).
 *
 * @param {Array<Array<{num:bigint,den:bigint}>>} traj  the ℚ¹⁶ breed record.
 * @param {object} [opts]
 * @param {number[]} [opts.dims]      dial indices to read (default: the semantic
 *                                    subspace, seed excluded).
 * @param {boolean} [opts.normalize]  per-dial min-max normalize (default true),
 *                                    so no single dial dominates the shape.
 * @returns {{rounds, arcLength, bendingEnergy, twistEnergy, planarity, heading, dims, normalized}}
 *          Never mutates `traj`.
 */
export function breedGesture(traj, opts = {}) {
  const dims = opts.dims || SEMANTIC_DIALS;
  const doNorm = opts.normalize !== false;
  const list = Array.isArray(traj) ? traj : [];
  let points = list.map((dial) => dialVector(dial, dims));
  if (doNorm) points = normalizeColumns(points);
  return {
    rounds: list.length,
    arcLength: arcLength(points),
    bendingEnergy: bendingEnergy(points),
    twistEnergy: twistEnergy(points),
    planarity: planarity(points),
    heading: heading(points),
    dims,
    normalized: doNorm,
  };
}

/**
 * A one-line disclosure string, in the arena's own voice, safe to print in the
 * round log alongside the provenance note. Read-only; not a scoring term.
 */
export function breedGestureNote(traj, opts = {}) {
  const g = breedGesture(traj, opts);
  if (g.rounds < 2) return `breed gesture: ${g.rounds} round(s) — no motion yet`;
  return (
    `breed gesture: ${g.rounds} rounds · travel ${g.arcLength.toFixed(2)} · ` +
    `bend ${g.bendingEnergy.toFixed(2)} · twist ${g.twistEnergy.toFixed(2)} · ` +
    `planarity ${g.planarity.toFixed(2)} (analysis only — never a scoring term)`
  );
}
