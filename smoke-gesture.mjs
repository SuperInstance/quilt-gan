// smoke-gesture — headless checks for gesture.mjs (the breed-trajectory reader).
//
// Run: `node smoke-gesture.mjs` (from the repo root). Pure, zero-dependency.
// It builds synthetic ℚ¹⁶ trajectories, so it needs neither the DOM nor the
// engine — and it asserts the LAW: reading the gesture never mutates the traj.
import assert from 'node:assert/strict';
import { breedGesture, breedGestureNote, dialVector, SEMANTIC_DIALS } from './gesture.mjs';

const q = (n, d = 1) => ({ num: BigInt(Math.trunc(n)), den: BigInt(d) });

// Build a 16-dial ℚ state, filling the leading dials from `vals` (rest zero).
function dials(vals) {
  const arr = new Array(16).fill(0).map(() => q(0));
  vals.forEach((v, i) => (arr[i] = typeof v === 'object' ? v : q(v)));
  return arr;
}

// ── degenerate input is graceful ────────────────────────────────────
{
  const empty = breedGesture([]);
  assert.equal(empty.rounds, 0);
  assert.equal(empty.arcLength, 0);
  assert.equal(empty.bendingEnergy, 0);
  assert.equal(empty.twistEnergy, 0);
  assert.equal(empty.planarity, 1);

  const single = breedGesture([dials([1, 0, 0, 0, 5])]);
  assert.equal(single.rounds, 1);
  assert.equal(single.arcLength, 0);
}

// ── dialVector reads rationals (num/den) ────────────────────────────
{
  // dials: [0]=strategy [1]=palette [2]=seed [3]=cohesion [4]=score
  const v = dialVector(dials([2, 1, 0, q(16384, 32768), 30]), [0, 1, 3, 4]);
  assert.deepEqual(v, [2, 1, 0.5, 30]); // strategy, palette, cohesion=0.5, score
}

// ── curvature vs torsion, on controlled geometry (no normalization) ──
{
  // A straight climb in one dial → no bending, no twist.
  const straight = [0, 1, 2, 3, 4].map((x) => dials([x]));
  const gs = breedGesture(straight, { dims: [0], normalize: false });
  assert.ok(gs.arcLength > 3.9 && gs.arcLength < 4.1);
  assert.ok(gs.bendingEnergy < 1e-9);
  assert.ok(gs.twistEnergy < 1e-9);

  // A planar zig-zag (two dials) → bends, but never leaves the plane.
  const zig = [
    dials([0, 0]), dials([1, 1]), dials([2, 0]), dials([3, 1]), dials([4, 0]),
  ];
  const gz = breedGesture(zig, { dims: [0, 1], normalize: false });
  assert.ok(gz.bendingEnergy > gs.bendingEnergy, 'zig bends more than a line');
  assert.ok(gz.twistEnergy < 1e-9, 'a planar zig-zag does not twist');

  // A helix (three dials) → the same turning, but opening a new dimension.
  const helix = Array.from({ length: 8 }, (_, i) => {
    const a = i * 0.6;
    return dials([Math.round(Math.cos(a) * 1000), Math.round(Math.sin(a) * 1000), Math.round(0.5 * a * 1000)]);
  });
  const gh = breedGesture(helix, { dims: [0, 1, 2], normalize: false });
  assert.ok(gh.twistEnergy > 1e-6, `a helix twists: ${gh.twistEnergy}`);
  assert.ok(gh.twistEnergy > gz.twistEnergy);
  assert.ok(gh.planarity >= 0 && gh.planarity <= 1);
}

// ── normalization keeps a huge-magnitude dial from dominating ───────
{
  // score swings 0..100 while cohesion swings 0..1; without normalization score
  // dominates the direction entirely. With it, both steer the shape.
  const traj = [
    dials([0, 0, 0, q(0, 1), 0]),
    dials([0, 0, 0, q(1, 1), 100]),
    dials([0, 0, 0, q(0, 1), 0]),
    dials([0, 0, 0, q(1, 1), 100]),
  ];
  const raw = breedGesture(traj, { dims: [3, 4], normalize: false });
  const norm = breedGesture(traj, { dims: [3, 4], normalize: true });
  // Normalized: cohesion (dim0) and score (dim1) both fully oscillate in lockstep
  // → the motion is a straight back-and-forth line → near-zero bending.
  assert.ok(norm.bendingEnergy <= raw.bendingEnergy + 1e-9);
  assert.ok(Number.isFinite(norm.arcLength) && norm.arcLength > 0);
}

// ── THE LAW: reading the gesture never mutates the trajectory ────────
{
  const traj = Array.from({ length: 5 }, (_, i) => dials([i % 3, i % 4, q(i, 5), i * 7]));
  const before = JSON.stringify(traj, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  breedGesture(traj);
  breedGestureNote(traj);
  const after = JSON.stringify(traj, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
  assert.equal(after, before, 'breedGesture is read-only — the breed record is untouched');
}

// ── the disclosure note reads in the arena's voice ──────────────────
{
  assert.match(breedGestureNote([]), /no motion yet/);
  const note = breedGestureNote(
    Array.from({ length: 4 }, (_, i) => dials([i % 3, i, q(i, 4), i * 10]))
  );
  assert.match(note, /breed gesture: 4 rounds/);
  assert.match(note, /never a scoring term/);
}

console.log('smoke-gesture: all checks passed ✓');
console.log('  ' + breedGestureNote(Array.from({ length: 6 }, (_, i) => {
  const a = i * 0.7;
  return dials([i % 3, i % 5, q(Math.round(Math.abs(Math.sin(a)) * 32768), 32768), 40 + Math.round(Math.cos(a) * 10)]);
})));
console.log('  semantic dials read:', SEMANTIC_DIALS.join(','), '(seed dial 2 excluded as per-round entropy)');
