# quilt-gan

**A Scratch-grade GAN arena where generator and discriminator blocks compete to lay the Cocapn fleet canon onto an exact Penrose floor.**

Drag blocks. Run rounds. Breed champions. The map is real: all 2,003 fleet repositories, the 15-pair signed fabric, and a referee that scores identity exactness, fabric arc length, and doctrine — not vibes.

```
python3 -m http.server 8931   # then open http://localhost:8931
```

No build step. No dependencies. `engine.js` is pure logic (node-testable), `graph.js` is the real canon data (compact), `app.js` is the arena.

## The bout protocol

1. **Drop blocks into the strip.** Generators (green) mutate the candidate: embedding strategy, palette, sea-texture seed. Discriminators (red) judge it.
2. **▶ run round** — generators compose in order, the candidate renders, discriminators score, the transcript records everything.
3. **✦ breed next round** — seeds from the champion with a mutation (seed+1). Tournament, not gradient.

Referee metrics (hard invariants, from `ENGINE.referee`):
- every node placed; every identity an exact integer crossing `(i, ki, j, kj)`; **zero duplicate vertices** (a rounding merge fails the bout instantly)
- fabric arc coverage and average length
- palette discipline + label collision estimates

## Doctrine

The floor's rules, enforced by the referee and the discriminators:

- **Integers own identity; floats only measure.** A vertex is *which two grid-lines cross* — never a rounded coordinate. Identity built on measurement drifts.
- **An edge without evidence is a rumor.** Only the 15 signed fabric pairs render as arcs. The graph does not invent structure.
- **The sea is honest.** 77% of the fleet is `various/other` — texture comes from ordering (name-hash micro-clusters), never from fabricated categories.

## Current bout standings (v0)

| Candidate | Embedding | Avg fabric arc | Referee | Notes |
|-----------|-----------|----------------|---------|-------|
| Polar Spiral (v1 port) | center-out by tier | 3.50 | 83 | honest but diffuse |
| **Tile Anchor BFS + Abyss** | fabric BFS → tier-1 → hash-sea | **0.27** | 84+20 judge bonus | **champion @ 100 after 3 bred rounds** |

Screenshot: `shot.png` (round 0) · `shot2.png` (3 bred rounds, champion crowned)

## Roadmap

- [ ] Wire in arena-competition strategies (illustrator spec + geometer v2 from the `/tmp/arena` GAN run, 2026-09-18)
- [ ] Multigrid line rendering (β sketch direction) as a toggleable layer
- [ ] Neighborhood labels + chart key (editorial cartography mode)
- [ ] Sea density throttle: equal-ink vs equal-count
- [ ] Export bout transcripts as JSON; replay a champion's rounds
- [ ] Real subagent hookup: blocks that call fleet scouts as generators/discriminators

## v5 — the proportional bow (2026-09-19)

v4 kept v3's fixed ±0.16 bow for shape compatibility; smoke-v4 exposed its sin: curvature κ ≈ 1.28/c is unbounded on short chords (κ=6.75 on the chord-0.09 quilt-canvas-demo arcs). v5 switches to the floor's `proportionalSide(0.1)`: sagitta = 0.1·c², so **κ = 4·ratio = 0.40 exactly on every arc** — hairpins die by construction, and the Δ_max judge (0.8 = 2× the theoretical bound) polices fabrication only. Cost of the truth: the chord metric now hides **7.58%** of the fabric cost (avgChord 1.6458 vs true 1.7706) — the proportional bow prices long arcs honestly. Same score, honest books.

## v4 — the fabric grammar (2026-09-19)

v3 drew arcs by hand (a floated quadratic, ±0.16 absolute bow) and scored them as chords. v4 vendors the quilt-floor grammar byte-identical (`commensurate.mjs`, `spline.mjs`, `fabric.mjs`) and:

- **engine.referee** takes `extra.arcMetric(a, b, posA, posB)` — the TRUE arc length. Default stays the chord (legacy callers keep v3 numbers; the note discloses). Also takes `extra.fabricVeto = {pass, kappaMax, deltaMax}` — a Δ_max curvature kill-veto that zeroes communication on fabrication defects.
- **app.js** is now a module: arcs are exact ℚ IARS splines drawn as polylines (chevron tangent from the exact derivative), the referee is fed the true metric + veto, and the round log prints both. Headless smoke: `node smoke-v4.mjs` — on the real 2,003-repo canon: chord avg 1.6458 vs TRUE 1.6734 (**1.68% hidden cost**), κ_max 6.75 on chord-0.09 hairpins (v3's fixed bow on near-coincident placements; Δ_max = 8 admits the current law, a chord-proportional bow is the v5 fix).

## Lineage

Built on the fleet-canon floor map (`SuperInstance/fleet-canon`, PR #18), the quilt polyformalism's exact-identity doctrine, and the referee harness from the 2026-09-18 GAN session. One eye Dieter Rams, one eye Moebius.

*kimi1 · Cocapn Fleet · 2026-09-18*

### judge-scope mask (the floor's mask.mjs seam)
The kill-veto's default scope is ⊤ — v5's law pins κ = 4·ratio
theoretically on every arc, so every arc is judged. The mask seam exists
for human carve-outs: pass a `{has(a,b)}` mask via `state.judgeMask` and
the referee prints `arc judge: MASK-SCOPED — n/m arcs judged, k out of
scope by policy`. The smoke runs a DEMO POLICY (short chord<1 arcs judged,
long scoped out) to prove the note discloses scope and that scoped passing
does not move the score. Scoped κ_max is computed over the scope only —
never let a mask widen what the judge claims to have certified.
