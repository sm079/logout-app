/* The widgets' charts. Each draws into a host element and morphs from what it showed before. */
import { compact } from '../logic/format.ts';
import { REDUCE, replay } from '../ui/motion.ts';

const NS = 'http://www.w3.org/2000/svg';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface Plot<D> {
  render(d: D): void;
  /** The point nearest a position in the host, or -1 */
  nearest(px: number, py: number, target: Element | null): number;
  /** Highlights a point (-1 clears) */
  mark(i: number): void;
}

/** Calls `redraw` once a frame at most while the host changes size (a window resized, a hidden chart shown).
    The size it starts at is the one it was first drawn at. Returns a function that stops watching. */
export function watchSize(host: HTMLElement, redraw: () => void): () => void {
  let raf = 0,
    size = '';
  const ro = new ResizeObserver(([e]) => {
    const r = e!.contentRect,
      now = `${Math.round(r.width)}x${Math.round(r.height)}`;
    if (now === size) return;
    const first = !size;
    size = now;
    if (first) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(redraw);
  });
  ro.observe(host);
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}

/* ---------- Line chart ----------
   Resampled to a fixed number of points so any two periods or metrics can morph into each other. Samples follow a
   monotone cubic through the readings, so the curve is smooth but never overshoots a reading. The line runs from the
   first reading to the last; it doesn't make up values before or after them. */
export interface LinePoint {
  t: number;
  v: number;
}
export interface LineData {
  pts: LinePoint[];
  t0: number;
  t1: number;
  /** The selection, when the chart shows days before it as context */
  band?: [number, number] | null;
  /** Labels at the left and right ends of the x axis */
  xl?: [string, string];
  /** The last reading is today's, so it pulses */
  live?: boolean;
}

const RES = 120;

function slopes(P: LinePoint[]): number[] {
  const n = P.length,
    d: number[] = [],
    m = new Array<number>(n).fill(0);
  if (n < 2) return m;
  for (let k = 0; k < n - 1; k++) d.push((P[k + 1]!.v - P[k]!.v) / (P[k + 1]!.t - P[k]!.t || 1));
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let k = 1; k < n - 1; k++) m[k] = d[k - 1]! * d[k]! <= 0 ? 0 : (d[k - 1]! + d[k]!) / 2;
  for (let k = 0; k < n - 1; k++) {
    if (!d[k]) {
      m[k] = m[k + 1] = 0;
      continue;
    }
    const a = m[k]! / d[k]!,
      b = m[k + 1]! / d[k]!,
      s = a * a + b * b;
    if (s > 9) {
      const r = 3 / Math.sqrt(s);
      m[k] = r * a * d[k]!;
      m[k + 1] = r * b * d[k]!;
    }
  }
  return m;
}
function hermite(p0: LinePoint, p1: LinePoint, m0: number, m1: number, t: number): number {
  const h = p1.t - p0.t || 1,
    u = (t - p0.t) / h,
    u2 = u * u,
    u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0.v + (u3 - 2 * u2 + u) * h * m0 + (3 * u2 - 2 * u3) * p1.v + (u3 - u2) * h * m1;
}

export function linePlot(host: HTMLElement, { axes, area, id }: { axes: boolean; area: boolean; id: string }): Plot<LineData> {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  // Line and area sit under a horizontal focus mask (dims the context before a padded selection, or everything after
  // the scrub point) and a clip that wipes them in together on first draw.
  svg.innerHTML =
    `<defs>${area ? `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--mc);stop-opacity:.26"/><stop offset=".6" style="stop-color:var(--mc);stop-opacity:.07"/><stop offset="1" style="stop-color:var(--mc);stop-opacity:0"/></linearGradient>` : ''}` +
    `<linearGradient id="${id}-f" class="lfocus" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0">${'<stop stop-color="#fff"/>'.repeat(6)}</linearGradient>` +
    `<mask id="${id}-m" maskUnits="userSpaceOnUse"><rect class="lmask" fill="url(#${id}-f)"/></mask>` +
    `<clipPath id="${id}-c"><rect class="lclip" x="-30" y="-30" width="0"/></clipPath></defs>` +
    `<g class="lgrid"></g><rect class="lspan" rx="5"/><g clip-path="url(#${id}-c)"><g mask="url(#${id}-m)">${area ? `<path class="larea" fill="url(#${id})"/>` : ''}<path class="lline"/></g></g>` +
    `<g class="lxl"></g><line class="lxh"/><circle class="lhalo" r="4"/><circle class="lend" r="4"/><circle class="lhot" r="4"/>`;
  host.append(svg);
  const q = <T extends Element>(n: string) => svg.querySelector(n) as T;
  const E = {
    grid: q<SVGGElement>('.lgrid'),
    span: q<SVGRectElement>('.lspan'),
    area: svg.querySelector<SVGPathElement>('.larea'),
    line: q<SVGPathElement>('.lline'),
    xl: q<SVGGElement>('.lxl'),
    xh: q<SVGLineElement>('.lxh'),
    halo: q<SVGCircleElement>('.lhalo'),
    end: q<SVGCircleElement>('.lend'),
    hot: q<SVGCircleElement>('.lhot'),
    focus: q<SVGLinearGradientElement>('.lfocus'),
    mask: q<SVGMaskElement>('mask'),
    mrect: q<SVGRectElement>('.lmask'),
    clip: q<SVGRectElement>('.lclip')
  };
  const stops = [...E.focus.children] as SVGStopElement[];
  // The target is the samples' ys, then their xs, then the end dot, the selection band and the context's dimming
  const Y0 = 0,
    X0 = RES,
    EX = 2 * RES,
    EY = EX + 1,
    BX = EX + 2,
    BW = EX + 3,
    CA = EX + 4;
  let cur: { w: number; h: number; target: number[] } | null = null,
    live: number[] | null = null;
  let raf = 0,
    revealRaf = 0,
    tickKey = '',
    gridKey = '',
    ctx = { x: 0, a: 1 },
    scrubX: number | null = null;
  let geo: { X: (t: number) => number; Y: (v: number) => number; pts: LinePoint[]; padT: number; base: number } | null = null;

  function focus() {
    const o = scrubX == null ? [0, ctx.x, ctx.x, 1, 1, 1] : [0, 0, 0, scrubX, scrubX, 1];
    const a = scrubX == null ? [ctx.a, ctx.a, 1, 1, 1, 1] : [1, 1, 1, 1, 0.3, 0.3];
    stops.forEach((s, k) => {
      s.setAttribute('offset', clamp(o[k]!, 0, 1).toFixed(4));
      s.style.stopOpacity = String(a[k]);
    });
  }
  function apply(v: number[], base: number) {
    let d = `M${v[X0]!.toFixed(1)},${v[Y0]!.toFixed(1)}`;
    for (let k = 1; k < RES; k++) d += `L${v[X0 + k]!.toFixed(1)},${v[Y0 + k]!.toFixed(1)}`;
    E.line.setAttribute('d', d);
    if (E.area) E.area.setAttribute('d', `${d}L${v[X0 + RES - 1]!.toFixed(1)},${base}L${v[X0]!.toFixed(1)},${base}Z`);
    for (const c of [E.end, E.halo]) {
      c.setAttribute('cx', v[EX]!.toFixed(1));
      c.setAttribute('cy', v[EY]!.toFixed(1));
    }
    E.span.setAttribute('x', v[BX]!.toFixed(1));
    E.span.setAttribute('width', Math.max(0, v[BW]!).toFixed(1));
    // The band rect starts 5px before the selection; the dim stops just short of its first reading
    ctx = { x: (v[BX]! + 2) / (cur?.w || 1), a: v[CA]! };
    focus();
  }
  function reveal(full: number) {
    cancelAnimationFrame(revealRaf);
    const t0 = performance.now();
    const step = (now: number) => {
      // A frame's time can be a little before t0, which would draw a negative width
      const p = clamp((now - t0) / 1000, 0, 1);
      E.clip.setAttribute('width', (full * (1 - Math.pow(1 - p, 4))).toFixed(1));
      revealRaf = p < 1 ? requestAnimationFrame(step) : 0;
    };
    E.clip.setAttribute('width', '0');
    revealRaf = requestAnimationFrame(step);
  }
  function render(d: LineData) {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h || !d.pts.length) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    E.focus.setAttribute('x2', String(w));
    for (const r of [E.mask, E.mrect]) {
      r.setAttribute('x', '-30');
      r.setAttribute('y', '-30');
      r.setAttribute('width', String(w + 60));
      r.setAttribute('height', String(h + 60));
    }
    E.clip.setAttribute('height', String(h + 60));
    const padR = axes ? 30 : 5,
      padL = axes ? 0 : 5,
      padT = 6,
      padB = axes ? 18 : 6;
    let lo = Infinity,
      hi = -Infinity;
    for (const p of d.pts) {
      lo = Math.min(lo, p.v);
      hi = Math.max(hi, p.v);
    }
    const ticks: number[] = [];
    let dec = 0;
    if (axes) {
      const range = Math.max(hi - lo, Math.abs(hi) * 0.02, 0.6),
        plo = lo - range * 0.12,
        phi = hi + range * 0.12;
      const step =
        [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find(s => Math.ceil(phi / s) - Math.floor(plo / s) <= 3) ||
        20000;
      lo = Math.floor(plo / step) * step;
      hi = Math.ceil(phi / step) * step;
      if (lo < 0 && d.pts.every(p => p.v >= 0)) lo = 0;
      for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(2));
      dec = step < 1 ? 1 : 0;
    } else {
      const pad = Math.max((hi - lo) * 0.18, Math.abs(hi) * 0.02, 0.5);
      lo = Math.max(0, lo - pad);
      hi += pad;
    }
    const X = (t: number) => padL + (d.t1 === d.t0 ? 1 : (t - d.t0) / (d.t1 - d.t0)) * (w - padL - padR);
    const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (h - padT - padB);
    const P = d.pts,
      L = P.length - 1,
      M = slopes(P);
    // Samples run between the first and last readings; a single reading stands across the window
    const s0 = L ? P[0]!.t : d.t0,
      s1 = L ? P[L]!.t : d.t1;
    const ys: number[] = [],
      xs: number[] = [];
    let j = 0;
    for (let k = 0; k < RES; k++) {
      const t = s0 + (k / (RES - 1)) * (s1 - s0);
      xs.push(X(t));
      while (j < L - 1 && P[j + 1]!.t < t) j++;
      const v = t <= P[0]!.t ? P[0]!.v : t >= P[L]!.t ? P[L]!.v : hermite(P[j]!, P[j + 1]!, M[j]!, M[j + 1]!, t);
      ys.push(Y(v));
    }
    const target = [...ys, ...xs, X(P[L]!.t), Y(P[L]!.v)];
    if (d.band) {
      const x0 = X(d.band[0]),
        x1 = X(d.band[1]);
      target.push(x0 - 5, x1 - x0 + 10);
    } else target.push(X(P[L]!.t), 0);
    // A single day is read against its run-up, so only a span of days dims what comes before it
    target.push(d.band && d.band[1] > d.band[0] ? 0.4 : 1);
    geo = { X, Y, pts: P, padT, base: h - padB };
    if (axes) {
      // New ticks fade in; a new size only redraws them
      const tk = ticks.join(),
        gk = `${tk}|${w}x${h}`;
      if (gk !== gridKey) {
        gridKey = gk;
        E.grid.innerHTML = ticks
          .map(
            v =>
              `<line x1="0" x2="${w - padR + 4}" y1="${Math.round(Y(v)) + 0.5}" y2="${Math.round(Y(v)) + 0.5}"/><text x="${w}" y="${Y(v) + 3}" text-anchor="end">${v >= 1000 ? compact(v) : v.toFixed(dec)}</text>`
          )
          .join('');
        if (cur && tk !== tickKey) replay(E.grid, 'fadein');
        tickKey = tk;
      }
      const [a, b] = d.xl ?? ['', ''];
      E.xl.innerHTML = `<text x="0" y="${h - 3}">${a}</text><text x="${w - padR}" y="${h - 3}" text-anchor="end">${b}</text>`;
    }
    E.span.setAttribute('y', String(padT - 2));
    E.span.setAttribute('height', String(Math.max(0, h - padT - padB + 4)));
    E.span.style.opacity = d.band ? '1' : '0';
    E.halo.classList.toggle('on', !!d.live && !REDUCE);
    // Only the first draw wipes in; a new size takes the new shape at once
    const drawn = !!cur,
      from = cur && cur.w === w && cur.h === h ? (live ?? cur.target) : null;
    cur = { w, h, target };
    cancelAnimationFrame(raf);
    const base = h - padB;
    if (!from || REDUCE) {
      live = null;
      apply(target, base);
      if (!drawn && !REDUCE) {
        E.end.classList.remove('pop');
        void E.end.getBBox();
        E.end.classList.add('pop');
        reveal(w + 60);
      } else {
        cancelAnimationFrame(revealRaf);
        E.clip.setAttribute('width', String(w + 60));
      }
      return;
    }
    const t0 = performance.now(),
      dur = 640;
    const step = (now: number) => {
      const p = clamp((now - t0) / dur, 0, 1),
        e = 1 - Math.pow(1 - p, 3);
      live = from.map((v, i) => v + (target[i]! - v) * e);
      apply(live, base);
      if (p < 1) raf = requestAnimationFrame(step);
      else live = null;
    };
    raf = requestAnimationFrame(step);
  }
  function nearest(px: number): number {
    if (!geo) return -1;
    let best = -1,
      bd = Infinity;
    geo.pts.forEach((p, i) => {
      const dd = Math.abs(geo!.X(p.t) - px);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    return best;
  }
  function mark(i: number) {
    if (i < 0 || !geo || !cur) {
      host.classList.remove('scrubbing');
      scrubX = null;
      if (cur) focus();
      return;
    }
    const p = geo.pts[i]!,
      x = Math.round(geo.X(p.t)) + 0.5;
    E.xh.setAttribute('x1', String(x));
    E.xh.setAttribute('x2', String(x));
    E.xh.setAttribute('y1', String(geo.padT - 2));
    E.xh.setAttribute('y2', String(geo.base));
    E.hot.setAttribute('cx', String(geo.X(p.t)));
    E.hot.setAttribute('cy', String(geo.Y(p.v)));
    scrubX = geo.X(p.t) / cur.w;
    focus();
    host.classList.add('scrubbing');
  }
  return { render, nearest, mark };
}

/* ---------- Bar chart: bars keep their slots so heights morph when the count stays the same ---------- */
export interface BarItem {
  v: number | null;
  cls: string;
  tick?: string | number;
  on?: boolean;
  live?: boolean;
}
export interface BarData {
  key: string;
  items: BarItem[];
  max: number;
  goal: number;
  goalText: string;
}

export function barPlot(host: HTMLElement): Plot<BarData> {
  host.innerHTML = '<div class="bwrap"><div class="bgoal"><span></span></div><div class="bslots"></div></div><div class="bticks"></div>';
  const slotsEl = host.querySelector('.bslots') as HTMLElement & { _t?: ReturnType<typeof setTimeout> };
  const ticksEl = host.querySelector('.bticks') as HTMLElement,
    goalEl = host.querySelector('.bgoal') as HTMLElement;
  let key = '',
    slots: HTMLElement[] = [],
    bars: HTMLElement[] = [],
    items: BarItem[] = [];
  function render(d: BarData) {
    items = d.items;
    if (d.key !== key || d.items.length !== bars.length) {
      key = d.key;
      slotsEl.innerHTML = d.items.map((_, i) => `<span class="bslot" style="--k:${i}"><i class="bar"></i></span>`).join('');
      slots = [...slotsEl.children] as HTMLElement[];
      bars = slots.map(s => s.firstElementChild as HTMLElement);
      const lag = Math.min(24, 360 / bars.length);
      slotsEl.style.setProperty('--lag', `${lag}ms`);
      bars.forEach((b, i) => (b.style.transitionDelay = REDUCE ? '0ms' : `${i * lag}ms`));
      if (!REDUCE) {
        slotsEl.classList.add('in');
        clearTimeout(slotsEl._t);
        slotsEl._t = setTimeout(() => slotsEl.classList.remove('in'), 600 + bars.length * lag);
      }
      void slotsEl.offsetHeight;
    } else bars.forEach(b => (b.style.transitionDelay = '0ms'));
    ticksEl.innerHTML = d.items.map(it => `<span${it.on ? ' class="on"' : ''}>${it.tick ?? ''}</span>`).join('');
    d.items.forEach((it, i) => {
      slots[i]!.classList.toggle('none', it.cls === 'none');
      bars[i]!.className = 'bar ' + it.cls + (it.live && !REDUCE ? ' live' : '');
      bars[i]!.style.height = it.v == null ? '0%' : `${Math.max(2.5, (it.v / d.max) * 100)}%`;
    });
    goalEl.classList.toggle('none', !d.goal);
    if (d.goal) {
      goalEl.style.bottom = `${(d.goal / d.max) * 100}%`;
      (goalEl.firstElementChild as HTMLElement).textContent = d.goalText;
    }
  }
  function nearest(px: number): number {
    const w = slotsEl.clientWidth;
    if (!items.length || px > w + 6) return -1;
    let i = clamp(Math.floor(px / (w / items.length)), 0, items.length - 1);
    while (i > 0 && items[i]!.v == null) i--;
    return items[i] && items[i]!.v != null ? i : -1;
  }
  function mark(i: number) {
    bars.forEach((b, k) => {
      b.classList.toggle('hot', k === i);
      slots[k]!.classList.toggle('hot', k === i);
    });
  }
  return { render, nearest, mark };
}

/* ---------- Activity grid: weeks as columns, days as rows ---------- */
export interface HeatCell {
  lvl: number;
  out: boolean;
  sel: boolean;
  live: boolean;
  none: boolean;
}
export interface HeatData {
  key: string;
  ncols: number;
  cells: HeatCell[];
  months: { col: number; text: string }[];
}

export function heatPlot(host: HTMLElement): Plot<HeatData> {
  host.innerHTML =
    '<div class="hbox"><span class="legend" aria-hidden="true">Less<i></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i>More</span><div class="hmonths"></div><div class="hgrid"></div></div>';
  const monthsEl = host.querySelector('.hmonths') as HTMLElement,
    gridEl = host.querySelector('.hgrid') as HTMLElement;
  const legendEl = host.querySelector('.legend') as HTMLElement;
  const H = host as HTMLElement & { _t?: ReturnType<typeof setTimeout> };
  let key = '',
    cells: HTMLElement[] = [],
    data: HeatCell[] = [];
  function render(d: HeatData) {
    data = d.cells;
    const W = host.clientWidth,
      Hh = host.clientHeight;
    const g = d.ncols > 30 ? 1.5 : 2;
    const cs = Math.max(3, Math.min(12, (W - (d.ncols - 1) * g) / d.ncols, (Hh - 14 - 6 * g) / 7));
    gridEl.style.setProperty('--cs', `${cs.toFixed(2)}px`);
    gridEl.style.setProperty('--g', `${g}px`);
    if (d.key !== key) {
      key = d.key;
      gridEl.innerHTML = d.cells.map((_, i) => `<i class="hc" data-i="${i}" style="--c:${Math.floor(i / 7)}"></i>`).join('');
      cells = [...gridEl.children] as HTMLElement[];
      if (!REDUCE) {
        replay(host, 'in');
        clearTimeout(H._t);
        H._t = setTimeout(() => host.classList.remove('in'), 520 + d.ncols * 12);
      }
    }
    const gw = d.ncols * cs + (d.ncols - 1) * g,
      from = legendEl.offsetWidth + 14;
    monthsEl.innerHTML = d.months
      .filter(m => m.col * (cs + g) >= from && m.col * (cs + g) < gw - 18)
      .map(m => `<span style="left:${(m.col * (cs + g)).toFixed(1)}px">${m.text}</span>`)
      .join('');
    d.cells.forEach((c, i) => {
      cells[i]!.className =
        `hc l${c.lvl}${c.out ? ' out' : ''}${c.sel ? ' sel' : ''}${c.live && !REDUCE ? ' live' : ''}${c.none ? ' none' : ''}`;
    });
  }
  function nearest(_px: number, _py: number, target: Element | null): number {
    const c = target && target.closest && target.closest<HTMLElement>('.hc');
    if (c && host.contains(c)) {
      const i = +c.dataset.i!;
      return data[i] && !data[i]!.none ? i : -1;
    }
    return -1;
  }
  function mark(i: number) {
    cells.forEach((c, k) => c.classList.toggle('hot', k === i));
  }
  return { render, nearest, mark };
}
