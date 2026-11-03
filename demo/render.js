// DOM builders for the demo. Every string goes in as text, never as HTML,
// so applicant input and model output cannot inject markup.

import { PERSONAS, personaById } from "../lib/personas.js";

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

export function scorecard(result) {
  const rows = result.scores.map((item) => {
    const bar = el("span", { class: "track", role: "img", "aria-label": `${item.score} dari 5` }, el("i"));
    bar.style.setProperty("--w", `${item.score * 20}%`);
    return el(
      "li",
      { class: `score-row${item.score <= 2 ? " low" : ""}` },
      el("div", { class: "score-head" }, el("strong", {}, item.label), el("span", { class: "score-num" }, `${item.score}/5`)),
      bar,
      el("p", { class: "score-comment" }, item.comment),
      item.evidence ? el("blockquote", {}, item.evidence) : null,
    );
  });
  return el(
    "div",
    { class: "scorecard" },
    el("p", { class: "summary" }, result.summary),
    el("ul", { class: "scores" }, rows),
    el("h3", {}, "Latih di sesi berikutnya"),
    el("ol", { class: "steps" }, result.nextSteps.map((step) => el("li", {}, step))),
  );
}
