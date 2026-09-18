/* quilt-gan arena UI — Scratch-like blocks over the real canon graph. */
(function () {
  const E = window.ENGINE;
  const R = 9;
  const state = {
    placed: [], palette: E.PALETTES.v1, strategy: 'polar', seed: 0,
    champion: null, round: 0, zoom: 22, tx: 0, ty: 0,
  };

  /* ---------- blocks ---------- */
  const BLOCKS = [
    { id: 'g-polar', kind: 'G', label: 'Embed · Polar Spiral', apply: s => ({ ...s, strategy: 'polar' }) },
    { id: 'g-anchor', kind: 'G', label: 'Embed · Tile Anchor (BFS)', apply: s => ({ ...s, strategy: 'anchor' }) },
    { id: 'g-sea', kind: 'G', label: 'Sea · Hash Texture', apply: s => ({ ...s, seed: s.seed + 1 }) },
    { id: 'p-abyss', kind: 'G', label: 'Palette · Abyss', apply: s => ({ ...s, palette: E.PALETTES.abyss }) },
    { id: 'p-paper', kind: 'G', label: 'Palette · Paper (Rams)', apply: s => ({ ...s, palette: E.PALETTES.paper }) },
    { id: 'p-v1', kind: 'G', label: 'Palette · v1 Muted', apply: s => ({ ...s, palette: E.PALETTES.v1 }) },
    { id: 'd-ref', kind: 'D', label: 'Disc · Referee', },
    { id: 'd-arc', kind: 'D', label: 'Disc · Arc Judge', },
    { id: 'd-doctrine', kind: 'D', label: 'Disc · Doctrine', },
  ];

  /* ---------- render ---------- */
  const cv = document.getElementById('floor');
  const ctx = cv.getContext('2d');
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  window.addEventListener('resize', resize);

  function draw() {
    const W = cv.clientWidth, H = cv.clientHeight;
    const P = state.palette;
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + state.tx, H / 2 + state.ty);
    ctx.scale(state.zoom, state.zoom);
    const pos = {};
    // fabric arcs under dots
    state.placed.forEach(p => pos[NODES[p.ref].n] = p.v);
    ctx.strokeStyle = P.fabric; ctx.lineWidth = 1.4 / state.zoom; ctx.globalAlpha = 0.85;
    FABRIC.forEach(([a, b]) => {
      const A = pos[a], B = pos[b];
      if (!A || !B) return;
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const dx = B.x - A.x, dy = B.y - A.y;
      const cx = mx - dy * 0.18, cy = my + dx * 0.18; // gentle arc
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(cx, cy, B.x, B.y); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    const fams = Object.keys(P.familyTint || {});
    state.placed.forEach(p => {
      const n = NODES[p.ref];
      const tint = (P.familyTint || {})[n.f] || E.FAMILY_FALLBACK[E.hash(n.f) % E.FAMILY_FALLBACK.length];
      ctx.fillStyle = n.t === 1 ? P.t1 : n.t === 2 ? tint : P.sea;
      const r = (n.t === 1 ? 3.4 : n.t === 2 ? 2.3 : 1.5) / state.zoom * 2.2;
      ctx.beginPath(); ctx.arc(p.v.x, p.v.y, r, 0, 7); ctx.fill();
      if (n.t === 1) { ctx.strokeStyle = P.fabric; ctx.lineWidth = 0.8 / state.zoom; ctx.stroke(); }
    });
    ctx.restore();
    // labels (screen space)
    ctx.fillStyle = P.label; ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(`${NODES.length} repos · ${FABRIC.length} fabric pairs · ${state.placed.length} placed · round ${state.round}`, 14, 22);
    ctx.fillText('identity = (i, ki, j, kj) — integers only · wheel=zoom · drag=pan', 14, 40);
  }
  cv.addEventListener('wheel', e => { e.preventDefault(); state.zoom *= e.deltaY < 0 ? 1.12 : 0.9; draw(); }, { passive: false });
  let drag = null;
  cv.addEventListener('mousedown', e => drag = { x: e.clientX, y: e.clientY });
  window.addEventListener('mouseup', () => drag = null);
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    state.tx += e.clientX - drag.x; state.ty += e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY }; draw();
  });

  /* ---------- bout runner ---------- */
  const strip = document.getElementById('strip');
  const log = document.getElementById('log');
  const say = (cls, msg) => { const d = document.createElement('div'); d.className = cls; d.textContent = msg; log.prepend(d); };

  function runRound(breedFrom) {
    state.round++;
    const gBlocks = [...strip.querySelectorAll('.block.G')].map(el => BLOCKS.find(b => b.id === el.dataset.id)).filter(b => b && b.apply);
    const dBlocks = [...strip.querySelectorAll('.block.D')].map(el => BLOCKS.find(b => b.id === el.dataset.id)).filter(Boolean);
    let s = { strategy: state.strategy, palette: state.palette, seed: state.seed };
    if (breedFrom && state.champion) s = { ...state.champion.s, seed: state.champion.s.seed + 1 };
    gBlocks.forEach(b => { s = b.apply(s); });
    state.strategy = s.strategy; state.palette = s.palette; state.seed = s.seed;
    const t0 = performance.now();
    state.placed = s.strategy === 'anchor' ? E.embedTileAnchor(NODES, FABRIC, R, s.seed) : E.embedPolarSpiral(NODES, R);
    const dt = (performance.now() - t0).toFixed(1);
    draw();
    const verdict = E.referee(state.placed, NODES, FABRIC, s.palette);
    let score = verdict.score;
    dBlocks.forEach(b => {
      if (b.id === 'd-arc') {
        const j = verdict.avgArc < 1.0 ? 10 : verdict.avgArc < 3.5 ? 7 : verdict.avgArc < 6 ? 4 : 1;
        score += j; say('d', `⚖ ${b.label}: avg arc ${verdict.avgArc.toFixed(2)} → +${j}`);
      } else if (b.id === 'd-doctrine') {
        const j = verdict.issues.length === 0 ? 10 : -8 * verdict.issues.length;
        score += j; say('d', `⚖ ${b.label}: ${verdict.issues.length ? verdict.issues.join('; ') : 'doctrine clean'} → ${j >= 0 ? '+' : ''}${j}`);
      } else {
        say('d', `⚖ ${b.label}: score ${verdict.score}/100`);
      }
    });
    verdict.notes.forEach(n => say('n', '· ' + n));
    const entry = { round: state.round, s, score: Math.min(score, 100), avgArc: verdict.avgArc, issues: verdict.issues, dt };
    say('g', `— round ${state.round}: ${gBlocks.map(b => b.label).join(' + ') || 'baseline'} → score ${entry.score} (${dt}ms)`);
    if (!state.champion || entry.score > state.champion.score) {
      state.champion = entry;
      say('win', `★ new champion: round ${entry.round} @ ${entry.score}`);
    }
    document.getElementById('champ').textContent = state.champion ? `champion: round ${state.champion.round} · score ${state.champion.score} · arc ${state.champion.avgArc.toFixed(2)}` : 'no rounds yet';
    return entry;
  }

  document.getElementById('run').onclick = () => runRound(false);
  document.getElementById('breed').onclick = () => runRound(true);

  /* ---------- drag & drop ---------- */
  const palette = document.getElementById('palette');
  BLOCKS.forEach(b => {
    const el = document.createElement('div');
    el.className = 'block ' + b.kind; el.draggable = true; el.dataset.id = b.id;
    el.textContent = (b.kind === 'G' ? '⚙ ' : '⚖ ') + b.label;
    el.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', b.id));
    palette.appendChild(el);
  });
  strip.addEventListener('dragover', e => e.preventDefault());
  strip.addEventListener('drop', e => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const b = BLOCKS.find(x => x.id === id); if (!b) return;
    const el = document.createElement('div');
    el.className = 'block ' + b.kind; el.dataset.id = id; el.textContent = (b.kind === 'G' ? '⚙ ' : '⚖ ') + b.label;
    el.onclick = () => { el.remove(); };
    strip.appendChild(el);
    say('n', `+ ${b.label} (click to remove)`);
  });
  // seed a sensible default bout
  ['g-anchor', 'p-abyss', 'd-ref', 'd-arc', 'd-doctrine'].forEach(id => {
    const b = BLOCKS.find(x => x.id === id);
    const el = document.createElement('div');
    el.className = 'block ' + b.kind; el.dataset.id = id; el.textContent = (b.kind === 'G' ? '⚙ ' : '⚖ ') + b.label;
    el.onclick = () => el.remove();
    strip.appendChild(el);
  });

  state.placed = E.embedPolarSpiral(NODES, R);
  resize();
  say('n', 'arena ready — drop blocks, run rounds, breed champions.');
  if (location.search.includes('autorun')) {
    runRound(false); runRound(true); runRound(true);
    state.zoom = 26; draw();
  }
})();
