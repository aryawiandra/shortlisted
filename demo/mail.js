// The inbox window: message list and reader. Emails are immutable; opening one replaces it
// with a read copy. New mail slides into the top of the list and glows briefly.

import { formatReceived } from "./inbox.js";
import { el, scorecard } from "./render.js";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const $ = (id) => document.getElementById(id);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const fullDate = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const PRICING_URL = "/#harga";

export function createMail({ onAction, onOpen = () => {}, now = () => Date.now() }) {
  const win = $("mail-window");
  const list = $("mail-list");
  const reader = $("mail-reader");
  let emails = [];
  let openId = null;

  const unreadCount = () => emails.filter((e) => e.unread).length;

  function updateCount() {
    const n = unreadCount();
    $("mail-count").textContent = n ? `${n} belum dibaca` : "Semua sudah dibaca";
    document.title = n ? `(${n}) Kotak Masuk | Simulasi Shortlisted` : "Kotak Masuk | Simulasi Shortlisted";
  }

  function row(email) {
    return el(
      "li",
      {},
      el(
        "button",
        {
          class: `mail-row${email.unread ? " is-unread" : ""}`,
          type: "button",
          "data-id": email.id,
          "aria-current": email.id === openId ? "true" : null,
          onclick: () => open(email.id),
        },
        el("span", { class: "row-dot", "aria-label": email.unread ? "Belum dibaca" : null }),
        el("span", { class: "row-from" }, email.from.name),
        el("time", { class: "row-time", datetime: new Date(email.receivedAt).toISOString() }, formatReceived(email.receivedAt, now())),
        el("span", { class: "row-subject" }, email.subject),
        el("span", { class: "row-preview" }, email.preview),
      ),
    );
  }

  function renderList(arrivedId = null) {
    list.replaceChildren(...emails.map(row));
    updateCount();
    if (!arrivedId) return;
    const node = list.querySelector(`[data-id="${arrivedId}"]`)?.parentElement;
    if (!node) return;
    node.classList.add("is-new");
    setTimeout(() => node.classList.remove("is-new"), 1800);
    if (!reduced()) {
      node.animate([{ height: "0px", opacity: 0 }, { height: `${node.offsetHeight}px`, opacity: 1 }], { duration: 360, easing: EASE });
    }
  }

  const actionButton = (block, email, primary) =>
    block.action === "pricing"
      ? el("a", { class: `mail-btn${primary ? " is-primary" : ""}`, href: PRICING_URL }, block.label)
      : el(
          "button",
          { class: `mail-btn${primary ? " is-primary" : ""}`, type: "button", onclick: (event) => onAction(block.action, email, event.currentTarget) },
          block.label,
        );

  function blockNode(block, email) {
    switch (block.type) {
      case "p":
        return el("p", {}, block.text);
      case "schedule":
        return el(
          "section",
          { class: "mail-schedule", "aria-label": block.title },
          el("h3", {}, block.title),
          el("dl", {}, block.rows.flatMap((r) => [el("dt", {}, r.label), el("dd", {}, r.value)])),
        );
      case "list":
        return el("section", { class: "mail-checklist" }, el("h3", {}, block.title), el("ul", {}, block.items.map((item) => el("li", {}, item))));
      case "meta":
        return el("p", { class: "mail-meta" }, block.text);
      case "signature":
        return el("p", { class: "mail-signature" }, block.lines.map((line) => el("span", {}, line)));
      case "fineprint":
        return el("p", { class: "mail-fine" }, block.text);
      case "scorecard":
        return el("div", { class: "mail-scorecard" }, scorecard(block.result));
      default:
        return null;
    }
  }

  // Consecutive actions share one row; the first is the primary one.
  function bodyNodes(email) {
    const nodes = [];
    let group = null;
    for (const block of email.body) {
      if (block.type === "action") {
        if (!group) {
          group = el("div", { class: "mail-actions" });
          nodes.push(group);
        }
        group.append(actionButton(block, email, group.childElementCount === 0));
        continue;
      }
      group = null;
      nodes.push(blockNode(block, email));
    }
    return nodes;
  }

  function renderReader() {
    const email = emails.find((e) => e.id === openId);
    if (!email) {
      reader.replaceChildren(
        el("div", { class: "reader-empty" }, el("p", {}, emails.length ? "Pilih email di sebelah kiri untuk membacanya." : "Kotak masuk kosong.")),
      );
      return;
    }
    reader.replaceChildren(
      el("button", { class: "reader-back", type: "button", onclick: back }, "Kotak Masuk"),
      el(
        "header",
        { class: "reader-head" },
        el("span", { class: `avatar avatar-${email.from.id}`, "aria-hidden": "true" }, email.from.initials),
        el(
          "div",
          { class: "reader-who" },
          el("strong", {}, email.from.name),
          el("span", { class: "reader-address" }, email.from.address),
          el("span", { class: "reader-to" }, `Kepada: ${email.to}`),
        ),
        el("time", { class: "reader-time", datetime: new Date(email.receivedAt).toISOString() }, fullDate.format(email.receivedAt)),
      ),
      el("h2", { class: "reader-subject", tabindex: "-1" }, email.subject),
      el("div", { class: "reader-body" }, bodyNodes(email)),
    );
  }

  function open(id, { focus = true } = {}) {
    openId = id;
    onOpen(id);
    emails = emails.map((e) => (e.id === id && e.unread ? Object.freeze({ ...e, unread: false }) : e));
    renderList();
    renderReader();
    win.classList.add("is-reading");
    reader.scrollTop = 0;
    if (!reduced()) reader.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: EASE });
    if (focus) reader.querySelector(".reader-subject")?.focus({ preventScroll: true });
  }

  function back() {
    win.classList.remove("is-reading");
    list.querySelector(`[data-id="${openId}"]`)?.focus({ preventScroll: true });
  }

  list.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = [...list.querySelectorAll(".mail-row")];
    const at = rows.indexOf(document.activeElement);
    const next = rows[Math.min(rows.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    event.preventDefault();
    next.focus();
    open(next.dataset.id, { focus: false });
  });

  return Object.freeze({
    setEmails: (next) => {
      emails = [...next];
      renderList();
      renderReader();
    },
    add: (email) => {
      emails = [email, ...emails];
      renderList(email.id);
    },
    open,
    find: (predicate) => emails.find(predicate) ?? null,
    setStatus: (text) => {
      $("mail-status").hidden = !text;
      $("mail-status").textContent = text ?? "";
    },
  });
}
