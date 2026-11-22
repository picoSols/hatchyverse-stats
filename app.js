"use strict";
// Hatchyverse devlog stats - renders data.json. All text goes in via textContent.

const NAMES = { facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };
const SVGNS = "http://www.w3.org/2000/svg";
const $ = (s) => document.querySelector(s);

const fmt = (n) => {
  if (n === null || n === undefined) return "–";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
  return Math.round(n).toLocaleString("en-US");
};
const fmtSec = (s) => (s === null || s === undefined ? "–" : s.toFixed(1) + "s");
const fmtDate = (iso) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDay = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const color = (p) => `var(--s-${p})`;

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
function svg(tag, attrs = {}, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.href : "#";
  } catch {
    return "#";
  }
}

/* ---------- theme ---------- */
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
  else root.removeAttribute("data-theme");
  document.querySelectorAll("[data-set-theme]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.setTheme === (mode || "system")))
  );
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch {}
  applyTheme(saved || "system");
  document.querySelectorAll("[data-set-theme]").forEach((b) =>
    b.addEventListener("click", () => {
      applyTheme(b.dataset.setTheme);
      try { localStorage.setItem("theme", b.dataset.setTheme); } catch {}
    })
  );
}

/* ---------- tooltip ---------- */
const tip = $("#tooltip");
function showTip(x, y, title, rows) {
  tip.replaceChildren(el("div", { class: "tt-title" }, title));
  for (const r of rows) {
    const row = el("div", { class: "tt-row" });
    const key = el("span", { class: "key-line" });
    key.style.background = color(r.platform);
    row.append(key, el("strong", {}, r.value), el("span", {}, NAMES[r.platform]));
    tip.append(row);
  }
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const left = Math.min(window.innerWidth - w - 8, x + 14);
  const top = Math.max(8, Math.min(window.innerHeight - h - 8, y - h - 12));
  tip.style.left = Math.max(8, left) + "px";
  tip.style.top = top + "px";
}
const hideTip = () => (tip.hidden = true);

/* ---------- scales ---------- */
function niceMax(v) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const ticks = (max) => [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

function legend(container, platforms, kind) {
  container.replaceChildren();
  for (const p of platforms) {
    const s = el("span");
    const k = el("i", { class: kind === "bar" ? "key-rect" : "key-line", "aria-hidden": "true" });
    k.style.background = color(p);
    s.append(k, document.createTextNode(NAMES[p]));
    container.append(s);
  }
}

/* ---------- line chart (one y-axis, crosshair tooltip) ---------- */
function lineChart(host, points, platforms, emptyNote) {
  const W = Math.max(280, Math.round(host.clientWidth || 560)), H = W < 480 ? 220 : 260;
  const m = { t: 14, r: W < 400 ? 84 : 96, b: 28, l: 44 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Line chart; the same numbers are in the table view below" });
  const max = niceMax(Math.max(0, ...points.flatMap((pt) => platforms.map((p) => pt[p] ?? 0))));
  const n = points.length;
  const xs = points.map((pt) => Date.parse(pt.ts));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (i) => (n < 2 || x1 === x0 ? m.l + iw / 2 : m.l + ((xs[i] - x0) / (x1 - x0)) * iw);
  const Y = (v) => m.t + ih - (v / max) * ih;

  for (const t of ticks(max)) {
    root.append(svg("line", { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
    root.append(svg("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end" }, fmt(t)));
  }
  // x labels: first and last (and middle when there is room)
  const narrow = iw < 360;
  const xi = n <= 1 ? [0] : n === 2 || narrow ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
  const xFmt = narrow && n > 1 ? fmtDay : fmtDate;
  for (const i of xi) if (points[i]) root.append(svg("text", { x: X(i), y: H - 6, "text-anchor": n < 2 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle" }, xFmt(points[i].ts)));

  const ends = [];
  for (const p of platforms) {
    const idx = points.map((pt, i) => (pt[p] === null || pt[p] === undefined ? null : i)).filter((i) => i !== null);
    if (!idx.length) continue;
    if (idx.length > 1) {
      const area = `M${X(idx[0])},${Y(0)} ` + idx.map((i) => `L${X(i)},${Y(points[i][p])}`).join(" ") + ` L${X(idx[idx.length - 1])},${Y(0)} Z`;
      root.append(svg("path", { d: area, fill: color(p), opacity: 0.1 }));
      root.append(svg("path", { d: idx.map((i, k) => `${k ? "L" : "M"}${X(i)},${Y(points[i][p])}`).join(" "), fill: "none", stroke: color(p), "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    }
    const last = idx[idx.length - 1];
    ends.push({ p, x: X(last), y: Y(points[last][p]), v: points[last][p] });
  }
  // end dots with surface ring
  for (const e of ends) root.append(svg("circle", { cx: e.x, cy: e.y, r: 4.5, fill: color(e.p), stroke: "var(--surface)", "stroke-width": 2 }));
  // direct end labels only when they don't collide; otherwise legend + tooltip carry identity
  const sorted = [...ends].sort((a, b) => a.y - b.y);
  const collide = sorted.some((e, i) => i && e.y - sorted[i - 1].y < 14);
  if (!collide) for (const e of ends) root.append(svg("text", { x: e.x + 10, y: e.y + 4, class: "end-label" }, `${NAMES[e.p]} ${fmt(e.v)}`));
  else {
    const allSame = ends.every((e) => e.v === ends[0].v);
    if (allSame && ends.length) root.append(svg("text", { x: ends[0].x + 10, y: ends[0].y + 4, class: "end-label" }, `All ${fmt(ends[0].v)}`));
  }
  if (n < 2 && emptyNote) root.append(svg("text", { x: m.l + iw / 2, y: m.t + 16, "text-anchor": "middle", class: "note" }, emptyNote));

  // crosshair
  const cross = svg("line", { y1: m.t, y2: m.t + ih, stroke: "var(--muted)", "stroke-width": 1, visibility: "hidden" });
  root.append(cross);
  const hit = svg("rect", { x: m.l - 10, y: 0, width: iw + 20, height: H, fill: "transparent", tabindex: 0 });
  const nearest = (cx) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(X(i) - cx) < Math.abs(X(best) - cx)) best = i;
    return best;
  };
  const show = (i, clientX, clientY) => {
    cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("visibility", "visible");
    const rows = platforms.filter((p) => points[i][p] !== null && points[i][p] !== undefined).map((p) => ({ platform: p, value: fmt(points[i][p]) }));
    showTip(clientX, clientY, fmtDate(points[i].ts), rows.length ? rows : []);
  };
  hit.addEventListener("pointermove", (ev) => {
    const r = root.getBoundingClientRect();
    const cx = ((ev.clientX - r.left) / r.width) * W;
    show(nearest(cx), ev.clientX, ev.clientY);
  });
  hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
  hit.addEventListener("focus", () => { const r = root.getBoundingClientRect(); show(n - 1, r.left + (X(n - 1) / W) * r.width, r.top + 40); });
  hit.addEventListener("blur", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
  root.append(hit);
  host.replaceChildren(root);
}

/* ---------- stacked columns per episode ---------- */
function episodeColumns(host, episodes, platforms) {
  const W = Math.max(280, Math.round(host.clientWidth || 1040)), H = 240, m = { t: 22, r: 16, b: 30, l: 44 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Column chart of views per episode; the same numbers are in the table view below" });
  const total = (e) => platforms.reduce((a, p) => a + (e.posts.find((x) => x.platform === p)?.latest.views ?? 0), 0);
  const max = niceMax(Math.max(0, ...episodes.map(total)));
  const Y = (v) => m.t + ih - (v / max) * ih;
  const slots = Math.max(episodes.length, W < 500 ? 4 : 7);
  const band = iw / slots, bw = Math.min(24, band * 0.6);
  for (const t of ticks(max)) {
    root.append(svg("line", { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
    root.append(svg("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end" }, fmt(t)));
  }
  episodes.forEach((e, i) => {
    const cx = m.l + band * i + band / 2, x = cx - bw / 2;
    let base = 0;
    const segs = platforms.map((p) => ({ p, v: e.posts.find((x) => x.platform === p)?.latest.views ?? null })).filter((s) => s.v);
    segs.forEach((s, k) => {
      const y0 = Y(base), y1 = Y(base + s.v);
      const top = k === segs.length - 1;
      const h = Math.max(0, y0 - y1 - (k ? 2 : 0)); // 2px surface gap between segments
      const yTop = y1, r = top ? Math.min(4, h) : 0;
      const d = `M${x},${yTop + h} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} L${x + bw - r},${yTop} Q${x + bw},${yTop} ${x + bw},${yTop + r} L${x + bw},${yTop + h} Z`;
      const seg = svg("path", { d, fill: color(s.p), tabindex: 0 });
      const on = (ev) => { seg.setAttribute("opacity", 0.85); const b = seg.getBoundingClientRect(); showTip(ev.clientX ?? b.right, ev.clientY ?? b.top, `Day ${e.day}`, [{ platform: s.p, value: fmt(s.v) + " views" }]); };
      seg.addEventListener("pointermove", on); seg.addEventListener("focus", on);
      const off = () => { seg.setAttribute("opacity", 1); hideTip(); };
      seg.addEventListener("pointerleave", off); seg.addEventListener("blur", off);
      root.append(seg);
      base += s.v;
    });
    // Labels thin out when the bands get narrow; the tooltip and table keep every value.
    const every = Math.ceil(44 / band);
    if (band >= 40 || i === episodes.length - 1) root.append(svg("text", { x: cx, y: Y(base) - 6, "text-anchor": "middle", class: "end-label" }, fmt(total(e))));
    if (i % every === 0 || i === episodes.length - 1) root.append(svg("text", { x: cx, y: H - 8, "text-anchor": "middle" }, band >= 40 ? `Day ${e.day}` : String(e.day)));
  });
  host.replaceChildren(root);
}

/* ---------- page ---------- */
function render(d) {
  const P = d.platforms;
  const days = d.episodes.length;
  $("#day-badge").textContent = `DAY ${d.episodes[days - 1]?.day ?? 0}`;
  $("#series-title").textContent = d.series;
  $("#game-line").textContent = `${d.game} · ${days} episode${days === 1 ? "" : "s"} posted · goal: $${d.goal_usd.toLocaleString("en-US")}`;

  const sum = (k) => P.reduce((a, p) => a + (d.totals[p][k] ?? 0), 0);
  $("#hero-views").textContent = fmt(sum("views"));
  $("#updated").textContent = d.last_snapshot ? `Updated ${fmtDate(d.last_snapshot)} · ${d.snapshots} snapshot${d.snapshots === 1 ? "" : "s"}` : "No snapshots yet";
  const hs = $("#hero-stats");
  hs.replaceChildren();
  for (const [label, v] of [["Likes", sum("likes")], ["Comments", sum("comments")], ["Shares", sum("shares")], ["Followers", sum("followers")]]) {
    const box = el("div");
    box.append(el("dt", {}, label), el("dd", {}, fmt(v)));
    hs.append(box);
  }

  if (d.best && d.snapshots) {
    const b = d.best;
    $("#best-text").textContent = b.views > 0 || b.engagement > 0
      ? `Day ${b.day}: ${fmt(b.views)} views and ${fmt(b.engagement)} ${b.engagement === 1 ? "reaction" : "reactions"} (likes, comments and shares).${b.joke ? ` The joke: "${b.joke}".` : ""}`
      : `Day ${b.day} is the only contender so far.${b.joke ? ` Opening joke: "${b.joke}".` : ""}`;
    $("#best").hidden = false;
  }

  const plats = $("#platforms");
  plats.replaceChildren();
  for (const p of P) {
    const t = d.totals[p];
    const card = el("article", { class: "card pixel" });
    const head = el("div", { class: "plat-head" });
    const sw = el("i", { class: "swatch", "aria-hidden": "true" });
    sw.style.background = color(p);
    const link = el("a", { href: safeUrl(d.profiles[p]), target: "_blank", rel: "noopener noreferrer" }, "Profile ↗");
    head.append(sw, el("h3", {}, NAMES[p]), link);
    const grid = el("dl", { class: "plat-grid" });
    for (const [label, v] of [["Likes", t.likes], ["Comments", t.comments], ["Shares", t.shares], ["Followers", t.followers]]) grid.append(el("dt", {}, label), el("dd", {}, fmt(v)));
    card.append(head, el("p", { class: "plat-views" }, fmt(t.views)), el("p", { class: "label" }, t.views === null ? "views not available yet" : "views"), grid);
    plats.append(card);
  }

  document.querySelectorAll('[data-legend="line"]').forEach((l) => legend(l, P, "line"));
  document.querySelectorAll('[data-legend="bar"]').forEach((l) => legend(l, P, "bar"));
  const note = "Trend lines start after the second daily snapshot";
  lineChart($("#chart-views"), d.views_over_time, P, note);
  const fRuns = [...new Set(P.flatMap((p) => d.followers[p].map((f) => f.ts)))].sort();
  const fPoints = fRuns.map((ts) => {
    const pt = { ts };
    for (const p of P) { const h = d.followers[p].filter((f) => f.ts <= ts); pt[p] = h.length ? h[h.length - 1].value : null; }
    return pt;
  });
  lineChart($("#chart-followers"), fPoints, P, note);
  episodeColumns($("#chart-episodes"), d.episodes, P);

  const eps = $("#episodes");
  eps.replaceChildren();
  for (const e of [...d.episodes].reverse()) {
    const card = el("article", { class: "card pixel" });
    const head = el("div", { class: "ep-head" });
    head.append(el("p", { class: "px" }, `DAY ${e.day}`), el("span", { class: "muted small" }, fmtDay(e.date)));
    card.append(head, el("p", { class: "ep-total" }, `${fmt(e.totals.views)} views`));
    if (e.jokes[0]) card.append(el("p", { class: "ep-joke" }, `“${e.jokes[0]}”`));
    const ul = el("ul", { class: "ep-rows" });
    for (const p of e.posts) {
      const li = el("li");
      const sw = el("i", { class: "swatch", "aria-hidden": "true" });
      sw.style.background = color(p.platform);
      const a = el("a", { href: safeUrl(p.url), target: "_blank", rel: "noopener noreferrer" }, `${NAMES[p.platform]} ↗`);
      const nums = el("span", { class: "nums" });
      nums.append(el("strong", {}, fmt(p.latest.views)), document.createTextNode(" views"));
      const sub = el("span", { class: "sub" }, `${fmt(p.latest.likes)} likes · ${fmt(p.latest.comments)} comments · ${fmt(p.latest.shares)} shares`);
      li.append(sw, a, nums, sub);
      ul.append(li);
    }
    card.append(ul);
    eps.append(card);
  }

  const table = $("#table");
  table.replaceChildren();
  const thead = el("thead"), tr = el("tr");
  for (const h of ["Day", "Platform", "Views", "Likes", "Comments", "Shares", "Saves", "Avg watch", "Updated"]) tr.append(el("th", { scope: "col" }, h));
  thead.append(tr);
  const tbody = el("tbody");
  for (const e of d.episodes)
    for (const p of e.posts) {
      const r = el("tr");
      for (const v of [`Day ${e.day}`, NAMES[p.platform], fmt(p.latest.views), fmt(p.latest.likes), fmt(p.latest.comments), fmt(p.latest.shares), fmt(p.latest.saves), fmtSec(p.latest.avg_watch_s), p.updated ? fmtDate(p.updated) : "–"]) r.append(el("td", {}, v));
      tbody.append(r);
    }
  for (const p of P) {
    const r = el("tr");
    for (const v of ["Followers", NAMES[p], fmt(d.totals[p].followers), "", "", "", "", "", ""]) r.append(el("td", {}, v));
    tbody.append(r);
  }
  table.append(thead, tbody);
}

let current = null;
let resizeTimer = 0;
let lastWidth = window.innerWidth;
window.addEventListener("resize", () => {
  if (!current || window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(current), 150);
});

initTheme();
fetch("data.json", { cache: "no-cache" })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((d) => { current = d; render(d); })
  .catch(() => { $("#updated").textContent = "Could not load the numbers. Try again in a minute."; });
