// Landing page behaviour: the three-moment LGD simulator, persona tips, sample radars,
// and scroll reveals. Every string is inserted as text, never as HTML.

import { el } from "../demo/render.js";
import { groupByTier, radarChart } from "../demo/radar.js";
import { MOMENTS, SIM_ASPECTS, scoreAfter } from "./simulator.js";

const TIER_ICON = { kuat: "✓", cukup: "≈", latih: "!" };
const SAMPLE = [4, 3, 4, 5, 2, 3];
const LETTERS = ["A", "B", "C"];
const DEMO_URL = "demo/";

const withLabels = (scores) => SIM_ASPECTS.map((aspect, i) => ({ label: aspect.label, score: scores[i] }));

function tierLines(scores) {
  return groupByTier(withLabels(scores)).map((group) =>
    el(
      "div",
      { class: `tier-line ${group.tier}` },
      el("b", {}, el("i", { "aria-hidden": "true" }, TIER_ICON[group.tier]), group.label),
      el("span", {}, group.items.length ? group.items.map((item) => item.label).join(", ") : "Belum ada"),
    ),
  );
}

function deltaChips(deltas) {
  const entries = SIM_ASPECTS.filter((aspect) => deltas[aspect.id]).map((aspect) => [aspect.label, deltas[aspect.id]]);
  if (entries.length === 0) return [el("span", { class: "delta none" }, "Tidak ada aspek yang naik")];
  return entries.map(([label, value]) =>
    el("span", { class: `delta ${value > 0 ? "up" : "down"}` }, `${value > 0 ? "+" : "−"}${Math.abs(value)} ${label}`),
  );
}

// ---------- Simulator ----------
function mountSimulator() {
  const card = document.getElementById("sim-card");
  const radarHost = document.getElementById("sim-radar");
  const tierHost = document.getElementById("sim-tiers");
  if (!card || !radarHost || !tierHost) return;

  const chart = radarChart(withLabels(scoreAfter([])), { title: "Rapor sementara dari pilihanmu" });
  radarHost.replaceChildren(chart.node);

  let state = { step: 0, picks: [], answered: false };

  const refreshBoard = () => {
    const scores = scoreAfter(state.picks);
    chart.update(scores);
    tierHost.replaceChildren(...tierLines(scores));
  };

  const setState = (next, focusSelector) => {
    state = next;
    render();
    refreshBoard();
    if (focusSelector) card.querySelector(focusSelector)?.focus({ preventScroll: true });
  };

  const pick = (index) => {
    if (state.answered) return;
    setState({ ...state, picks: [...state.picks, index], answered: true }, ".sim-next .btn");
  };
  const next = () => setState({ ...state, step: state.step + 1, answered: false }, ".choice, .sim-end h3");
  const reset = () => setState({ step: 0, picks: [], answered: false }, ".choice");

  const progress = () =>
    el("div", { class: "sim-progress", "aria-hidden": "true" },
      MOMENTS.map((_, i) => el("i", { class: i < state.picks.length ? "done" : null })));

  function momentView() {
    const moment = MOMENTS[state.step];
    const chosen = state.answered ? state.picks[state.step] : -1;
    const choices = moment.choices.map((choice, i) =>
      el("li", {},
        el("button", {
          class: "choice", type: "button", disabled: state.answered,
          "aria-pressed": state.answered ? String(i === chosen) : null, onclick: () => pick(i),
        }, el("span", { class: "key", "aria-hidden": "true" }, LETTERS[i]), el("span", {}, choice.text))));

    const result = state.answered ? moment.choices[chosen] : null;
    const isLast = state.step === MOMENTS.length - 1;
    return [
      progress(),
      el("div", { class: "sim-meta" },
        el("span", { class: "sim-minute" }, moment.minute),
        el("span", {}, `Momen ${state.step + 1} dari ${MOMENTS.length}`)),
      el("div", { class: "speaker" },
        el("span", { class: "avatar", "aria-hidden": "true" }, moment.speaker.slice(0, 1)),
        el("div", {},
          el("div", { class: "speaker-name" }, moment.speaker, el("small", {}, moment.trait)),
          el("p", { class: "speech" }, moment.line))),
      el("p", { class: "sim-ask", id: "sim-ask" }, "Apa yang kamu ucapkan?"),
      el("ul", { class: "choices", "aria-labelledby": "sim-ask" }, choices),
      result
        ? el("div", { class: "feedback", role: "status" },
            el("strong", {}, result.verdict), el("p", {}, result.note), el("div", { class: "deltas" }, deltaChips(result.deltas)))
        : null,
      result
        ? el("div", { class: "sim-next" },
            el("button", { class: "btn btn-sun", type: "button", onclick: next }, isLast ? "Lihat rapormu" : "Momen berikutnya"))
        : null,
    ];
  }

  function endView() {
    const recap = MOMENTS.map((moment, i) => {
      const choice = moment.choices[state.picks[i]];
      return el("li", {}, `${moment.minute}: ${choice.verdict}`, el("small", {}, choice.note));
    });
    return [
      progress(),
      el("div", { class: "sim-end" },
        el("h3", { tabindex: "-1" }, "Itu baru tiga momen."),
        el("p", {}, "Di demo penuh, undangannya masuk ke email, kamu bergabung ke meeting dan bicara dengan kata-katamu sendiri, lalu rapornya menyusul lewat email."),
        el("ol", {}, recap)),
      el("div", { class: "sim-next" },
        el("button", { class: "btn btn-line", type: "button", onclick: reset }, "Coba jalur lain"),
        el("a", { class: "btn btn-sun", href: DEMO_URL }, "Main demo penuh")),
    ];
  }

  const render = () => card.replaceChildren(...(state.step < MOMENTS.length ? momentView() : endView()).filter(Boolean));

  render();
  refreshBoard();
}

// ---------- Persona tips ----------
function mountPersonaTips() {
  document.querySelectorAll(".tip-toggle").forEach((button) => {
    const tip = document.getElementById(button.getAttribute("aria-controls"));
    if (!tip) return;
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      tip.hidden = open;
    });
  });
}

// ---------- Sample radars (hero laptop + report card) ----------
function mountSampleRadars() {
  const hero = document.getElementById("hero-radar");
  if (hero) hero.replaceChildren(radarChart(withLabels(SAMPLE), { title: "Contoh rapor" }).node);
  const report = document.getElementById("report-radar");
  if (report) report.replaceChildren(radarChart(withLabels(SAMPLE), { title: "Contoh rapor sesi LGD" }).node);
  const tiers = document.getElementById("report-tiers");
  if (tiers) tiers.replaceChildren(...tierLines(SAMPLE));
}

// ---------- Reveal on scroll ----------
function mountReveal() {
  const targets = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window)) {
    targets.forEach((node) => node.classList.add("in"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -10% 0px" });
  targets.forEach((node) => observer.observe(node));
}

function start() {
  window.__landingReady = true;
  const steps = [mountSampleRadars, mountSimulator, mountPersonaTips, mountReveal];
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      // A broken enhancement must not hide content: reveal everything and keep going.
      console.error(`Landing: ${step.name} failed`, error);
      document.querySelectorAll("[data-reveal]").forEach((node) => node.classList.add("in"));
    }
  }
}

start();
