/* Decorative ASCII red spider lilies (Lycoris radiata): two plants, a small
 * faint one in the back and a large one up front in the right corner. Each
 * bare scape carries an umbel of flowers; each flower has narrow, wavy tepals
 * that curve backwards and long spindly stamens that arc up and out. Flowers
 * are real rings in 3D, tipped away so they look round from the side. Drawn
 * into a character grid and flushed to the <pre> as runs of coloured spans.
 * Motion is deliberately slow.
 */
(() => {
  const host = document.getElementById("flowers");
  if (!host || !host.parentElement) return;
  const box = host.parentElement;

  const FPS = 60;
  const SPEED = 0.45; // global time scale; lower is calmer
  const RAD = Math.PI / 180;
  const TONES = ["s", "d", "m", "p", "bs", "bd", "bm", "bp"];
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%";
  const ctx = canvas.getContext("2d");
  box.appendChild(canvas);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let cols = 0, rows = 0, aspect = 2;
  let chars = [], tones = [];
  let cell = { w: 6, h: 12, font: "11px monospace" }, palette = {};
  let last = 0, t = 0;

  function measure() {
    const probe = document.createElement("span");
    probe.textContent = "0".repeat(20);
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
    probe.style.font = getComputedStyle(host).font;
    document.body.appendChild(probe);
    const r = probe.getBoundingClientRect();
    probe.remove();
    const glyphW = r.width / 20 || 6;
    const line = parseFloat(getComputedStyle(host).lineHeight) || r.height || 12;
    aspect = line / glyphW;
    cols = Math.max(20, Math.ceil(box.clientWidth / glyphW));
    rows = Math.max(8, Math.ceil(box.clientHeight / line));
    chars = new Array(cols * rows);
    tones = new Array(cols * rows);
    cell = { w: glyphW, h: line, font: getComputedStyle(host).font };
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.clientWidth * dpr);
    canvas.height = Math.round(box.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readPalette();
  }

  // Colour and opacity per tone come from the stylesheet (.garden .s, .m, ...),
  // so light/dark theming stays in CSS.
  function readPalette() {
    palette = {};
    for (const name of TONES) {
      const probe = document.createElement("i");
      probe.className = name;
      probe.style.display = "none";
      box.appendChild(probe);
      const cs = getComputedStyle(probe);
      palette[name] = { color: cs.color, alpha: parseFloat(cs.opacity) };
      probe.remove();
    }
  }

  function put(x, y, ch, tone) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    const i = y * cols + x;
    chars[i] = ch;
    tones[i] = tone;
  }

  // Glyph that follows a stroke's direction on screen (dy is in rows, so it is
  // scaled back to column units first).
  function dirChar(dx, dy) {
    const sy = dy * aspect;
    const ang = Math.abs(Math.atan2(sy, dx)) / RAD; // 0..180
    if (ang < 25 || ang > 155) return "-";
    if (ang > 65 && ang < 115) return "|";
    return dx * sy > 0 ? "\\" : "/";
  }

  // Each flower is a real ring in 3D, tipped away from the viewer so on screen
  // it flattens to an ellipse, then leaned by `beta` so it points away from the
  // stalk. (rho, phi, y3) = radius, azimuth and height above the flower's plane.
  function makeProj(cx, cy, tilt, beta) {
    const sinT = Math.sin(tilt), cosT = Math.cos(tilt);
    const sb = Math.sin(beta), cb = Math.cos(beta);
    return (rho, phi, y3) => {
      const X = rho * Math.cos(phi), Z = rho * Math.sin(phi);
      const U = y3 * cosT - Z * sinT;
      return [cx + X * cb + U * sb, cy - (-X * sb + U * cb) / aspect];
    };
  }

  // Stamen: spindly, runs out and flicks up and forward at the tip. Drawn one
  // glyph wide: steep stretches take one glyph per row, shallow ones one per
  // column with `, -, _ picking the sub-row so the line reads smooth.
  function stamen(proj, phi, L, H, tone, tip) {
    const n = Math.ceil(L * 2.4);
    let [px, py] = proj(0, phi, 0);
    let lastR = -1, lastC = -1;
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const [x, y] = proj(L * Math.pow(u, 0.85), phi, H * (1.8 * u * u - 0.5 * u));
      const dx = x - px, dy = y - py;
      px = x; py = y;
      if (k === n) { put(x, y, tip, "p"); break; }
      const r = Math.round(y), c = Math.round(x);
      const vis = Math.atan2(Math.abs(dy) * aspect, Math.abs(dx)) / RAD;
      if (vis >= 35 ? r === lastR : c === lastC) continue;
      lastR = r; lastC = c;
      let ch;
      if (vis > 65) ch = "|";
      else if (vis >= 25) ch = dx * dy > 0 ? "\\" : "/";
      else { const f = y - r; ch = f < -0.2 ? "`" : f > 0.2 ? "_" : "-"; }
      put(x, y, ch, u > 0.8 ? "p" : tone);
    }
  }

  // Tepal: a narrow wavy strap that curves backwards, away from the flower's
  // face. Built from parallel strokes that fan apart mid-way.
  function tepal(proj, phi, L, H, seed, tone, rim) {
    const n = Math.ceil(L * 3);
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const half = 0.11 * Math.sin(Math.min(1, u * 1.1) * Math.PI);
      const ripple = 0.1 * H * Math.sin(u * 13 + seed) * u;
      for (let j = -1; j <= 1; j++) {
        const [x, y] = proj(L * Math.pow(u, 0.9), phi + j * half,
          H * (0.3 * u - 1.7 * u * u) + ripple);
        const edge = j !== 0;
        put(x, y, edge ? "~" : (u < 0.4 ? "#" : "%"), edge ? rim : tone);
      }
    }
  }

  // One flower: six tepals and seven stamens (six plus the pistil), drawn
  // back-to-front by azimuth so the near side overlaps the far side.
  function flower(cx, cy, L, time, o) {
    const t = o.tones;
    const TAU = Math.PI * 2;
    const proj = makeProj(cx, cy, o.tilt, o.beta);
    const items = [];
    for (let i = 0; i < 7; i++) items.push({ phi: (i / 7) * TAU + 0.2, stamen: true, i });
    for (let i = 0; i < 6; i++) items.push({ phi: (i / 6) * TAU + 0.6, stamen: false, i });
    items.sort((a, b) => Math.sin(a.phi) - Math.sin(b.phi));
    for (const it of items) {
      const front = Math.sin(it.phi) > 0;
      if (it.stamen) {
        const len = L * (it.i === 0 ? 1.25 : 1 + 0.12 * Math.sin(it.i * 2.7));
        const wave = 1 + Math.sin(time * 0.8 + it.i + o.seed) * 0.05;
        stamen(proj, it.phi, len, L * 0.5 * wave, front ? t.mid : t.deep, "o");
      } else {
        tepal(proj, it.phi, L * 0.48, L * 0.5, it.i * 1.9 + time * 0.4,
          front ? t.mid : t.deep, front ? t.pale : t.mid);
      }
    }
    put(cx, cy, "@", t.pale);
  }

  // Short straight-ish pedicel joining a flower to the top of the stalk.
  function pedicel(x0, y0, x1, y1, tone) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0) * aspect) * 1.5);
    let lastR = -1;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
      const r = Math.round(y);
      if (r === lastR) continue;
      lastR = r;
      put(x, y, dirChar(x1 - x0, y1 - y0), tone);
    }
  }

  // Umbel: several flowers fanned out on pedicels from the top of one scape.
  function umbel(hx, hy, L, time, o) {
    const ks = o.fan.map((deg, k) => ({ deg, k }));
    // Outer flowers first so the middle one sits in front.
    ks.sort((a, b) => Math.abs(b.deg) - Math.abs(a.deg));
    for (const { deg, k } of ks) {
      const beta = deg * RAD + o.lean + Math.sin(time * 0.5 + k * 1.7) * 0.04;
      const ped = L * (0.95 + 0.5 * Math.cos(beta));
      const fx = hx + Math.sin(beta) * ped;
      const fy = hy - (Math.cos(beta) * ped) / aspect;
      pedicel(hx, hy, fx, fy, o.stemTone);
      flower(fx, fy, L * (0.88 + 0.12 * Math.cos(beta)), time, {
        tones: o.tones, beta, seed: k * 1.3,
        tilt: 0.4 + 0.25 * Math.abs(Math.sin(k * 2.1 + 0.5)),
      });
    }
  }

  // Bare stalk from the ground at baseX up to a head at (headX, headY), bowing
  // sideways on the way and swaying gently near the top.
  function stem(baseX, headX, headY, bow, sway, freq, phase, time, tone, thick) {
    const base = rows - 1;
    const steps = Math.ceil((base - headY) * 1.6);
    let px = baseX, hx = baseX, hy = base;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const x = baseX + (headX - baseX) * u + bow * Math.sin(u * Math.PI) +
        sway * u * u * (Math.sin(time * freq + phase + u * 1.3) +
          0.5 * Math.sin(time * freq * 0.43 + phase * 1.7 + u)); // slow gust on top of the sway
      const y = base - u * (base - headY);
      const ch = dirChar(x - px, -1);
      if (k > 0) {
        put(x, y, ch === "-" ? "|" : ch, tone);
        if (thick) put(x + 1, y, ch === "-" ? "|" : ch, tone);
      }
      px = x; hx = x; hy = y;
    }
    return [hx, hy];
  }

  function draw(time) {
    chars.fill(" ");
    tones.fill("");

    // Back flower (wide screens only): upper left, smaller and faint, its bare scape sweeping up
    // from the bottom-left corner.
    if (cols >= 100) {
      const L = Math.max(4, Math.min(cols * (cols < 100 ? 0.08 : 0.055), rows * aspect * 0.12));
      const hy = Math.max(rows * 0.58, L + 3);
      const [hx, y] = stem(cols * 0.04, cols * 0.2, hy, -2, 4, 0.8, 0.6, time, "bs", false);
      umbel(hx, y, L, time, {
        fan: [-55, -18, 18, 55], stemTone: "bs", lean: (hx - cols * 0.2) * 0.012,
        tones: { deep: "bd", mid: "bm", pale: "bp" },
      });
    }

    // Front flower: big, centre-right, an umbel of five on a bare thick scape
    // rising from the bottom right.
    {
      const L = Math.max(6, Math.min(cols * (cols < 100 ? 0.17 : 0.125), rows * aspect * 0.27));
      const hy = Math.max(rows * 0.66, L * 1.25 + 3);
      const headX = Math.max(cols * 0.5, cols - L * 2.5 - 3); // outer flowers almost touch the right edge
      const [hx, y] = stem(Math.min(cols - 6, headX + cols * 0.1), headX, hy, 3, -6, 0.65, 2.4, time, "s", true);
      umbel(hx, y, L, time, {
        fan: [-72, -36, 0, 36, 72], stemTone: "s", lean: (hx - headX) * 0.012,
        tones: { deep: "d", mid: "m", pale: "p" },
      });
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = cell.font;
    ctx.textBaseline = "middle";
    const byTone = {};
    for (let i = 0; i < chars.length; i++) {
      const tone = tones[i];
      if (tone && chars[i] !== " ") (byTone[tone] || (byTone[tone] = [])).push(i);
    }
    for (const tone of TONES) {
      const cells = byTone[tone];
      if (!cells) continue;
      ctx.fillStyle = palette[tone].color;
      ctx.globalAlpha = palette[tone].alpha;
      for (const i of cells) {
        ctx.fillText(chars[i], (i % cols) * cell.w, (Math.floor(i / cols) + 0.5) * cell.h);
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 1000 / FPS - 2) return;
    last = now;
    t = (now / 1000) * SPEED;
    draw(t);
  }

  let resizeTimer;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { measure(); draw(t); }, 120);
  });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readPalette(); draw(t); });
  measure();
  draw(0);
  if (!reduced) requestAnimationFrame(frame);
})();
