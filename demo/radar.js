// Radar ("hexagon") chart for the six assessment aspects, plus the tier grouping the
// scorecard uses. Geometry and grouping are pure so they run under node:test; only
// radarChart() touches the DOM. Labels are set as text, never as markup.

const SVG_NS = "http://www.w3.org/2000/svg";
const LABEL_GAP = 22;
const TWEEN_MS = 520;

export const TIERS = Object.freeze([
  Object.freeze({ tier: "kuat", label: "Kuat", hint: "Pertahankan" }),
  Object.freeze({ tier: "cukup", label: "Cukup", hint: "Sedikit lagi" }),
  Object.freeze({ tier: "latih", label: "Perlu dilatih", hint: "Fokus sesi berikutnya" }),
]);

export const tierOf = (score) => (score >= 4 ? "kuat" : score === 3 ? "cukup" : "latih");

export const groupByTier = (items) =>
  TIERS.map(({ tier, label, hint }) => ({
    tier,
    label,
    hint,
    items: items.filter((item) => tierOf(item.score) === tier),
  }));

const clampTo = (max) => (value) => Math.min(max, Math.max(0, Number(value) || 0));

function pointAt(index, count, distance, cx, cy) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return { x: cx + distance * Math.cos(angle), y: cy + distance * Math.sin(angle), angle };
}

// Points for the data shape, one hexagon ring per level, and label anchors.
export function radarGeometry(values, { max = 5, radius = 100, cx = 0, cy = 0 } = {}) {
  const count = values.length;
  const clamp = clampTo(max);
  const points = values.map((value, i) => pointAt(i, count, (clamp(value) / max) * radius, cx, cy));
  const rings = Array.from({ length: max }, (_, level) =>
    values.map((_, i) => pointAt(i, count, ((level + 1) / max) * radius, cx, cy)),
  );
  const labels = values.map((_, i) => pointAt(i, count, radius + LABEL_GAP, cx, cy));
  return { points, rings, labels };
}

const toPoints = (pts) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

const anchorFor = (x, cx) => (Math.abs(x - cx) < 4 ? "middle" : x < cx ? "end" : "start");

const prefersStill = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// items: [{ label, score }]. Returns { node, update(scores) } so a page can animate changes.
export function radarChart(items, { size = 340, max = 5, title = "Profil nilai per aspek" } = {}) {
  const pad = 70;
  const radius = (size - pad * 2) / 2;
  const c = size / 2;
  const geo = (values) => radarGeometry(values, { max, radius, cx: c, cy: c });
  const base = geo(items.map((item) => item.score));

  const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, class: "radar", role: "img", "aria-label": title });
  svg.append(svgEl("title", {}, title));

  base.rings.forEach((ring, level) => {
    const isMidLine = level + 1 === 3;
    svg.append(svgEl("polygon", { points: toPoints(ring), class: isMidLine ? "radar-ring radar-ring-mid" : "radar-ring" }));
  });
  base.rings.at(-1).forEach((p) => svg.append(svgEl("line", { x1: c, y1: c, x2: p.x, y2: p.y, class: "radar-axis" })));

  const shape = svgEl("polygon", { points: toPoints(base.points), class: "radar-shape" });
  svg.append(shape);

  const dots = base.points.map((p, i) => {
    const group = svgEl("g", { class: "radar-dot" });
    const tip = svgEl("title", {}, `${items[i].label}: ${items[i].score} dari ${max}`);
    const hit = svgEl("circle", { cx: p.x, cy: p.y, r: 16, class: "radar-hit" });
    const dot = svgEl("circle", { cx: p.x, cy: p.y, r: 5 });
    group.append(tip, hit, dot);
    svg.append(group);
    return { tip, hit, dot };
  });

  const scoreTexts = base.labels.map((p, i) => {
    const text = svgEl("text", { x: p.x, y: p.y, "text-anchor": anchorFor(p.x, c), class: "radar-label" });
    const name = svgEl("tspan", { x: p.x, dy: "-0.2em" }, items[i].label);
    const score = svgEl("tspan", { x: p.x, dy: "1.25em", class: "radar-score" }, `${items[i].score}/${max}`);
    text.append(name, score);
    svg.append(text);
    return score;
  });

  let current = items.map((item) => item.score);
  let frame = 0;

  const draw = (values) => {
    const { points } = geo(values);
    shape.setAttribute("points", toPoints(points));
    points.forEach((p, i) => {
      for (const node of [dots[i].hit, dots[i].dot]) {
        node.setAttribute("cx", p.x.toFixed(1));
        node.setAttribute("cy", p.y.toFixed(1));
      }
    });
  };

  const update = (scores) => {
    const from = current;
    const to = scores.map(Number);
    current = to;
    to.forEach((score, i) => {
      scoreTexts[i].textContent = `${score}/${max}`;
      dots[i].tip.textContent = `${items[i].label}: ${score} dari ${max}`;
    });
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    if (prefersStill() || typeof requestAnimationFrame !== "function") return draw(to);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - (1 - t) ** 3;
      draw(from.map((f, i) => f + (to[i] - f) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };

  return { node: svg, update };
}
