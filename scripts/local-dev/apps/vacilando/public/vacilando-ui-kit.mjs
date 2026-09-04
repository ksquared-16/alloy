/**
 * Vacilando UI V2 — the component kit.
 *
 * Every V2 surface is built from the primitives in this file. That is the whole
 * point of it existing: before this, Home did not exist and the lane view grew
 * its own one-off markup for each new fact, so the product had as many visual
 * systems as it had screens.
 *
 * TWO RULES HOLD THIS TOGETHER.
 *
 *   1. A component renders a FIELD, never a number. Fields come from
 *      vacilando-ui-model.mjs already carrying their own provenance, so a
 *      component physically cannot invent a value or decide that an absent one
 *      should look real. `metric()` draws whatever `state` it is handed.
 *
 *   2. State has ONE vocabulary. `healthDot()` and `stateDot()` are the only
 *      things in the product that turn a condition into a colour. A surface
 *      that wants to say "this is fine" uses them; it does not pick a green.
 *
 * These functions are pure string builders with no DOM access, so they are unit
 * testable in node and are covered by tests/development-gateway-ui-v2.test.mjs.
 */

import {
  ACTIVITY_KINDS,
  MESSAGE_PREVIEW_LINES,
  MESSAGE_ROLE,
  messageNeedsPreview,
  operatorStatusLine,
  DATA_STATE,
  HEALTH,
  HEALTH_LABEL,
  MATURITY,
  USAGE_WINDOWS,
  relativeAge,
} from "./vacilando-ui-model.mjs";

/* ---------------------------------------------------------------------------
 * Escaping and time. Defined here because the kit is the lowest layer; the lane
 * view imports them from this module and re-exports them, so there is still one
 * definition of each in the product.
 * ------------------------------------------------------------------------- */

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function ago(ms, nowMs = Date.now()) {
  if (!ms) return null;
  return relativeAge(nowMs - Number(ms));
}

/* ---------------------------------------------------------------------------
 * NAVIGATION
 *
 * Four destinations. They are declared once and consumed by both the desktop
 * rail and the mobile bar, because the alternative — two lists — is how the two
 * form factors stop being the same product.
 * ------------------------------------------------------------------------- */

export const PRIMARY_NAV = Object.freeze([
  { key: "home", label: "Home", hash: "#/home", icon: "nav-home" },
  { key: "lanes", label: "Lanes", hash: "#/lanes", icon: "nav-lanes" },
  { key: "activity", label: "Activity", hash: "#/activity", icon: "nav-activity" },
  { key: "system", label: "System", hash: "#/system", icon: "nav-system" },
]);

/**
 * Desktop: a persistent left navigation.
 *
 * `needsYou` is the ONLY count carried in navigation. Context percentage, git
 * ahead/behind, slot numbers and provider internals were all considered and are
 * all deliberately absent: navigation answers "where do I go", and only a
 * genuine human blocker changes that answer.
 */
export function renderPrimaryNav(active, { needsYou = 0 } = {}) {
  const items = PRIMARY_NAV.map((n) => {
    const on = n.key === active;
    const badge = n.key === "home" && needsYou > 0
      ? `<span class="vnav-badge" aria-label="${needsYou} needing you">${needsYou}</span>`
      : "";
    return `<a class="vnav-item${on ? " is-active" : ""}" href="${n.hash}" data-vnav="${n.key}"${on ? ' aria-current="page"' : ""}>
      <svg class="vnav-ico" aria-hidden="true"><use href="#${n.icon}"></use></svg>
      <span class="vnav-label">${esc(n.label)}</span>
      ${badge}
    </a>`;
  }).join("");
  return `<nav class="vnav" aria-label="Primary">${items}</nav>`;
}

/**
 * Mobile: a bottom bar with the same four destinations.
 *
 * Deliberately NOT the desktop sidebar squeezed narrow. The rail carries the
 * lane list, section headings and account chrome, none of which belongs in a
 * thumb-reachable bar; what belongs there is the four places you go, at a tap
 * size you can actually hit while holding the phone.
 */
export function renderMobileNav(active, { needsYou = 0 } = {}) {
  const items = PRIMARY_NAV.map((n) => {
    const on = n.key === active;
    const badge = n.key === "home" && needsYou > 0
      ? `<span class="vtab-badge">${needsYou}</span>`
      : "";
    return `<a class="vtab${on ? " is-active" : ""}" href="${n.hash}" data-vnav="${n.key}"${on ? ' aria-current="page"' : ""}>
      <span class="vtab-ico-wrap"><svg class="vtab-ico" aria-hidden="true"><use href="#${n.icon}"></use></svg>${badge}</span>
      <span class="vtab-label">${esc(n.label)}</span>
    </a>`;
  }).join("");
  return `<nav class="vtabs" aria-label="Primary" data-v-mobile-nav>${items}</nav>`;
}

/* ---------------------------------------------------------------------------
 * SURFACES
 * ------------------------------------------------------------------------- */

/** The one card in the product. White, quiet border, soft elevation, one radius. */
export function surface({ title = null, hint = null, actions = "", body = "", className = "", tone = null, id = null } = {}) {
  const head = title || actions || hint
    ? `<div class="vcard-head">
        <div class="vcard-headings">
          ${title ? `<h2 class="vcard-title">${esc(title)}</h2>` : ""}
          ${hint ? `<p class="vcard-hint">${esc(hint)}</p>` : ""}
        </div>
        ${actions ? `<div class="vcard-actions">${actions}</div>` : ""}
      </div>`
    : "";
  return `<section class="vcard${tone ? ` is-${tone}` : ""}${className ? ` ${className}` : ""}"${id ? ` id="${esc(id)}"` : ""}>
    ${head}
    <div class="vcard-body">${body}</div>
  </section>`;
}

export function pageHeader({ title, lead = null, breadcrumb = null, actions = "" } = {}) {
  const crumbs = Array.isArray(breadcrumb) && breadcrumb.length
    ? `<nav class="vcrumb" aria-label="Breadcrumb">${breadcrumb.map((c, i) => (
      c.href && i < breadcrumb.length - 1
        ? `<a href="${esc(c.href)}">${esc(c.label)}</a>`
        : `<span aria-current="page">${esc(c.label)}</span>`
    )).join('<span class="vcrumb-sep" aria-hidden="true">/</span>')}</nav>`
    : "";
  return `<header class="vpage-head">
    ${crumbs}
    <div class="vpage-head-row">
      <div>
        <h1 class="vpage-title">${esc(title)}</h1>
        ${lead ? `<p class="vpage-lead">${esc(lead)}</p>` : ""}
      </div>
      ${actions ? `<div class="vpage-actions">${actions}</div>` : ""}
    </div>
  </header>`;
}

export function emptyState({ title, body = null, action = "" } = {}) {
  return `<div class="vempty">
    <p class="vempty-title">${esc(title)}</p>
    ${body ? `<p class="vempty-body">${esc(body)}</p>` : ""}
    ${action}
  </div>`;
}

/* ---------------------------------------------------------------------------
 * STATE
 * ------------------------------------------------------------------------- */

/**
 * The single place a health condition becomes a colour.
 *
 * healthy → pine, watch → desert, problem → red, unknown → quiet grey. Red is
 * reserved: it means something is broken or destructive, never "busy" and never
 * "high number".
 */
export function healthDot(health, label = null) {
  const h = [HEALTH.HEALTHY, HEALTH.WATCH, HEALTH.PROBLEM].includes(health) ? health : HEALTH.UNKNOWN;
  const text = label || HEALTH_LABEL[h];
  return `<span class="vhealth is-${h}"><span class="vhealth-dot" aria-hidden="true"></span>${esc(text)}</span>`;
}

/** A lane's canonical work state, as one dot and one word. */
export function stateDot(state, { tone = "", live = false } = {}) {
  return `<span class="vstate${tone ? ` is-${tone}` : ""}${live ? " is-live" : ""}">
    <span class="vstate-dot" aria-hidden="true"></span>${esc(state)}</span>`;
}

/* ---------------------------------------------------------------------------
 * METRIC — the component that renders a field's provenance for you.
 * ------------------------------------------------------------------------- */

/**
 * `f` is a field from vacilando-ui-model.field(). Its `state` decides the
 * treatment:
 *
 *   live        → the value, in full ink
 *   placeholder → the value, visibly marked as a development sample
 *   unavailable → the contract's own copy, in muted ink, never a number
 *
 * There is no way to pass a bare number in, which is the guard: a component
 * cannot accidentally print an invented figure because it never receives one.
 */
export function metric(f, { label = null, health = null, size = "md", sub = null } = {}) {
  if (!f) return "";
  const name = label || f.label || "";
  const state = f.state || DATA_STATE.UNAVAILABLE;
  const tip = f.note && state !== DATA_STATE.LIVE ? ` title="${esc(f.note)}"` : "";
  return `<div class="vmetric is-${size} is-${state}"${tip} data-maturity="${esc(f.maturity || "")}">
    ${name ? `<span class="vmetric-label">${esc(name)}</span>` : ""}
    <span class="vmetric-value">${esc(f.display)}</span>
    ${state === DATA_STATE.PLACEHOLDER ? '<span class="vmetric-flag" title="Development sample — not runtime truth">sample</span>' : ""}
    ${health ? `<span class="vmetric-health">${healthDot(health)}</span>` : ""}
    ${sub ? `<span class="vmetric-sub">${esc(sub)}</span>` : ""}
  </div>`;
}

/** A metric laid out as a labelled row, for dense inspector/detail lists. */
export function metricRow(f, { label = null } = {}) {
  if (!f) return "";
  const name = label || f.label || "";
  const state = f.state || DATA_STATE.UNAVAILABLE;
  const tip = f.note && state !== DATA_STATE.LIVE ? ` title="${esc(f.note)}"` : "";
  return `<div class="vrow is-${state}"${tip} data-maturity="${esc(f.maturity || "")}">
    <span class="vrow-label">${esc(name)}</span>
    <span class="vrow-value">${esc(f.display)}${state === DATA_STATE.PLACEHOLDER ? '<span class="vmetric-flag">sample</span>' : ""}</span>
  </div>`;
}

/** A utilisation bar. Used for CPU/memory/slots — never for provider progress,
 *  which has its own component because it means something different. */
export function meter(f, { health = null, label = null, max = 100 } = {}) {
  if (!f) return "";
  const pct = typeof f.value === "number" ? Math.max(0, Math.min(100, (f.value / max) * 100)) : null;
  const h = health || HEALTH.UNKNOWN;
  return `<div class="vmeter is-${f.state}">
    <div class="vmeter-head">
      <span class="vmeter-label">${esc(label || f.label || "")}</span>
      <span class="vmeter-value">${esc(f.display)}</span>
    </div>
    <div class="vmeter-track" role="img" aria-label="${esc(`${label || f.label || ""} ${f.display}`)}">
      ${pct == null ? "" : `<div class="vmeter-fill is-${h}" style="width:${pct.toFixed(1)}%"></div>`}
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------------
 * PROGRESS — the visible half of the provider progress contract.
 * ------------------------------------------------------------------------- */

/**
 * `p` comes from vacilando-ui-model.laneProgress().
 *
 * When there is no fresh estimate this renders the words "Progress estimate
 * unavailable" and NO BAR. A zero-width bar reads as "0% done", which is a
 * claim; an absent bar reads as "nobody said", which is the truth.
 *
 * There is no ETA here and there must never be one derived from `percent`.
 */
export function progress(p, { compact = false } = {}) {
  if (!p) return "";
  if (!p.available) {
    return `<div class="vprogress is-unavailable${compact ? " is-compact" : ""}" data-v-progress="unavailable">
      <span class="vprogress-label">${esc(p.label)}</span>
      ${p.updated_label ? `<span class="vprogress-meta">${esc(p.updated_label)}</span>` : ""}
      ${p.summary && !compact ? `<span class="vprogress-summary">${esc(p.summary)}</span>` : ""}
    </div>`;
  }
  const pct = Math.max(0, Math.min(100, Number(p.percent) || 0));
  return `<div class="vprogress${compact ? " is-compact" : ""}" data-v-progress="${pct}" data-confidence="${esc(p.confidence || "")}">
    <div class="vprogress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
      aria-label="${esc(p.label)}">
      <div class="vprogress-fill is-${esc(p.confidence || "low")}" style="width:${pct}%"></div>
    </div>
    <div class="vprogress-meta-row">
      <span class="vprogress-label">${esc(p.label)}</span>
      ${p.updated_label ? `<span class="vprogress-meta">${esc(p.updated_label)}</span>` : ""}
    </div>
    ${p.summary && !compact ? `<p class="vprogress-summary">${esc(p.summary)}</p>` : ""}
  </div>`;
}

/* ---------------------------------------------------------------------------
 * NEEDS YOU
 * ------------------------------------------------------------------------- */

/**
 * The lane tray. This is an ACTION STATE, not a content section.
 *
 * It is rendered immediately above the composer — at the boundary where the
 * human already is — rather than as a card inserted into the middle of the work
 * narrative. Three pending requests collapse to ONE tray with a count, because
 * three stacked alert cards is how a lane stops being readable.
 */
export function needsYouTray(items = [], { laneId = null } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return "";

  // ONE LINE. An interruption tray, not a proposal viewer.
  //
  // The tray previously carried the request plus two actions and wrapped to
  // ~138px on a phone; the full governed proposal then rendered separately in
  // the lane flow at 591px. Between them they pushed the composer off the
  // screen at exactly the moment a decision was waiting. The tray now states
  // WHAT is waiting and offers ONE way in; Review opens the detailed governed
  // surface, which is where a proposal belongs.
  const label = list.length > 1
    ? `${list.length} requests`
    : String(list[0].request || "A decision is waiting");
  return `<div class="vneeds vneeds-tray" data-v-needs="${list.length}" role="region" aria-label="Needs you">
    <span class="vneeds-mark" aria-hidden="true">!</span>
    <span class="vneeds-title">Needs you</span>
    <span class="vneeds-request">${esc(label)}</span>
    <button type="button" class="btn sm vneeds-review" data-v-needs-review
      data-lane-id="${esc(laneId || list[0].lane_id || "")}">Review</button>
  </div>`;
}

/** The Home summary of every genuine blocker across every lane. */
export function needsYouList(model, { nowMs = Date.now() } = {}) {
  const items = model?.items || [];
  if (!items.length) {
    return emptyState({
      title: "Nothing needs you",
      body: "Work that is running, queued or finished is on the lane list. This is only for decisions that cannot proceed without you.",
    });
  }
  // A SUMMARY, NOT A PAYLOAD. Home is a scan surface: lane, one line of what is
  // being asked, how long it has waited, and a way in. The reason, the
  // escalation and the proposal are what Review opens — printing them here made
  // four pending decisions consume most of a phone's first screen.
  return `<ul class="vneeds-list">${items.map((it) => `
    <li class="vneeds-row is-${esc(it.severity)}">
      <span class="vneeds-row-mark" aria-hidden="true"></span>
      <div class="vneeds-row-copy">
        <span class="vneeds-row-lane">${esc(it.lane_label)}</span>
        <span class="vneeds-row-request">${esc(it.request)}</span>
      </div>
      <span class="vneeds-row-age">${esc(it.at_ms ? `${ago(it.at_ms, nowMs)} ago` : "")}</span>
      <a class="btn sm" href="${esc(it.href)}">Review</a>
    </li>`).join("")}</ul>`;
}

/* ---------------------------------------------------------------------------
 * LANE ROWS AND ACTIVITY ROWS
 * ------------------------------------------------------------------------- */

/**
 * A lane row says four things: what it is, what it is doing, whether it needs
 * you, and when it last moved. Everything else — context %, branch, slot, git
 * counters — lives inside the lane or in System, because none of it changes
 * which lane you open.
 */
export function laneRowV2(l, { nowMs = Date.now(), active = false, showProgress = false } = {}) {
  const when = l.at_ms ? `${ago(l.at_ms, nowMs)}` : "";
  const badge = l.blockers > 0 ? `<span class="vlane-badge" title="Needs you">${l.blockers}</span>` : "";
  const bar = showProgress && l.progress?.available
    ? `<span class="vlane-progress"><span class="vlane-progress-fill" style="width:${l.progress.percent}%"></span></span>`
    : "";
  return `<a class="vlane${active ? " is-active" : ""}" href="${esc(l.href)}" data-gw-lane="${esc(l.lane_id)}" data-v-lane="${esc(l.lane_id)}">
    <span class="vlane-name">${esc(l.label)}</span>
    <span class="vlane-state">${stateDot(l.state, { tone: l.tone, live: l.live })}</span>
    ${bar}
    <span class="vlane-when">${esc(when)}</span>
    ${badge}
  </a>`;
}

export function activityRow(r, { nowMs = Date.now() } = {}) {
  const when = r.at_ms ? `${ago(r.at_ms, nowMs)} ago` : "";
  return `<li class="vact is-${esc(r.outcome || "ok")}" data-v-activity-kind="${esc(r.kind)}">
    <span class="vact-kind" data-kind="${esc(r.kind)}">${esc(kindLabel(r.kind))}</span>
    <span class="vact-lane">${esc(r.lane_label)}</span>
    <span class="vact-summary">${esc(r.summary)}</span>
    <span class="vact-when">${esc(when)}</span>
  </li>`;
}

function kindLabel(key) {
  return ACTIVITY_KINDS.find((k) => k.key === key)?.label || "System";
}

/* ---------------------------------------------------------------------------
 * PLACEHOLDER BANNER
 *
 * While placeholder mode is on, the app SAYS SO, on every screen, permanently.
 * A screenshot of this product in placeholder mode can therefore never be
 * mistaken for a screenshot of runtime truth.
 * ------------------------------------------------------------------------- */

export function placeholderBanner(on) {
  if (!on) return "";
  return `<div class="vplaceholder-banner" role="status">
    <strong>Design preview</strong> — values marked <span class="vmetric-flag">sample</span> are
    development placeholders, not runtime truth.
    <button type="button" class="vplaceholder-off" data-v-placeholders-off>Turn off</button>
  </div>`;
}

/* ---------------------------------------------------------------------------
 * HOME
 * ------------------------------------------------------------------------- */

export function renderHome(vm, { nowMs = Date.now() } = {}) {
  if (!vm) return `<div class="vpage" data-v-page="home">${emptyState({ title: "Loading…" })}</div>`;
  const h = vm.health;

  const needs = surface({
    title: "Needs you",
    hint: vm.needsYou.count
      ? "Decisions that cannot proceed without you."
      : null,
    className: `vcard-needs${vm.needsYou.count ? " has-items" : ""}`,
    tone: vm.needsYou.count ? "attention" : null,
    body: needsYouList(vm.needsYou, { nowMs }),
  });

  const health = surface({
    title: "System health",
    actions: `<a class="vlink" href="#/system">System →</a>`,
    className: "vcard-health",
    body: `
      <div class="vhealth-summary">
        ${healthDot(h.overall, h.overall_label)}
        <span class="vhealth-host">${esc(h.host_name.display)}</span>
        ${h.warning ? `<span class="vhealth-warning">${esc(h.warning)}</span>` : ""}
      </div>
      <div class="vmeters">
        ${meter(h.cpu, { health: h.cpu_health, label: "CPU load" })}
        ${meter(h.memory, { health: h.memory_health, label: "Memory" })}
      </div>
      <div class="vgrid vgrid-4">
        ${metric(h.swap, { size: "sm", label: "Swap" })}
        ${metric(h.swap_trend, { size: "sm", label: "Swap trajectory" })}
        ${metric(h.disk_free, { size: "sm", label: "Disk free" })}
        ${metric(h.memory_pressure, { size: "sm", label: "Pressure" })}
      </div>
      <div class="vgrid vgrid-4">
        ${metric(h.slots_active, { size: "sm", label: "Active slots" })}
        ${metric(h.slots_total, { size: "sm", label: "Slot capacity" })}
        ${metric(h.gateway, { size: "sm", label: "Gateway", health: h.gateway_health })}
        ${metric(h.dev_servers, { size: "sm", label: "Dev servers" })}
      </div>`,
  });

  const lanes = surface({
    title: "Lanes",
    actions: `<a class="vlink" href="#/lanes">All lanes →</a>`,
    className: "vcard-lanes",
    body: vm.lanes.length
      ? `<div class="vlane-list">${vm.lanes.map((l) => laneRowV2(l, { nowMs, showProgress: true })).join("")}</div>`
      : emptyState({ title: "No lanes yet", body: "Create a lane to start work." }),
  });

  const usage = surface({
    title: "AI usage",
    actions: usageWindows(vm.usage),
    className: "vcard-usage",
    body: `
      <div class="vgrid vgrid-4">
        ${metric(vm.usage.runs, { size: "sm", label: "Runs" })}
        ${metric(vm.usage.input_tokens, { size: "sm", label: "Input" })}
        ${metric(vm.usage.output_tokens, { size: "sm", label: "Output" })}
        ${metric(vm.usage.cache_tokens, { size: "sm", label: "Cache" })}
      </div>
      <div class="vgrid vgrid-4">
        ${metric(vm.usage.total_tokens, { size: "sm", label: "Total tokens" })}
        ${metric(vm.usage.cost, { size: "sm", label: "Estimated cost" })}
        ${metric(vm.usage.runtime, { size: "sm", label: "Runtime" })}
        ${metric(vm.usage.context, { size: "sm", label: "Context" })}
      </div>
      ${vm.usage.providers.length
        ? `<div class="vprov-rows">${vm.usage.providers.map((p) => `
            <div class="vprov-row">
              <span class="vprov-name">${esc(p.provider)}</span>
              <span class="vprov-model">${esc(p.model.display)}</span>
              <span class="vprov-runs">${esc(p.runs.display)} runs</span>
              <span class="vprov-cost">${esc(p.cost.display)}</span>
            </div>`).join("")}</div>`
        : ""}
      ${vm.usage.window_supported ? "" : `<p class="vnote">Historical windows are not aggregated yet — showing today.</p>`}`,
  });

  const effectiveness = surface({
    title: "AI effectiveness",
    hint: "Is the provider actually helping accomplish work?",
    className: "vcard-effect",
    body: `
      <div class="vgrid vgrid-4">
        ${metric(vm.effectiveness.runs_completed, { size: "sm", label: "Runs completed" })}
        ${metric(vm.effectiveness.autonomous_pct, { size: "sm", label: "Autonomous" })}
        ${metric(vm.effectiveness.interventions, { size: "sm", label: "Interventions" })}
        ${metric(vm.effectiveness.approval_interruptions, { size: "sm", label: "Approvals" })}
      </div>
      <div class="vgrid vgrid-4">
        ${metric(vm.effectiveness.rework_rate, { size: "sm", label: "Rework" })}
        ${metric(vm.effectiveness.avg_runtime, { size: "sm", label: "Avg runtime" })}
        ${metric(vm.effectiveness.commits, { size: "sm", label: "Commits" })}
        ${metric(vm.effectiveness.tests, { size: "sm", label: "Tests passed" })}
      </div>`,
  });

  const activity = surface({
    title: "Recent activity",
    actions: `<a class="vlink" href="#/activity">View all →</a>`,
    className: "vcard-activity",
    body: vm.activity.length
      ? `<ul class="vact-list">${vm.activity.map((r) => activityRow(r, { nowMs })).join("")}</ul>`
      : emptyState({ title: "No activity recorded yet", body: "Run events, commits and governed decisions appear here as they happen." }),
  });

  // ONE PAGE IDENTITY. The app chrome already names the destination; a second
  // "Home" directly beneath it is the same word twice and costs a phone header's
  // worth of the first screen. The lead survives — it says what the page is for,
  // which the chrome does not.
  return `<div class="vpage vpage-home" data-v-page="home">
    ${pageHeader({ title: "Home", lead: "What is running, what needs you, and whether the machine is healthy." })}
    <div class="vhome-grid">
      <div class="vhome-col vhome-col-main">${needs}${lanes}${activity}</div>
      <div class="vhome-col vhome-col-side">${health}${usage}${effectiveness}</div>
    </div>
  </div>`;
}

function usageWindows(usage) {
  const cur = usage?.window || "today";
  return `<div class="vseg" role="group" aria-label="Time window">${USAGE_WINDOWS.map((w) => `
    <button type="button" class="vseg-opt${w.key === cur ? " is-on" : ""}" data-v-usage-window="${w.key}"
      aria-pressed="${w.key === cur ? "true" : "false"}">${esc(w.label)}</button>`).join("")}</div>`;
}

/* ---------------------------------------------------------------------------
 * ACTIVITY
 * ------------------------------------------------------------------------- */

export function renderActivity(vm, { nowMs = Date.now() } = {}) {
  if (!vm) return `<div class="vpage" data-v-page="activity">${emptyState({ title: "Loading…" })}</div>`;
  const f = vm.filters;
  const kindOpts = [{ key: "all", label: "All" }, ...vm.kinds];
  return `<div class="vpage vpage-activity" data-v-page="activity">
    ${pageHeader({ title: "Activity", lead: "Everything that has happened. Nothing here is waiting on you." })}
    <div class="vfilters" role="group" aria-label="Filters">
      <label class="vfilter">
        <span class="vfilter-label">Lane</span>
        <select data-v-filter="lane">
          <option value="">All lanes</option>
          ${vm.lanes.map((l) => `<option value="${esc(l.lane_id)}"${f.lane === l.lane_id ? " selected" : ""}>${esc(l.label)}</option>`).join("")}
        </select>
      </label>
      <label class="vfilter">
        <span class="vfilter-label">Type</span>
        <select data-v-filter="kind">
          ${kindOpts.map((k) => `<option value="${esc(k.key)}"${f.kind === k.key ? " selected" : ""}>${esc(k.label)}</option>`).join("")}
        </select>
      </label>
      <label class="vfilter">
        <span class="vfilter-label">Outcome</span>
        <select data-v-filter="outcome">
          ${vm.outcomes.map((o) => `<option value="${esc(o.key)}"${f.outcome === o.key ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
        </select>
      </label>
      <span class="vfilter-count">${vm.rows.length} of ${vm.total}</span>
    </div>
    ${surface({
      className: "vcard-activity-full",
      body: vm.rows.length
        ? `<ul class="vact-list">${vm.rows.map((r) => activityRow(r, { nowMs })).join("")}</ul>`
        : emptyState({
          title: vm.total ? "Nothing matches these filters" : "No activity recorded yet",
          body: vm.total ? "Widen the filters to see more." : "Run transitions, commits, governed decisions and browser sessions appear here.",
        }),
    })}
  </div>`;
}

/* ---------------------------------------------------------------------------
 * SYSTEM
 * ------------------------------------------------------------------------- */

export function renderSystem(vm) {
  if (!vm) return `<div class="vpage" data-v-page="system">${emptyState({ title: "Loading…" })}</div>`;
  const h = vm.health;
  const host = surface({
    title: "Host",
    actions: healthDot(h.overall, h.overall_label),
    body: `
      <div class="vmeters">
        ${meter(vm.host.cpu, { health: h.cpu_health, label: "CPU load" })}
        ${meter(vm.host.memory, { health: h.memory_health, label: "Memory" })}
      </div>
      <div class="vrows">
        ${metricRow(vm.host.name, { label: "Machine" })}
        ${metricRow(vm.host.cpu_count, { label: "Cores" })}
        ${metricRow(vm.host.load_1m, { label: "Load (1m)" })}
        ${metricRow(vm.host.load_5m, { label: "Load (5m)" })}
        ${metricRow(vm.host.memory_used, { label: "Memory used" })}
        ${metricRow(vm.host.memory_total, { label: "Memory total" })}
        ${metricRow(vm.host.memory_pressure, { label: "Memory pressure" })}
        ${metricRow(vm.host.swap, { label: "Swap in use" })}
        ${metricRow(vm.host.swap_total, { label: "Swap allocated" })}
        ${metricRow(vm.host.swap_trend, { label: "Swap trajectory" })}
        ${metricRow(vm.host.disk_free, { label: "Disk free" })}
      </div>`,
  });

  const capacity = surface({
    title: "Capacity",
    body: `
      <div class="vgrid vgrid-4">
        ${metric(vm.capacity.total, { size: "sm", label: "Slots" })}
        ${metric(vm.capacity.active, { size: "sm", label: "Active" })}
        ${metric(vm.capacity.reserved, { size: "sm", label: "Reserved" })}
        ${metric(vm.capacity.available, { size: "sm", label: "Available" })}
      </div>
      <div class="vrows">${metricRow(vm.capacity.pressure, { label: "Admission pressure" })}</div>
      ${vm.capacity.holders.length
        ? `<div class="vrows">${vm.capacity.holders.map((x) => `
          <div class="vrow"><span class="vrow-label">${esc(x.label || x.lane_id || "Holder")}</span><span class="vrow-value">${esc(x.state || x.kind || "")}</span></div>`).join("")}</div>`
        : ""}`,
  });

  const runtime = surface({
    title: "Runtime",
    body: `<div class="vrows">
      ${metricRow(vm.runtime.gateway, { label: "Gateway" })}
      ${metricRow(vm.runtime.dev_servers, { label: "Development servers" })}
      ${metricRow(vm.runtime.stale_processes, { label: "Stale processes" })}
      ${metricRow(vm.runtime.failed_processes, { label: "Failed processes" })}
    </div>`,
  });

  const providers = surface({
    title: "Providers",
    body: `
      ${vm.providers.rows.length
        ? `<div class="vrows">${vm.providers.rows.map((p) => `
            <div class="vrow">
              <span class="vrow-label">${esc(p.provider || p.name || "Provider")}</span>
              <span class="vrow-value">${esc(p.available === false ? "Unavailable" : (p.auth_state || p.state || "Available"))}</span>
            </div>`).join("")}</div>`
        : emptyState({ title: "No provider reported", body: "Provider availability is reported by the runtime diagnostics probe." })}
      <div class="vgrid vgrid-4">
        ${metric(vm.providers.usage.runs, { size: "sm", label: "Runs" })}
        ${metric(vm.providers.usage.retries, { size: "sm", label: "Errors" })}
        ${metric(vm.providers.usage.total_tokens, { size: "sm", label: "Tokens" })}
        ${metric(vm.providers.usage.context, { size: "sm", label: "Context" })}
      </div>`,
  });

  const environment = surface({
    title: "Environment",
    body: `<div class="vrows">
      ${metricRow(vm.environment.runtime_root, { label: "Runtime root" })}
      ${metricRow(vm.environment.gateway_port, { label: "Gateway port" })}
    </div>
    ${vm.environment.workers.length
      ? `<div class="vrows">${vm.environment.workers.map((w) => `
        <div class="vrow"><span class="vrow-label">Slot ${esc(w.slot ?? "—")}</span>
        <span class="vrow-value">${esc(w.server || "unknown")}${w.port ? ` · :${esc(w.port)}` : ""}</span></div>`).join("")}</div>`
      : ""}`,
  });

  const history = surface({
    title: "Health history",
    body: vm.history.available
      ? `<ul class="vact-list">${vm.history.samples.slice(0, 12).map((s) => `
          <li class="vact"><span class="vact-kind" data-kind="system">System</span>
          <span class="vact-lane">Host</span>
          <span class="vact-summary">${esc(describeSample(s))}</span>
          <span class="vact-when">${esc(s.at ? new Date(s.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "")}</span></li>`).join("")}</ul>`
      : emptyState({
        title: "No health history yet",
        body: "Host samples are recorded by the platform resources snapshot. Nothing has been retained for this window.",
      }),
  });

  // TWO COLUMNS OF STACKED CARDS, NOT A GRID OF CELLS.
  //
  // A two-track grid sizes every row to its tallest cell, so Host (eleven rows)
  // left a ~380px hole under Capacity (five). Columns that stack independently
  // put the machine facts down one side and the capacity/provider picture down
  // the other, with no dead space between them.
  return `<div class="vpage vpage-system" data-v-page="system">
    ${pageHeader({ title: "System", lead: "The machine underneath the work." })}
    <div class="vsys-grid">
      <div class="vsys-col">${host}${runtime}${environment}</div>
      <div class="vsys-col">${capacity}${providers}${history}</div>
    </div>
  </div>`;
}

function describeSample(s) {
  const bits = [];
  if (s.cpu_load_pct != null) bits.push(`CPU ${s.cpu_load_pct}%`);
  if (s.mem_used_pct != null) bits.push(`memory ${s.mem_used_pct}%`);
  if (s.pressure) bits.push(`pressure ${s.pressure}`);
  return bits.join(" · ") || "Sample recorded";
}

/* ---------------------------------------------------------------------------
 * Maturity legend — rendered in Settings so the classifications are readable
 * inside the product, not only in the governed document.
 * ------------------------------------------------------------------------- */

export const MATURITY_COPY = Object.freeze({
  [MATURITY.LIVE]: "Wired to canonical runtime truth.",
  [MATURITY.AVAILABLE_NOT_WIRED]: "A canonical source exists; this UI does not read it yet.",
  [MATURITY.DERIVABLE]: "Computable from evidence that already exists; no projection owns it yet.",
  [MATURITY.INSTRUMENTATION_REQUIRED]: "The platform does not collect what this needs.",
  [MATURITY.PROVIDER_REQUIRED]: "The provider must begin reporting this.",
  [MATURITY.PLACEHOLDER]: "Represented in the design only. No reliable source exists.",
});

export function maturityLegend() {
  return `<dl class="vlegend">${Object.entries(MATURITY_COPY).map(([k, v]) => `
    <dt class="vlegend-k">${esc(k)}</dt><dd class="vlegend-v">${esc(v)}</dd>`).join("")}</dl>`;
}


/* ===========================================================================
 * THE CONVERSATION
 *
 * One grammar, five roles, and the roles do NOT look alike.
 *
 * The regression this corrects: V2 rendered the operator's instruction, the
 * provider's output, a completed governed action and the run's status as four
 * white cards of similar weight, stacked. You could not tell who had said what,
 * or in what order — and provider output sat directly above the composer, where
 * it read as something the operator had typed.
 *
 * The grammar:
 *   YOU        an authored message, right-anchored rail, ink on tint
 *   PROVIDER   an authored message, provider identity, elevated surface
 *   SYSTEM     one quiet line with a mark. Never a card.
 *   GOVERNANCE the only role permitted to draw attention
 *   RUN_STATUS what is happening, when nobody has said anything yet
 * ========================================================================= */

const ROLE_CLASS = Object.freeze({
  [MESSAGE_ROLE.USER]: "vmsg-user",
  [MESSAGE_ROLE.PROVIDER]: "vmsg-provider",
  [MESSAGE_ROLE.SYSTEM]: "vmsg-system",
  [MESSAGE_ROLE.GOVERNANCE]: "vmsg-governance",
  [MESSAGE_ROLE.RUN_STATUS]: "vmsg-status",
});

/**
 * The authorship line. It is the whole point of the thread, so it is never
 * optional and never inferred from position.
 */
function byline(entry) {
  const who = esc(entry.author || "");
  const when = entry.clock ? `<span class="vmsg-when">${esc(entry.clock)}</span>` : "";
  const state = entry.working
    ? `<span class="vmsg-state">Working</span>`
    : "";
  return `<div class="vmsg-by"><span class="vmsg-who">${who}</span>${state}${when}</div>`;
}

/**
 * The four-line preview control.
 *
 * SCAN DENSITY, NOT HIDING. The message is entirely in the DOM — the clamp is
 * CSS — so copy, find-in-page and assistive technology all see the full text.
 * What changes is how much vertical space one message may claim before the
 * operator has agreed to spend it.
 *
 * Expansion is PER MESSAGE and is owned by the DOM, not by app state: a live
 * provider message that repaints must not slam itself shut while the operator
 * is reading it, and a repaint must not expand the whole thread either.
 */
function previewToggle(id) {
  return `<button type="button" class="vmsg-more" data-v-msg-more="${esc(id)}" aria-expanded="false">
    <span class="vmsg-more-open">Show more</span><span class="vmsg-more-close">Show less</span>
  </button>`;
}

/**
 * COPY IS A PRIMARY ACTION, NOT AN OVERFLOW ITEM.
 *
 * Provider output is the thing the operator carries OUT of Vacilando — into a
 * commit message, a ticket, a reply. Burying that behind "…" taxed the most
 * common thing anyone does with a final report.
 *
 * The text travels ON THE BUTTON rather than being scraped from the DOM at
 * click time, and that is the whole point: the visible body is line-clamped and
 * may be wrapped in provider-specific markup, so reading the rendered element
 * would copy a four-line excerpt of a rich rendering. `entry.body` is the
 * underlying message — the same string whether the row is collapsed or open,
 * with its own newlines — and the byline, clock and "Working" chrome are not in
 * it because they were never part of what the provider said.
 */
function copyButton(entry) {
  return `<button type="button" class="vmsg-copy" data-v-msg-copy="${esc(entry.id)}"
    data-v-copy-text="${esc(entry.body)}" aria-label="Copy message" title="Copy message">
    <span class="vmsg-copy-mark" aria-hidden="true">\u29c9</span><span class="vmsg-copy-label">Copy</span>
  </button>`;
}

/**
 * The one actions row a message carries. Show more governs how much of the
 * message you are looking at; Copy takes all of it regardless. They sit
 * together because they are the two things you do to a message, and neither is
 * worth a menu.
 */
function msgActions(entry, clamp) {
  const bits = [];
  if (clamp) bits.push(previewToggle(entry.id));
  if (entry.body) bits.push(copyButton(entry));
  if (!bits.length) return "";
  return `<div class="vmsg-acts">${bits.join("")}</div>`;
}

export function messageRow(entry, { renderProviderBody = null, attachments = "" } = {}) {
  if (!entry) return "";
  const cls = ROLE_CLASS[entry.role] || "vmsg-system";

  // SYSTEM IS ONE LINE. A completed governed action is history; it earns a mark
  // and a sentence, not a panel that outlives the work it describes.
  if (entry.role === MESSAGE_ROLE.SYSTEM) {
    return `<li class="vmsg ${cls}${entry.ok === false ? " is-failed" : ""}" data-v-role="system">
      <span class="vmsg-mark" aria-hidden="true">${entry.ok === false ? "✕" : "✓"}</span>
      <span class="vmsg-sys-text">${esc(entry.body)}</span>
      ${entry.clock ? `<span class="vmsg-when">${esc(entry.clock)}</span>` : ""}
    </li>`;
  }

  const clamp = messageNeedsPreview(entry.body);

  if (entry.role === MESSAGE_ROLE.PROVIDER) {
    const body = typeof renderProviderBody === "function"
      ? renderProviderBody(entry)
      : `<div class="vmsg-body">${esc(entry.body)}</div>`;
    return `<li class="vmsg ${cls}${clamp ? " is-clampable" : ""}" data-v-role="provider"
      data-v-msg-id="${esc(entry.id)}"${entry.working ? ' data-gw-live="1"' : ""}>
      ${byline(entry)}
      <div class="vmsg-clamp" data-v-msg-clamp>${body}</div>
      ${msgActions(entry, clamp)}
      ${entry.meta && !entry.working ? `<div class="vmsg-meta">${esc(entry.meta)}</div>` : ""}
    </li>`;
  }

  // USER. The instruction is shown verbatim; delivery is quiet metadata.
  // Attachments sit OUTSIDE the clamp — an artifact is not prose, and hiding it
  // behind "Show more" would hide the thing the message was carrying.
  return `<li class="vmsg ${cls}${clamp ? " is-clampable" : ""}" data-v-role="user"
    data-v-msg-id="${esc(entry.id)}" data-gw-last>
    ${byline(entry)}
    <div class="vmsg-clamp" data-v-msg-clamp><div class="vmsg-body vmsg-user-body gw-last-text" data-gw-msg-text>${esc(entry.body)}</div></div>
    ${msgActions(entry, clamp)}
    ${attachments}
    ${entry.meta ? `<div class="vmsg-meta">${esc(entry.meta)}</div>` : ""}
  </li>`;
}

export function renderThread(thread, { renderProviderBody = null, attachments = "", empty = null } = {}) {
  const entries = thread?.entries || [];
  if (!entries.length) {
    return `<div class="vthread is-empty">${empty || emptyState({
      title: "Nothing has happened on this lane yet",
      body: "Write an instruction below to start.",
    })}</div>`;
  }
  // NOTE: the scroll hook is NOT here. `data-gw-thread` marks the element the
  // controller scrolls to keep the latest message in view, and this <ol> does
  // not scroll — its ancestor .vlane-body does. Putting the hook on the list
  // silently broke scroll-to-latest, so the operator landed on the OLDEST entry.
  return `<ol class="vthread" data-v-thread="${entries.length}">${entries.map((e) => messageRow(e, {
    renderProviderBody,
    attachments: e.role === MESSAGE_ROLE.USER ? attachments : "",
  })).join("")}</ol>`;
}

/* ---------------------------------------------------------------------------
 * CURRENT WORK — the orientation card.
 * ------------------------------------------------------------------------- */

export function currentWorkCard(work, { state = null, tone = "", live = false, expanded = false, cancel = "" } = {}) {
  if (!work?.active) {
    return surface({
      title: "Current work",
      className: "vcard-work",
      body: emptyState({ title: "No active work", body: "Ready for instruction — write one below to start." }),
    });
  }
  const details = work.details
    ? `<details class="vwork-details"${expanded ? " open" : ""} data-v-work-details>
        <summary class="vwork-details-sum">View work details</summary>
        <div class="vwork-details-body">${esc(work.details)}</div>
      </details>`
    : "";
  return surface({
    title: "Current work",
    className: "vcard-work",
    actions: state ? stateDot(state, { tone, live }) : "",
    body: `
      <h3 class="vwork-title">${esc(work.title)}</h3>
      ${work.summary ? `<p class="vwork-desc">${esc(work.summary)}</p>` : ""}
      ${progress(work.progress, { compact: true })}
      ${details}
      ${cancel}`,
  });
}
