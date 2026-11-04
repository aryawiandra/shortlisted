// DOM builders for the demo. Every string goes in as text, never as HTML,
// so applicant input and model output cannot inject markup.

import { PERSONAS, personaById } from "../lib/personas.js";
import { TIERS, groupByTier, radarChart, tierOf } from "./radar.js";

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}

export const caseRow = (caseData, onPick) =>
  el(
    "button",
    { class: "case-row", type: "button", onclick: () => onPick(caseData.id) },
    el("span", { class: "case-industry" }, caseData.industry),
    el("span", { class: "case-title" }, caseData.title),
    el("span", { class: "case-cta" }, "Pilih kasus ini"),
  );

export const factList = (facts) => el("ul", { class: "facts" }, facts.map((fact) => el("li", {}, fact)));

const initial = (name) => name.slice(0, 1).toUpperCase();

export function roster(speakingId) {
  const people = PERSONAS.map((persona) =>
    el(
      "li",
      { class: `person${speakingId === persona.id ? " speaking" : ""}`, "data-id": persona.id },
      el("span", { class: "avatar", "aria-hidden": "true" }, initial(persona.name)),
      el("span", { class: "person-text" }, el("strong", {}, persona.name), el("small", {}, persona.tagline)),
    ),
  );
  const you = el(
    "li",
    { class: "person you" },
    el("span", { class: "avatar", "aria-hidden": "true" }, "K"),
    el("span", { class: "person-text" }, el("strong", {}, "Kamu"), el("small", {}, "Pelamar")),
  );
  return [...people, you];
}

export function messageNode(message) {
  if (message.speaker === "you") {
    return el("li", { class: "msg you" }, el("span", { class: "msg-name" }, "Kamu"), el("p", {}, message.text));
  }
  const persona = personaById(message.speaker);
  return el(
    "li",
    { class: "msg" },
    el("span", { class: "msg-name" }, persona?.name ?? "Peserta", el("small", {}, persona?.tagline ?? "")),
    el("p", {}, message.text),
  );
}

export const typingNode = () =>
  el(
    "li",
    { class: "msg typing", "aria-label": "Peserta sedang mengetik" },
    el("span", { class: "dots", "aria-hidden": "true" }, el("i"), el("i"), el("i")),
  );

const MAX_SCORE = 5;
const TIER_ICON = { kuat: "✓", cukup: "≈", latih: "!" };

// Five discrete blocks read faster than a continuous bar for a 1-5 integer scale.
const pips = (score) =>
  el(
    "span",
    { class: "pips", role: "img", "aria-label": `${score} dari ${MAX_SCORE}` },
    Array.from({ length: MAX_SCORE }, (_, i) => el("i", { class: i < score ? "on" : null })),
  );

const tierBadge = (score) => {
  const tier = TIERS.find((t) => t.tier === tierOf(score));
  return el(
    "span",
    { class: `tier-badge tier-${tier.tier}` },
    el("span", { "aria-hidden": "true" }, TIER_ICON[tier.tier]),
    tier.label,
  );
};

function tierBoard(scores) {
  return el(
    "div",
    { class: "tiers" },
    groupByTier(scores).map((group) =>
      el(
        "section",
        { class: `tier tier-${group.tier}` },
        el(
          "h4",
          {},
          el("span", { class: "tier-icon", "aria-hidden": "true" }, TIER_ICON[group.tier]),
          group.label,
          el("small", {}, group.hint),
        ),
        group.items.length
          ? el("ul", {}, group.items.map((item) => el("li", {}, item.label)))
          : el("p", { class: "tier-empty" }, "Belum ada"),
      ),
    ),
  );
}

function scoreRow(item) {
  return el(
    "li",
    { class: `score-row tier-${tierOf(item.score)}` },
    el("div", { class: "score-head" }, el("strong", {}, item.label), tierBadge(item.score)),
    el("div", { class: "score-meter" }, pips(item.score), el("span", { class: "score-num" }, `${item.score} dari ${MAX_SCORE}`)),
    el("p", { class: "score-comment" }, item.comment),
    item.evidence ? el("blockquote", {}, item.evidence) : null,
  );
}

export function scorecard(result) {
  const chart = radarChart(result.scores.map((s) => ({ label: s.label, score: s.score })));
  return el(
    "div",
    { class: "scorecard" },
    el(
      "div",
      { class: "sc-top" },
      el(
        "figure",
        { class: "sc-radar" },
        chart.node,
        el("figcaption", {}, "Makin luas bentuknya, makin kuat. Garis putus-putus menandai level Cukup (3)."),
      ),
      el("div", { class: "sc-verdict" }, el("p", { class: "summary" }, result.summary), tierBoard(result.scores)),
    ),
    el("h3", {}, "Rincian per aspek"),
    el("ul", { class: "scores" }, result.scores.map(scoreRow)),
    el("h3", {}, "Latih di sesi berikutnya"),
    el("ol", { class: "steps" }, result.nextSteps.map((step) => el("li", {}, step))),
  );
}
