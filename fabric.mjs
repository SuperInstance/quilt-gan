// fabric.mjs — the v4 fabric grammar: exact rational arcs between measured
// positions, a TRUE arc-length metric, and the Δ_max curvature kill-veto.
//
// v3's scam, exposed: engine.js scored "arcs" as chords (Math.hypot) while
// app.js drew bowed quadratics — the communication cost of the fabric was
// under-reported by the bow. This module is the referee the v3 arena lacked:
// every arc is an IARS quadratic Bézier (spline.mjs), its length is a float
// MEASURE (arcLengthMeasure), and arcs that turn sharper than Δ_max are
// fabrication defects — killed, not scored.
//
// Doctrine (unchanged): positions are layout MEASUREMENTS — floats, lifted
// honestly to ℚ (dyadic shadow). The curve is exact ℚ; the lengths are
// floats; the identities (repo names) are strings the kernel binds.

import {
  makeRat, floatToRat, ratToNumber, ratToString, ratAdd, ratSub, ratMul, ratDiv, ratNeg, ratAbs,
} from './commensurate.mjs';
import { makeSpline, curvatureMeasure, arcLengthMeasure } from './spline.mjs';

const ZERO = makeRat(0n);

// lift a measured position to ℚ
const lift = p => [floatToRat(p.x), floatToRat(p.y)];

// fabricArc(A, B, {side}) — the exact arc the v3 renderer drew by hand.
// side is ABSOLUTE: ctrl = chord-mid + perpendicular·side, and since the
// perpendicular vector has magnitude |chord|, the sagitta is side·c.
//   • v3 law: side = ±0.16 const ⇒ sagitta = 0.16c ⇒ κ ≈ 1.28/c — the
//     hairpins of smoke-v4 (κ=6.75 on chord-0.09 arcs).
//   • v5 law (proportionalSide): side = ratio·c ⇒ sagitta = ratio·c² ⇒
//     κ ≈ 8·ratio — BOUNDED independent of chord. The bow costs what it
//     costs, never more than the judge allows.
// All ℚ after the lift.
export function fabricArc(A, B, { side = 0.16 } = {}) {
  const a = lift(A), b = lift(B);
  const mid = [ratDiv(ratAdd(a[0], b[0]), makeRat(2n)), ratDiv(ratAdd(a[1], b[1]), makeRat(2n))];
  const d = [ratSub(b[0], a[0]), ratSub(b[1], a[1])];
  const s = floatToRat(side);
  const ctrl = [ratSub(mid[0], ratMul(d[1], s)), ratAdd(mid[1], ratMul(d[0], s))];
  const curve = makeSpline({
    degree: 2,
    knots: [ZERO, ZERO, ZERO, makeRat(1n), makeRat(1n), makeRat(1n)],
    controls: [a, ctrl, b],
  });
  const chord = Math.hypot(B.x - A.x, B.y - A.y); // a float measure
  return { curve, ctrl, chord, a, b };
}

// proportionalSide(ratio, signFn) — the v5 sideFor factory: absolute side =
// ratio·chord·sign(edge). κ ≈ 8·ratio for every arc, from the longest to
// the near-coincident; the Δ_max kill-veto becomes a law, not a rescue.
export function proportionalSide(ratio, signFn = () => 1) {
  return (edge, chord) => ratio * chord * signFn(edge);
}

// fabricLayout(edges, pos, {sideFor | sideRatio}) — one arc per resolved
// edge, with the true length and the chord side by side. sideFor(edge,
// chord) returns the signed ABSOLUTE side (v3 default: the ±0.16
// antiparallel hash); sideRatio sets the v5 proportional law directly.
export function fabricLayout(edges, pos, { sideFor = null, sideRatio = null } = {}) {
  const sideOf = sideFor ?? (sideRatio !== null ? proportionalSide(sideRatio) : () => 0.16);
  return edges.map(([a, b]) => {
    const A = pos[a], B = pos[b];
    const arc = fabricArc(A, B, { side: sideOf([a, b], Math.hypot(B.x - A.x, B.y - A.y)) });
    return {
      edge: [a, b],
      curve: arc.curve,
      ctrl: arc.ctrl,
      a: arc.a, b: arc.b,
      chord: arc.chord,
      length: arcLengthMeasure(arc.curve, 0, 1), // the true cost, a float
    };
  });
}

// fabricMetrics(layout) — the v4 communication cost, plus the v3 delta:
// how much of the fabric's cost the chord metric hid.
export function fabricMetrics(layout) {
  const chordSum = layout.reduce((s, r) => s + r.chord, 0);
  const total = layout.reduce((s, r) => s + r.length, 0);
  return {
    arcs: layout.length,
    total,
    avg: layout.length ? total / layout.length : 0,
    chordAvg: layout.length ? chordSum / layout.length : 0,
    deltaPct: chordSum > 0 ? 100 * (total - chordSum) / chordSum : 0,
  };
}

// killVeto(layout, {deltaMax, samples}) — the Disc's arc judge, upgraded.
// Max curvature sampled along each arc; any arc sharper than Δ_max is a
// fabrication defect (degenerate near-coincident placements have κ → ∞).
// The arc is the analogue seam, not a hand-tuned picture: it must not kink.
export function killVeto(layout, { deltaMax = 1.0, samples = 16 } = {}) {
  let kappaMax = 0;
  let worst = null;
  const perArc = layout.map((row, i) => {
    let kMax = 0;
    for (let s = 1; s < samples; s++) {
      const t = s / samples;
      const k = curvatureMeasure(row.curve, makeRat(BigInt(Math.round(t * 1e6)), 1000000n));
      if (k > kMax) kMax = k;
    }
    if (kMax > kappaMax) { kappaMax = kMax; worst = i; }
    return { edge: row.edge, kappaMax: kMax, pass: kMax <= deltaMax };
  });
  return { pass: kappaMax <= deltaMax, kappaMax, deltaMax, worst, perArc };
}

// hostFabric(kernel, layout, pos, {name}) — tenancy: repos are cells (the
// name IS the identity), arcs are 'owes' links carrying the measured length
// and chord in meta, with the ℚ control-point lift for provenance.
export function hostFabric(kernel, layout, pos, { name = 'fabric' } = {}) {
  for (const [nm, p] of Object.entries(pos)) {
    kernel.bind(`${name}.${nm}`, { x: p.x, y: p.y }, { what: 'repo position (float measure)' });
  }
  let links = 0;
  for (const row of layout) {
    const [a, b] = row.edge;
    kernel.link(`${name}.${a}`, `${name}.${b}`, 'owes');
    kernel.bind(`${name}.${a}→${b}`, { length: row.length, chord: row.chord }, {
      what: 'fabric arc cost (float measure)',
      lift: { ctrl: row.ctrl.map(ratToString) },
    });
    links++;
  }
  return { cells: Object.keys(pos).length, links };
}
