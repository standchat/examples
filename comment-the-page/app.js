import { getClient, parseCard } from "./stand-visitor.js";
import {
  palettes,
  targets,
  normalizeDesign,
  estimatePlan,
  designCSS,
  targetContext,
  conversationPrompt,
  safeUrl,
} from "./model.js";

const $ = (id) => document.getElementById(id);
const site = document.querySelector("script[data-stand-id]").dataset.standId;
const storageKey = `framefield:context:v1:${site}`;
const entries = new Map();
let design = normalizeDesign();
let plan = estimatePlan(4, "monthly");
let mode = false;
let selected = null;
let returnFocus = null;
let saved = {};
try {
  saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
} catch {
  /* Storage is optional. */
}
if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
design = normalizeDesign(saved.settings?.design);
plan = estimatePlan(
  saved.settings?.plan?.editors ?? 4,
  saved.settings?.plan?.billing,
);
$("layout").value = design.layout;
$("spacing").value = design.spacing;
$("seats").value = plan.editors;
$("billing").value = plan.billing;
const contexts = {};
for (const key of Object.keys(targets)) {
  const old = saved[key];
  if (old && typeof old.context === "string" && old.context.length <= 2000) {
    contexts[key] = { context: old.context, point: clampPoint(old.point) };
  }
}

function clampPoint(point) {
  return {
    x: Math.min(
      0.94,
      Math.max(0.06, Number.isFinite(point?.x) ? point.x : 0.73),
    ),
    y: Math.min(
      0.92,
      Math.max(0.12, Number.isFinite(point?.y) ? point.y : 0.56),
    ),
  };
}
function saveContexts() {
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        ...contexts,
        settings: { design, plan },
        open: selected,
      }),
    );
  } catch {
    /* Continue in memory. */
  }
}
function announce(message) {
  $("announcement").textContent = message;
}

function renderDesign() {
  design = normalizeDesign(design);
  const color = palettes[design.palette];
  const poster = $("poster");
  poster.style.setProperty("--paper", color.paper);
  poster.style.setProperty("--accent", color.accent);
  poster.style.setProperty("--padding", `${design.spacing}px`);
  poster.style.color = color.ink;
  poster.classList.toggle("split", design.layout === "split");
  $("spacing-value").value = design.spacing;
  $("token-summary").textContent =
    `padding: ${design.spacing}px · accent: ${color.accent}`;
  document
    .querySelectorAll("[data-palette]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        button.dataset.palette === design.palette,
      ),
    );
  $("copy-css").textContent = "Copy CSS ↗";
  saveContexts();
}
document.querySelectorAll("[data-palette]").forEach((button) =>
  button.addEventListener("click", () => {
    design.palette = button.dataset.palette;
    renderDesign();
  }),
);
$("layout").addEventListener("change", (event) => {
  design.layout = event.target.value;
  renderDesign();
});
$("spacing").addEventListener("input", (event) => {
  design.spacing = event.target.value;
  renderDesign();
});
$("copy-css").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(designCSS(design));
    $("copy-css").textContent = "CSS copied ✓";
    announce("CSS values copied to your clipboard.");
  } catch {
    $("copy-css").textContent = "Clipboard unavailable";
    announce(
      "Clipboard unavailable. The current padding and accent values are displayed beside this button.",
    );
  }
});
function renderPlan() {
  plan = estimatePlan($("seats").value, $("billing").value);
  $("unit-price").textContent = plan.billing === "annual" ? "$10" : "$12";
  $("billing-detail").textContent =
    `${plan.editors} editor${plan.editors === 1 ? "" : "s"} · billed ${plan.billing === "annual" ? "annually" : "monthly"}`;
  $("total-price").textContent =
    `$${plan.due.toLocaleString("en-US")} / ${plan.billing === "annual" ? "year" : "month"}`;
  saveContexts();
}
$("seats").addEventListener("input", renderPlan);
$("seats").addEventListener("change", () => {
  renderPlan();
  $("seats").value = plan.editors;
});
$("billing").addEventListener("change", renderPlan);

function setMode(on) {
  mode = on;
  $("comment-mode").setAttribute("aria-pressed", on);
  $("edit-mode").setAttribute("aria-pressed", !on);
  $("selection-bar").hidden = !on;
  $("design-controls").disabled = on;
  $("seats").disabled = on;
  $("billing").disabled = on;
  $("mode-hint").textContent = on
    ? "Pick a spot. Ask a question."
    : "Go on, change a few things.";
  document.querySelectorAll("[data-select]").forEach((button) => {
    button.hidden = !on;
  });
  if (!on) closeThread(false);
  announce(
    on
      ? "Comment mode on. Select the design, promise, or pricing target."
      : "Design mode on. You can edit the local specimen.",
  );
}
function enterMode() {
  setMode(true);
  $("canvas").scrollIntoView({ behavior: "smooth", block: "start" });
  document
    .querySelector('[data-select="design"]')
    .focus({ preventScroll: true });
}
document
  .querySelectorAll("[data-enter]")
  .forEach((button) => button.addEventListener("click", enterMode));
$("comment-mode").addEventListener("click", () => {
  setMode(true);
  document
    .querySelector('[data-select="design"]')
    .focus({ preventScroll: true });
});
$("edit-mode").addEventListener("click", () => setMode(false));
$("exit-mode").addEventListener("click", () => {
  setMode(false);
  $("comment-mode").focus({ preventScroll: true });
});

function getEntry(key) {
  if (!entries.has(key)) {
    const client = getClient({ site, scope: `framefield:${key}` });
    const entry = { client, release: null, rendered: null, pending: null };
    entries.set(key, entry);
    client.subscribe(() => {
      if (selected === key) renderThread();
    });
    entry.release = client.mount();
  }
  return entries.get(key);
}
function positionPin(key) {
  const pin = document.querySelector(`[data-pin="${key}"]`);
  const point = contexts[key]?.point;
  pin.hidden = !point;
  if (point) {
    pin.style.left = `${point.x * 100}%`;
    pin.style.top = `${point.y * 100}%`;
  }
}
function selectTarget(key, event) {
  if (!Object.hasOwn(targets, key)) return;
  setMode(true);
  if (!contexts[key]) {
    const rect = $(`target-${key}`).getBoundingClientRect();
    const point = clampPoint(
      event?.detail > 0 && event.currentTarget?.hasAttribute("data-select")
        ? {
            x: (event.clientX - rect.left) / rect.width,
            y: (event.clientY - rect.top) / rect.height,
          }
        : null,
    );
    contexts[key] = { point, context: targetContext(key, design, plan, point) };
  }
  returnFocus =
    event?.currentTarget || document.querySelector(`[data-pin="${key}"]`);
  selected = key;
  document
    .querySelectorAll(".target.active")
    .forEach((node) => node.classList.remove("active"));
  $(`target-${key}`).classList.add("active");
  document
    .querySelectorAll("[data-jump]")
    .forEach((button) =>
      button.setAttribute("aria-current", button.dataset.jump === key),
    );
  document.querySelectorAll(".thread-slot>div").forEach((node) => {
    node.hidden = false;
  });
  const slot = $(`slot-${key}`);
  Array.from(slot.children).forEach((node) => {
    if (node !== $("thread")) node.hidden = true;
  });
  slot.append($("thread"));
  $("thread").hidden = false;
  $("thread-title").textContent = targets[key].title;
  $("thread-number").textContent = targets[key].number;
  $("context-quote").textContent = `“${targets[key].quote}”`;
  $("context-text").textContent = contexts[key].context;
  $("thread-hint").textContent = targets[key].hint;
  $("messages").replaceChildren();
  positionPin(key);
  const entry = getEntry(key);
  entry.rendered = null;
  renderThread();
  saveContexts();
  $("thread-title").focus({ preventScroll: true });
  (matchMedia("(max-width:800px)").matches
    ? $("thread")
    : $(`target-${key}`)
  ).scrollIntoView({ behavior: "smooth", block: "nearest" });
}
document
  .querySelectorAll("[data-select],[data-pin],[data-jump]")
  .forEach((button) => {
    button.addEventListener("click", (event) =>
      selectTarget(
        button.dataset.select || button.dataset.pin || button.dataset.jump,
        event,
      ),
    );
  });
function closeThread(focus = true) {
  if (!selected) return;
  const key = selected;
  entries.get(key)?.client.typing(false);
  $("thread").hidden = true;
  $(`target-${key}`).classList.remove("active");
  document.querySelectorAll(".thread-slot>div").forEach((node) => {
    node.hidden = false;
  });
  document
    .querySelectorAll("[data-jump]")
    .forEach((button) => button.removeAttribute("aria-current"));
  selected = null;
  saveContexts();
  if (focus)
    (returnFocus && !returnFocus.hidden
      ? returnFocus
      : document.querySelector(`[data-pin="${key}"]`)
    ).focus({ preventScroll: true });
}
$("close-thread").addEventListener("click", () => closeThread());
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (selected) closeThread();
  else if (mode) {
    setMode(false);
    $("comment-mode").focus({ preventScroll: true });
  }
});

const errors = {
  connect:
    "We couldn’t reach Stand. Your question is still here. Check your connection and try again.",
  start:
    "Stand could not start this conversation. Check availability before trying again.",
  uncertain:
    "The first request may have reached Stand, but its response was lost. Starting again could create a second conversation. Your draft is kept; nothing will be resent automatically.",
  send: "Delivery isn’t confirmed. Retry this message with its original ID, or reconnect to check for confirmation.",
  lost: "This conversation ended before delivery was confirmed. Your unsent text is kept below.",
  gone: "This conversation is no longer accessible. You can start a new one after reviewing any unsent text.",
  paused: "Reconnection is paused. Retry the connection when you’re ready.",
  refresh:
    "We couldn’t refresh the conversation. Reconnecting to check for missing replies.",
  end: "Stand did not confirm the end request. Please try End conversation again.",
  email: "The follow-up request failed. Check the address and try again.",
  offer:
    "The email offer is no longer available. Check the conversation for a reply.",
};
const cards = {
  "session-start": "Conversation started with an AI Stand-in.",
  handoff: "A human representative joined this conversation.",
  "human-transfer": "The conversation moved to a human representative.",
  "standin-takeover": "An AI Stand-in is now answering.",
  "session-end": "Conversation ended.",
  "rep-followup-offer": "The team offered to follow up by email.",
  "rep-followup-confirmation": "Your follow-up request was received.",
};
function textNode(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function messageNode(message, client) {
  if (
    message.type === "system-prompt" ||
    message.senderType === "system-prompt"
  )
    return null;
  if (
    ["text", "standin-idle-prompt"].includes(message.type) &&
    ["visitor", "rep", "standin"].includes(message.senderType)
  ) {
    const node = textNode(
      "div",
      "",
      `message ${message.senderType === "visitor" ? "visitor" : ""}`,
    );
    node.append(
      textNode(
        "span",
        message.senderType === "visitor"
          ? "You"
          : message.senderType === "standin"
            ? "AI Stand-in"
            : "Human representative",
        "message-label",
      ),
      textNode("p", message.body),
    );
    return node;
  }
  const card = parseCard(message.body);
  if (message.type === "system-card" && Object.hasOwn(cards, card.cardType)) {
    return textNode(
      "p",
      `${cards[card.cardType]}${typeof card.message === "string" ? ` ${card.message}` : ""}`,
      "message system",
    );
  }
  if (message.type === "link-card") {
    const url = safeUrl(card.url);
    if (!url) return null;
    const node = textNode("div", "", "message");
    const link = textNode(
      "a",
      typeof card.title === "string" ? card.title : url,
    );
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.addEventListener("click", () =>
      client.trackLinkClick(message.messageId, url),
    );
    node.append(link);
    if (typeof card.description === "string")
      node.append(textNode("p", card.description));
    return node;
  }
  return null;
}
function renderThread() {
  if (!selected || !entries.has(selected)) return;
  const entry = entries.get(selected);
  const state = entry.client.getSnapshot();
  const canSend =
    ["available", "active"].includes(state.phase) &&
    !state.busy &&
    !state.pending;
  $("host-name").textContent = state.host.name || "Stand Chat";
  $("host-kind").textContent =
    state.host.kind === "standin"
      ? "AI Stand-in · live service"
      : state.host.kind === "rep"
        ? "Human representative"
        : "Identity provided by Stand";
  const statuses = {
    loading: "Checking availability…",
    available: "Ready when you are. No conversation started yet.",
    unavailable: state.error
      ? "Stand is unreachable right now."
      : "No responder is available right now. Your draft is kept.",
    active:
      state.connection === "online"
        ? "Connected · replies arrive here"
        : "Reconnecting · keeping your conversation",
    ended: "This conversation has ended.",
    uncertain: "Start not confirmed. Please review before trying again.",
  };
  $("thread-status").textContent =
    statuses[state.phase] || "Checking conversation";
  $("connection-dot").classList.toggle(
    "online",
    state.phase === "available" || state.connection === "online",
  );
  $("thread-hint").hidden = state.messages.length > 0;
  const renderedKey = JSON.stringify([
    state.messages,
    state.pending,
    state.busy,
  ]);
  if (entry.rendered !== renderedKey) {
    const scroller = document.querySelector(".thread-content");
    const atBottom =
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 70;
    $("messages").replaceChildren();
    state.messages.forEach((message) => {
      const node = messageNode(message, entry.client);
      if (node) $("messages").append(node);
    });
    if (state.pending) {
      const node = textNode("div", "", "message visitor");
      node.append(
        textNode(
          "span",
          state.busy ? "You · sending…" : "You · delivery not confirmed",
          "message-label",
        ),
        textNode("p", state.pending.body),
      );
      $("messages").append(node);
    }
    entry.rendered = renderedKey;
    if (
      atBottom &&
      state.messages.length &&
      !matchMedia("(max-width:800px)").matches
    )
      requestAnimationFrame(() => {
        scroller.scrollTop = scroller.scrollHeight;
      });
  }
  $("activity").hidden = !state.activity;
  $("activity").textContent = state.activity
    ? state.activity.preview
      ? `AI draft · ${state.activity.preview}`
      : state.activity.kind === "thinking"
        ? "AI Stand-in is thinking…"
        : "A human representative is typing…"
    : "";
  $("error").hidden = !state.error;
  $("error").textContent =
    errors[state.error] ||
    (state.error ? "Something went wrong. Your conversation is kept." : "");
  $("notice").hidden = !state.notice;
  $("notice").textContent = state.notice;
  $("refresh-context").hidden =
    state.phase !== "available" || state.messages.length > 0 || state.busy;
  $("question").value = state.draft;
  $("question").disabled = state.busy || Boolean(state.pending);
  $("send").disabled = !canSend || !state.draft.trim();
  $("send").textContent = state.busy
    ? "Sending…"
    : state.phase === "active"
      ? "Send reply ↗"
      : "Start conversation ↗";
  $("send-note").textContent =
    state.phase === "active"
      ? "Your reply goes to this live Stand conversation. The attached context stays unchanged."
      : `Sends your question and attached context to ${state.host.kind === "rep" ? "the available human representative" : "Stand’s demo AI"}. Nothing is sent until you choose to start.`;
  $("email-form").hidden = !state.followupOffered || state.phase !== "active";
  $("email").disabled = state.busy;
  $("email-form").querySelector("button").disabled = state.busy;
  $("retry").hidden =
    state.busy ||
    Boolean(state.pending) ||
    !(
      state.phase === "unavailable" ||
      (state.phase === "active" &&
        (state.error || state.connection !== "online"))
    );
  $("retry-message").hidden =
    state.busy || !state.pending || state.phase !== "active";
  $("new-chat").hidden = !["ended", "uncertain"].includes(state.phase);
  $("new-chat").disabled = state.busy;
  $("new-chat").textContent =
    state.phase === "uncertain"
      ? "Start over (may create a second chat)"
      : "New conversation";
  $("end-chat").hidden = state.phase !== "active";
  $("end-chat").disabled = state.busy;
  $("attribution").href = safeUrl(state.poweredByUrl) || "https://stand.chat";
}
$("question").addEventListener("input", () => {
  const client = entries.get(selected)?.client;
  client?.setDraft($("question").value);
  client?.typing(Boolean($("question").value.trim()));
});
$("question").addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    !$("send").disabled
  ) {
    event.preventDefault();
    $("message-form").requestSubmit();
  }
});
$("message-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selected || $("send").disabled) return;
  const key = selected;
  const client = entries.get(key).client;
  const question = client.getSnapshot().draft.trim();
  if (!question) return;
  client.setDraft("");
  await client.send(question, {
    owner: key,
    prompt: conversationPrompt(contexts[key].context),
    analyticsId: `framefield-${key}`,
  });
});
$("retry").addEventListener("click", () =>
  entries.get(selected)?.client.retry(),
);
$("refresh-context").addEventListener("click", () => {
  contexts[selected].context = targetContext(
    selected,
    design,
    plan,
    contexts[selected].point,
  );
  $("context-text").textContent = contexts[selected].context;
  saveContexts();
  announce("Attached context updated to the current page settings.");
});
$("retry-message").addEventListener("click", () =>
  entries.get(selected)?.client.send(),
);
$("end-chat").addEventListener("click", () =>
  entries.get(selected)?.client.end(),
);
$("new-chat").addEventListener("click", () => {
  const key = selected;
  contexts[key].context = targetContext(key, design, plan, contexts[key].point);
  $("context-text").textContent = contexts[key].context;
  $("email").value = "";
  saveContexts();
  entries.get(key).client.newChat();
});
$("email-form").addEventListener("submit", (event) => {
  event.preventDefault();
  entries.get(selected)?.client.submitEmail($("email").value);
});
$("attribution").addEventListener("click", () =>
  entries.get(selected)?.client.trackAttributionClick(),
);
addEventListener("pagehide", () => {
  entries.forEach((entry) => entry.release?.());
});
addEventListener("pageshow", (event) => {
  if (event.persisted)
    entries.forEach((entry) => {
      entry.release = entry.client.mount();
    });
});
renderDesign();
renderPlan();
Object.keys(targets).forEach(positionPin);
if (Object.hasOwn(targets, saved.open) && contexts[saved.open])
  selectTarget(saved.open);
