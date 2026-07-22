/*
 * Vacilando Runtime — Control Room controller.
 *
 * The primary object is the active worker session. NO orchestration logic here:
 * this file renders the worker board + selected-worker operating surface from
 * the runtime snapshot / resources / outputs / director endpoints, and runs
 * commands ONLY through the runtime (preview → confirm → execute → audit →
 * refresh). The runtime owns truth and commands; the UI owns presentation.
 */
const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const glyph = (g) => `<svg class="i"><use href="#g-${g || "compass"}"></use></svg>`;
const STATUS_ACC = { running: "var(--run)", review: "var(--review)", blocked: "var(--blocked)", complete: "var(--green-ink)", planning: "var(--plan)", paused: "var(--paused)", idle: "var(--idle)" };
function ago(ms) { if (!ms) return "—"; const s = Math.max(0, (Date.now() - ms) / 1000); if (s < 60) return `${s | 0}s`; if (s < 3600) return `${(s / 60) | 0}m`; if (s < 86400) return `${(s / 3600) | 0}h`; return `${(s / 86400) | 0}d`; }
const shortBranch = (b, wt) => (b ? b.replace(/^agent\/[^/]+\//, "") : wt || "—");

const state = { snap: null, res: null, sel: null, tab: "overview", outputs: {}, director: {} };

// -------- routing (Command Center / Work History / Settings) --------
function route() { return (location.hash.replace(/^#\/?/, "") || "command").split("/")[0]; }
function go(r) { location.hash = "#/" + r; }
const CRUMBS = { command: "Command Center", history: "Work History", settings: "Settings" };
function setActiveNav(r) {
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === r));
  $("#crumb").textContent = CRUMBS[r] || "Command Center";
}

let lastKey = null;
function render(force) {
  if (document.querySelector(".ov")) return;
  const r = route();
  const key = r + "|" + (state.snap?.generated_at || "") + "|" + (state.res?.overall?.mem_used_pct ?? "") + "|" + state.sel + "|" + state.tab + "|" + Object.keys(state.outputs).length + "|" + Object.keys(state.director).length;
  if (!force && key === lastKey) return;
  lastKey = key;
  setActiveNav(r);
  const V = $("#view");
  if (!state.snap || !state.snap.headline) { V.innerHTML = `<div class="empty"><div class="big">Connecting to the runtime…</div></div>`; return; }
  if (state.sel == null && state.snap.sprints[0]) select(state.snap.sprints[0].slot, false);
  V.innerHTML = ({ command: viewCommand, history: viewHistory, settings: viewSettings }[r] || viewCommand)();
  $("#nb-needs").textContent = state.snap ? needsYou().length : 0;
}

// -------- Command Center: board | operating surface | rail --------
function viewCommand() {
  return `<div class="room">
    <section class="board">
      <div class="board-h"><span>Workers</span><button class="btn primary sm" data-start>+ Start Work</button></div>
      ${state.snap.sprints.map(workerCard).join("")}
      ${resourcesCard()}
    </section>
    <section class="surface">${operatingSurface()}</section>
    <aside class="needs">${needsYouHtml()}</aside>
  </div>`;
}
function needsYouHtml() {
  const items = needsYou();
  return `<div class="rail-hh">Needs You <span class="b">${items.length}</span></div>` +
    (items.length ? items.map((it) => `<div class="rcard" ${it.sel ? `data-sel="${it.sel}"` : ""} ${it.route ? `data-nav="${it.route}"` : ""}><span class="sd ${it.k}"></span><div><div class="rt">${esc(it.t)}</div><div class="rs trunc">${esc(it.s)}</div></div></div>`).join("") : `<div class="rempty">All clear.</div>`);
}

function resFor(slot) { return (state.res?.workers || []).find((w) => w.slot === slot) || null; }

function workerCard(sp) {
  const r = resFor(sp.slot);
  const proc = r?.server_process;
  const pend = sp.question_count || 0;
  return `<div class="wcard ${sp.slot === state.sel ? "sel" : ""}" data-sel="${sp.slot}" style="--acc:${STATUS_ACC[sp.status] || "var(--green)"}">
    <div class="wc-top"><span class="gl">${glyph(sp.glyph)}</span>
      <div class="wc-id"><b>slot ${sp.slot}</b> · ${esc(sp.provider)}</div>
      <span class="chip ${sp.status}">${esc(sp.status)}</span>${pend ? `<span class="pend">${pend}</span>` : ""}</div>
    <div class="wc-obj trunc">${esc(sp.title)}</div>
    <div class="wc-meta trunc mono">${esc(shortBranch(sp.branch, sp.worktree))} · ↑${sp.git.ahead}↓${sp.git.behind}${sp.git.state === "dirty" ? "·dirty" : ""}</div>
    <div class="wc-res">${proc
      ? `<span title="cpu">◔ ${proc.cpu_pct}%</span><span title="mem">▤ ${proc.rss_mb}MB</span><span title="elapsed">◷ ${proc.elapsed}</span>${r.port ? `<span title="port">:${r.port}</span>` : ""}`
      : `<span class="muted">no active process</span>`}<span class="wc-act">upd ${ago(sp.updated_at_ms)}</span></div>
    <div class="wc-ctl">
      ${sp.status === "paused" ? `<button class="btn sm warn" data-cmd="worker.resume" data-slot="${sp.slot}">Resume</button>` : `<button class="btn sm" data-cmd="worker.pause" data-slot="${sp.slot}">Pause</button>`}
      <button class="btn sm" data-cmd="worker.doctor" data-slot="${sp.slot}">Diagnose</button>
      <button class="btn sm" data-end="${sp.slot}">End</button>
    </div></div>`;
}

function resourcesCard() {
  const o = state.res?.overall;
  if (!o || !o.slots) return `<div class="rescard"><div class="rh">Machine</div><div class="muted">reading…</div></div>`;
  const pc = o.slots.pressure;
  return `<div class="rescard ${pc}"><div class="rh">Machine · <span class="pr ${pc}">${pc}</span></div>
    <div class="rgrid">
      <div><span class="rl">CPU load</span><span class="rv">${o.cpu_load_pct}% <small>(${o.load_1m}/${o.cpu_count})</small></span></div>
      <div><span class="rl">Memory</span><span class="rv">${o.mem_used_pct}% <small>${(o.mem_free_mb / 1024).toFixed(1)}G free</small></span></div>
      <div><span class="rl">Servers</span><span class="rv">${o.running_servers} running</span></div>
      <div><span class="rl">Capacity</span><span class="rv">${o.slots.occupied}/6 · ${o.slots.recommended_available} free rec.</span></div>
    </div>${o.warning ? `<div class="rwarn">${esc(o.warning)}</div>` : ""}</div>`;
}

// -------- selected worker operating surface --------
function operatingSurface() {
  const sp = state.snap.sprints.find((x) => x.slot === state.sel);
  if (!sp) return `<div class="empty">Select a worker.</div>`;
  const w = state.snap.workers.find((x) => x.slot === sp.slot);
  const r = resFor(sp.slot);
  const tabs = ["overview", "outputs", "director"];
  return `<div class="surf-h">
      <span class="gl big">${glyph(sp.glyph)}</span>
      <div class="surf-t"><div class="tt">${esc(sp.title)}</div>
        <div class="su">slot ${sp.slot} · ${esc(sp.provider)} · <span class="chip ${sp.status}">${esc(sp.status)}</span> · ${w ? `<span class="hpill ${w.health}">${w.health}</span>` : ""} · upd ${ago(sp.updated_at_ms)} ago</div></div>
      <div class="surf-actions">
        <button class="btn sm" data-cmd="runtime.refresh">Refresh</button>
        <button class="btn sm" data-cmd="worker.doctor" data-slot="${sp.slot}">Diagnose</button>
        ${sp.status === "paused" ? `<button class="btn sm warn" data-cmd="worker.resume" data-slot="${sp.slot}">Resume</button>` : `<button class="btn sm warn" data-cmd="worker.pause" data-slot="${sp.slot}">Pause</button>`}
        <button class="btn sm warn" data-end="${sp.slot}">End work</button>
      </div></div>
    <div class="tabs">${tabs.map((t) => `<button class="tab ${state.tab === t ? "on" : ""}" data-tab="${t}">${t}</button>`).join("")}</div>
    <div class="tabc">${state.tab === "overview" ? tabOverview(sp, w, r) : state.tab === "outputs" ? tabOutputs(sp) : tabDirector(sp)}</div>`;
}

function tabOverview(sp, w, r) {
  const kv = (a, b, mono) => `<dt>${a}</dt><dd class="${mono ? "mono" : ""}">${b}</dd>`;
  const proc = r?.server_process;
  return `<div class="cols2">
    <div class="sec"><h5>Objective &amp; Instructions</h5>
      <div class="obj">${esc(sp.objective || sp.title)}</div>
      <div class="muted note">Full live instructions are held in the worker's session and its worktree package; Vacilando composes and routes new instructions from the Director tab (it cannot read the live editor buffer).</div></div>
    <div class="sec"><h5>State</h5><dl class="kv">
      ${kv("Provider", esc(sp.provider))}${kv("Stage", esc(sp.phase?.label || "—"))}
      ${kv("Initiative", sp.initiative_key ? esc(sp.initiative_key) : '<span class="muted">— managed sprint</span>')}
      ${kv("Session", w?.ownership?.session_id ? esc(w.ownership.session_id) : "—", 1)}
      ${kv("Health", w ? `<span class="hpill ${w.health}">${w.health}</span>` : "—")}</dl></div>
    <div class="sec"><h5>Worktree &amp; Git</h5><dl class="kv">
      ${kv("Worktree", esc(sp.worktree), 1)}${kv("Branch", esc(sp.branch || "—"), 1)}
      ${kv("Position", `↑${sp.git.ahead} ↓${sp.git.behind} · <span class="${sp.git.state === "dirty" ? "dirty" : "clean"}">${sp.git.state}</span>`)}
      ${kv("Server", esc(sp.server) + (sp.port ? ` · :${sp.port}` : ""))}</dl></div>
    <div class="sec"><h5>Resources</h5><dl class="kv">
      ${proc ? kv("Server proc", `pid ${proc.pid} · ${proc.cpu_pct}% cpu · ${proc.rss_mb}MB · ${proc.elapsed}`) : kv("Process", '<span class="muted">no active process identified</span>')}
      ${r ? kv("Disk", r.disk_mb != null ? `${(r.disk_mb / 1024).toFixed(1)} GB` : "—") : ""}
      ${kv("Provider app", '<span class="muted">PID not tracked by toolkit</span>')}</dl></div>
    ${sp.questions?.length ? `<div class="sec span2"><h5>Open Questions / Blockers</h5>${sp.questions.map((q) => `<div class="blocker">${esc(q.question)}</div>`).join("")}</div>` : ""}
  </div>`;
}

function tabOutputs(sp) {
  const o = state.outputs[sp.worktree];
  if (!o) { fetchOutputs(sp.worktree); return `<div class="muted" style="padding:14px">Loading outputs…</div>`; }
  if (!o.items.length) return `<div class="empty">No outputs yet for this worker.</div>`;
  return `<div class="outputs">${o.items.map((it) => outputCard(it, sp.worktree)).join("")}</div>`;
}
function outputCard(it, worktree) {
  const when = it.created_ms ? ago(it.created_ms) + " ago" : "";
  if (it.is_image) {
    const src = `/api/evidence?worktree=${encodeURIComponent(worktree)}&file=${encodeURIComponent(it.evidence_file)}`;
    return `<div class="ocard img"><div class="oh"><span class="otype screenshot">screenshot</span><span class="ot trunc">${esc(it.title)}</span><span class="ow">${when}</span></div>
      <a href="${src}" target="_blank"><img src="${src}" loading="lazy" alt="${esc(it.title)}"></a></div>`;
  }
  return `<div class="ocard"><div class="oh"><span class="otype ${it.type}">${esc(it.type)}</span><span class="ot trunc">${esc(it.title)}</span><span class="ow">${when}${it.short ? ` · <span class="mono">${esc(it.short)}</span>` : ""}</span></div>
    ${it.preview ? `<pre class="opre">${esc(it.preview)}</pre>` : ""}
    <div class="oactions"><span class="muted" style="font-size:10.5px">source: ${esc(it.source)}</span>
      ${it.evidence_file ? `<a class="btn sm" href="/api/evidence?worktree=${encodeURIComponent(worktree)}&file=${encodeURIComponent(it.evidence_file)}" target="_blank">Open</a>` : ""}</div></div>`;
}

function tabDirector(sp) {
  const log = state.director[sp.slot];
  if (log === undefined) { fetchDirector(sp.slot); }
  const items = log || [];
  return `<div class="director">
    <div class="dintro">Compose an instruction for <b>${esc(sp.provider)} · slot ${sp.slot}</b>. Vacilando records it and copies it to your clipboard — <b>you paste it into the live session</b>. There is no governed way to inject text into a running Claude/Cursor session.</div>
    <div class="dlog">${items.length ? items.map((m) => `<div class="dmsg"><div class="dm-h"><span class="who">Director → slot ${m.slot}</span><span class="dt">${m.occurred_at ? new Date(m.occurred_at).toLocaleString() : ""}</span></div><div class="dm-b">${esc(m.message)}</div><div class="dm-f">${esc(m.delivery)}${m.clipboard_ok ? " · copied ✓" : ""}</div></div>`).join("") : `<div class="empty">No instructions routed yet.</div>`}</div>
    <div class="dcompose"><textarea id="d-msg" placeholder="e.g. Review the last change and tell me what to fix, then wait for my approval."></textarea>
      <div class="drow"><span class="muted" style="font-size:11px">Preview → confirm → record + clipboard</span><button class="btn go" data-director="${sp.slot}">Route instruction →</button></div></div>
  </div>`;
}

// -------- Needs You rail --------
function needsYou() {
  const out = [];
  for (const sp of state.snap.sprints) {
    if (sp.question_count > 0) out.push({ k: "q", t: `Question · slot ${sp.slot}`, s: sp.title, sel: sp.slot });
    if (sp.status === "review") out.push({ k: "review", t: `Review · slot ${sp.slot}`, s: sp.title, sel: sp.slot });
  }
  const o = state.res?.overall;
  if (o?.warning) out.push({ k: "warn", t: "Resource warning", s: o.warning });
  for (const w of (state.snap.workers || [])) if (w.health === "attention") out.push({ k: "warn", t: `Worker attention · slot ${w.slot}`, s: `${w.id} needs a look`, sel: w.slot });
  return out;
}

// -------- Work History + Settings --------
function viewHistory() {
  if (!state._audit) { fetchAudit(); return `<div class="muted" style="padding:14px">Loading history…</div>`; }
  const ev = state._audit;
  return `<div class="section-title">Execution history <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">· every command Vacilando has run (audit)</span></div>
    <section class="card"><table class="tbl"><thead><tr><th>Time</th><th>Command</th><th>Target</th><th>Outcome</th></tr></thead>
    <tbody>${ev.length ? ev.map((e) => `<tr><td class="muted">${e.occurred_at ? new Date(e.occurred_at).toLocaleString() : ""}</td>
      <td class="mono">${esc(e.command)}</td><td class="trunc" style="max-width:320px">${esc(e.target?.label || "—")}</td>
      <td><span class="o ${e.outcome}">${esc(e.outcome)}</span></td></tr>`).join("") : `<tr><td colspan="4"><div class="empty">No commands run yet.</div></td></tr>`}</tbody></table></section>`;
}
function viewSettings() {
  if (!state._cmds) { fetchCommands(); return `<div class="muted" style="padding:14px">Loading…</div>`; }
  const sup = state._cmds.filter((c) => c.supported), un = state._cmds.filter((c) => !c.supported);
  return `<div class="cols2">
    <div class="sec"><h5>Governed capabilities (wired)</h5>${sup.map((c) => `<div class="capline"><span class="mono">${esc(c.key)}</span><span class="chip ${c.risk === "consequential" ? "review" : "complete"}">${esc(c.risk)}</span></div>`).join("")}</div>
    <div class="sec"><h5>Not available (honest gaps)</h5>${un.map((c) => `<div class="capline unsup"><span class="mono">${esc(c.key)}</span></div><div class="why">${esc(c.reason)}</div>`).join("")}
      <div class="why" style="margin-top:8px"><b>Message injection:</b> no governed way to send text into a live Claude/Cursor session — Director routes via clipboard + manual paste.</div>
      <div class="why"><b>Provider cost/tokens:</b> no usage source on staging (needs headless <span class="mono">claude -p</span> usage JSON).</div>
    </div>
    <div class="sec span2"><h5>Identity &amp; scope</h5><div class="muted">Loopback-only control plane · read-only projections + governed commands · warm Vacilando identity. No remote, mobile, notifications, autonomous answers, promotion, or merge.</div></div>
  </div>`;
}

// -------- selection + data --------
function select(slot, rerender = true) {
  state.sel = slot; state.tab = "overview";
  const sp = state.snap?.sprints.find((x) => x.slot === slot);
  if (sp) { fetchOutputs(sp.worktree); fetchDirector(slot); }
  if (rerender) render(true);
}
async function fetchOutputs(wt) { if (!wt) return; try { const r = await fetch(`/api/outputs?worktree=${encodeURIComponent(wt)}`); state.outputs[wt] = await r.json(); render(true); } catch {} }
async function fetchDirector(slot) { try { const r = await fetch(`/api/director?slot=${slot}`); state.director[slot] = (await r.json()).log || []; render(true); } catch {} }
async function fetchAudit() { try { const r = await fetch("/api/audit"); state._audit = (await r.json()).events; render(true); } catch {} }
async function fetchCommands() { try { const r = await fetch("/api/commands"); state._cmds = (await r.json()).commands; render(true); } catch {} }
async function fetchResources() { try { const r = await fetch("/api/resources"); state.res = await r.json(); render(); } catch {} }

// -------- command runtime --------
async function api(p, b) { const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, data: await r.json() }; }
async function startCommand(command, input) {
  const { data: pv } = await api("/api/commands/preview", { command, input });
  if (!pv.ok) { toast("err", `Can't ${command}`, pv.reason || (pv.errors || []).join("; ") || pv.code); return; }
  if (!pv.requires_confirmation) return execute(command, input, false);
  showConfirm(pv, () => execute(command, input, true));
}
async function execute(command, input, confirm) {
  const { data } = await api("/api/commands", { command, input, confirm, actor: "operator" });
  if (data.stage === "execute") {
    const okc = data.result ? (data.result.exit === undefined || data.result.exit === 0) : data.ok;
    const msg = data.result?.kind === "cli" ? (data.result.stdout || data.result.stderr || "") : (data.result?.data?.clipboard ? "recorded + copied to clipboard" : "done");
    toast(okc ? "ok" : "err", `${command} ${okc ? "done" : "failed"}`, String(msg).split("\n").slice(0, 3).join("\n"));
    if (data.snapshot) { state.snap = data.snapshot; }
    if (command === "director.route" && input.slot) fetchDirector(input.slot);
    if (command.startsWith("worker.") || command.startsWith("sprint.")) { const sp = state.snap?.sprints.find((x) => x.slot === input.slot); if (sp) fetchOutputs(sp.worktree); fetchResources(); }
    render(true);
  } else { toast("err", `${command} not run`, data.reason || (data.errors || []).join("; ") || data.code); }
}
function showConfirm(pv, onConfirm) {
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>${esc(pv.title || pv.command)}</h3><span class="risk ${pv.risk || "low"}">${esc(pv.risk || "low")}</span>
    <div class="b">${esc(pv.preview?.summary || "")}${pv.target ? `<div class="tgt">▸ ${esc(pv.target.label || "")}</div>` : ""}
      ${pv.preview?.effects?.length ? `<ul>${pv.preview.effects.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
      ${pv.will_run?.bin ? `<div class="willrun">runs: ${esc(pv.will_run.bin)} ${esc((pv.will_run.args || []).join(" "))}</div>` : ""}</div>
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn ${pv.risk === "consequential" ? "go" : "primary"} ok">Confirm</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.querySelector(".ok").onclick = () => { ov.remove(); onConfirm(); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  document.body.appendChild(ov);
}
function showStartWork() {
  const free = [1, 2, 3, 4, 5, 6].filter((n) => !state.snap.sprints.some((s) => s.slot === n));
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>Start work</h3><span class="risk consequential">consequential</span>
    <div class="b"><label>Objective / name (kebab-case key)</label><input class="f-name" placeholder="my-new-task">
      <label>Provider</label><select class="f-prov"><option value="claude">Claude</option><option value="cursor">Cursor</option></select>
      <label>Slot</label><select class="f-slot"><option value="">auto</option>${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${free.includes(n) ? "" : "disabled"}>slot ${n}${free.includes(n) ? "" : " (occupied)"}</option>`).join("")}</select>
      <label>Objective (optional)</label><input class="f-obj" placeholder="what the worker should do">
      ${free.length ? "" : `<div class="willrun" style="color:var(--terra);margin-top:8px">All six slots are occupied — end a worker to free capacity. This will refuse.</div>`}</div>
    <div class="foot"><button class="btn cancel">Cancel</button><button class="btn go ok">Preview →</button></div></div>`;
  ov.querySelector(".cancel").onclick = () => { ov.remove(); render(true); };
  ov.addEventListener("click", (e) => { if (e.target === ov) { ov.remove(); render(true); } });
  ov.querySelector(".ok").onclick = () => {
    const input = { name: ov.querySelector(".f-name").value.trim(), provider: ov.querySelector(".f-prov").value };
    const slot = ov.querySelector(".f-slot").value; if (slot) input.slot = Number(slot);
    const obj = ov.querySelector(".f-obj").value.trim(); if (obj) input.objective = obj;
    ov.remove(); startCommand("sprint.start", input);
  };
  document.body.appendChild(ov);
}
function showEndWork(slot) {
  const sp = state.snap.sprints.find((x) => x.slot === slot);
  const dirty = sp?.git?.state === "dirty";
  const ov = el("div", "ov");
  ov.innerHTML = `<div class="dlg"><h3>End work · slot ${slot}</h3><span class="risk consequential">consequential</span>
    <div class="b">${esc(sp?.title || "")}
      <ul><li><b>Pause &amp; keep</b> — stop the provider/server, preserve everything (reversible).</li>
      <li><b>Close session &amp; keep worktree</b> — archive metadata, free the slot; never deletes/pushes/merges.</li>
      <li><b>Delete worktree</b> — not available from Vacilando (needs an interactive terminal).</li></ul>
      ${dirty ? `<label style="display:flex;gap:7px;align-items:center;font-size:12px"><input type="checkbox" class="f-ack" style="width:auto"> Worktree is dirty — acknowledge uncommitted changes (required to close)</label>` : ""}</div>
    <div class="foot" style="flex-wrap:wrap"><button class="btn cancel">Cancel</button>
      <button class="btn warn" data-do="pause">Pause &amp; keep</button>
      <button class="btn go" data-do="finish">Close session</button></div></div>`;
  const close = () => { ov.remove(); render(true); };
  ov.querySelector(".cancel").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector('[data-do="pause"]').onclick = () => { ov.remove(); startCommand("worker.pause", { slot }); };
  ov.querySelector('[data-do="finish"]').onclick = () => { const ack = ov.querySelector(".f-ack")?.checked; ov.remove(); startCommand("sprint.finish", ack ? { slot, acknowledge_uncommitted: true } : { slot }); };
  document.body.appendChild(ov);
}
let toastTimer = null;
function toast(kind, title, msg) {
  document.querySelector(".toast")?.remove();
  const t = el("div", `toast ${kind}`, `${esc(title)}${msg ? `<div class="m">${esc(String(msg))}</div>` : ""}`);
  document.body.appendChild(t); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 6000);
}

// -------- delegation --------
document.addEventListener("click", (e) => {
  const t = (a) => e.target.closest(a);
  let n;
  if ((n = t("[data-sel]"))) { select(Number(n.dataset.sel)); return; }
  if ((n = t("[data-tab]"))) { state.tab = n.dataset.tab; render(true); return; }
  if ((n = t("[data-cmd]"))) { e.stopPropagation(); startCommand(n.dataset.cmd, n.dataset.slot ? { slot: Number(n.dataset.slot) } : {}); return; }
  if ((n = t("[data-end]"))) { e.stopPropagation(); showEndWork(Number(n.dataset.end)); return; }
  if (t("[data-start]")) { showStartWork(); return; }
  if ((n = t("[data-director]"))) { const msg = document.getElementById("d-msg")?.value?.trim(); if (!msg) { toast("err", "Empty instruction"); return; } startCommand("director.route", { slot: Number(n.dataset.director), message: msg }); return; }
  if ((n = t("[data-nav]"))) { go(n.dataset.nav); return; }
  if ((n = t("[data-route]"))) { e.preventDefault(); go(n.dataset.route); return; }
});
$("#refresh-btn").addEventListener("click", async (ev) => { ev.target.disabled = true; const x = ev.target.textContent; ev.target.textContent = "↻ …"; await execute("runtime.refresh", {}, false); fetchResources(); ev.target.disabled = false; ev.target.textContent = x; });
window.addEventListener("hashchange", () => render(true));

// -------- data loop --------
function chrome() { $("#gen").textContent = state.snap?.generated_at ? new Date(state.snap.generated_at).toLocaleTimeString() : ""; }
let sseOk = false;
function setLive(s) { const p = $("#livepill"), l = $("#live-label"); if (s === "live") { p.classList.remove("stale"); l.textContent = "Live"; } else if (s === "polling") { p.classList.add("stale"); l.textContent = "Polling"; } else { p.classList.add("stale"); l.textContent = "Offline"; } }
function onSnap(s) { if (!s || !s.headline) return; state.snap = s; chrome(); render(); }
async function poll() { try { const r = await fetch("/api/state", { cache: "no-store" }); onSnap(await r.json()); setLive(sseOk ? "live" : "polling"); } catch { setLive("offline"); } }
function connect() { try { const es = new EventSource("/api/events"); es.addEventListener("snapshot", (ev) => { try { onSnap(JSON.parse(ev.data)); } catch {} sseOk = true; setLive("live"); }); es.addEventListener("hello", () => { sseOk = true; setLive("live"); }); es.onerror = () => { sseOk = false; }; } catch { sseOk = false; } }
if (!location.hash) location.hash = "#/command";
connect(); poll(); fetchResources();
setInterval(poll, 4000);
setInterval(fetchResources, 9000);
