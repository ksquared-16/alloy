#!/usr/bin/env node
/**
 * THE DESKTOP RAIL AND THE LANE INDEX ARE ONE LIST.
 *
 * The rail was the second implementation: a flat map over whatever order the
 * poll returned, with no repository grouping, no way to create a lane, and a
 * badge that counted an approvals array the browser had fetched for itself —
 * a second answer to "how much needs you" that disagreed with the notification
 * store whenever one governed request produced more than one lifecycle event.
 *
 * These assert the rail reads the SAME owners mobile reads.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUB = join(HERE, "..", "apps", "vacilando", "public");
const CSS = readFileSync(join(PUB, "styles.css"), "utf8");
const GW = readFileSync(join(PUB, "gateway.js"), "utf8");
const View = await import(join(PUB, "gateway-view.mjs"));

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const REPOS = [
  { repository_id: "repo_alloy", name: "ksquared-16/alloy", default_branch: "staging" },
  { repository_id: "repo_other", name: "another-repo", default_branch: "main" },
];
const t = (iso) => ({ execution_run: { updated_at: iso } });
const lane = (id, label, repo, iso, extra = {}) => ({
  lane_id: id, label, repository_id: repo, ...t(iso), ...extra,
});

test("the rail groups lanes by canonical repository, never by name parsing", () => {
  const html = View.railHtml([
    lane("lane_a", "Runtime Performance", "repo_alloy", "2026-09-02T10:00:00Z"),
    lane("lane_b", "Surfaces", "repo_alloy", "2026-09-02T09:00:00Z"),
    lane("lane_c", "Something Else", "repo_other", "2026-09-02T08:00:00Z"),
  ], "lane_a", {}, {}, { repositories: REPOS });
  assert.ok(html.includes("ksquared-16/alloy"), "the repository name is the group header");
  assert.ok(html.includes("another-repo"));
  assert.equal((html.match(/gw-rail-repo-h/g) || []).length, 2, "one header per repository, no duplicates");
  // Grouping comes from repository_id, not from the lane label.
  assert.ok(html.indexOf("ksquared-16/alloy") < html.indexOf("Runtime Performance"));
});

test("a lane whose repository is unknown gets a deliberate fallback group", () => {
  const html = View.railHtml([
    lane("lane_a", "Known", "repo_alloy", "2026-09-02T10:00:00Z"),
    lane("lane_x", "Homeless", "repo_missing", "2026-09-02T09:00:00Z"),
  ], null, {}, {}, { repositories: REPOS });
  assert.ok(html.includes("is-unattributed"), "unresolved repos are named, never silently mixed");
  assert.ok(html.includes("Homeless"));
});

test("within a group, lanes order by canonical activity — most recent first", () => {
  const html = View.railHtml([
    lane("lane_a", "Alpha", "repo_alloy", "2026-09-02T08:00:00Z"),
    lane("lane_b", "Bravo", "repo_alloy", "2026-09-02T09:00:00Z"),
    lane("lane_c", "Charlie", "repo_alloy", "2026-09-02T10:00:00Z"),
  ], null, {}, {}, { repositories: REPOS });
  const order = ["Charlie", "Bravo", "Alpha"].map((n) => html.indexOf(n));
  assert.ok(order[0] < order[1] && order[1] < order[2], `expected C,B,A — got ${JSON.stringify(order)}`);

  // Activity in Bravo moves Bravo to the top.
  const moved = View.railHtml([
    lane("lane_a", "Alpha", "repo_alloy", "2026-09-02T08:00:00Z"),
    lane("lane_b", "Bravo", "repo_alloy", "2026-09-02T11:00:00Z"),
    lane("lane_c", "Charlie", "repo_alloy", "2026-09-02T10:00:00Z"),
  ], null, {}, {}, { repositories: REPOS });
  assert.ok(moved.indexOf("Bravo") < moved.indexOf("Charlie"));
});

test("observed_at is not activity — a poll must not reshuffle the rail", () => {
  // Discovery stamps observed_at on every lane on every poll. If ordering read
  // it, every lane's recency would be "now" and the list would reshuffle while
  // the operator was reading it.
  const a = { lane_id: "lane_a", label: "Alpha", repository_id: "repo_alloy", observed_at: "2026-09-02T12:00:00Z", ...t("2026-09-02T08:00:00Z") };
  const b = { lane_id: "lane_b", label: "Bravo", repository_id: "repo_alloy", observed_at: "2026-09-02T12:00:01Z", ...t("2026-09-02T09:00:00Z") };
  assert.ok(View.laneActivityMs(b) > View.laneActivityMs(a));
  const html = View.railHtml([a, b], null, {}, {}, { repositories: REPOS });
  assert.ok(html.indexOf("Bravo") < html.indexOf("Alpha"));
});

test("the rail offers lane creation, through the one canonical wizard hook", () => {
  const html = View.railHtml([], null, {}, {}, { repositories: REPOS });
  assert.ok(html.includes("data-gw-add"), "the rail must carry the same hook the lane index uses");
  assert.ok(/New lane/.test(html));
  // And the click handler that hook resolves to opens the canonical wizard.
  assert.ok(GW.includes('closest?.("[data-gw-add]")'));
  assert.ok(GW.includes("openLaneWizard()"));
});

test("every lane row has one left edge, whatever its state", () => {
  const rule = CSS.match(/\.mission-rail-item\{[^}]*\}/)?.[0] || "";
  assert.ok(rule.includes("align-items:flex-start"), "rows are left aligned");
  assert.ok(rule.includes("text-align:left"));
  assert.ok(!/text-align:center/.test(rule));
  // Indentation is one padding rule, not a per-state variation.
  assert.ok(/padding:7px 10px 7px 12px/.test(rule));
  const active = CSS.match(/\.mission-rail-item\.active\{[^}]*\}/)?.[0] || "";
  assert.ok(!/padding/.test(active), "the selected row must not move the text");
  assert.ok(!/margin/.test(active));
});

test("the navigation rail is white and states are row treatments", () => {
  const rail = CSS.match(/\n\.rail\{[^}]*\}/)?.[0] || "";
  assert.ok(rail.includes("background:var(--card)"), "the rail ground is card white");
  assert.ok(!/linear-gradient/.test(rail), "no full-rail tint");
  // Every state the audit named still exists, on the row.
  assert.ok(/\.mission-rail-item:hover\{[^}]*background:var\(--card-2\)/.test(CSS));
  assert.ok(/\.mission-rail-item\.active\{[^}]*background:var\(--bg-tint\)/.test(CSS));
  assert.ok(/\.mission-rail-item \.gw-lane-attn\.is-bad\{[^}]*var\(--terra\)/.test(CSS));
  assert.ok(/\.mission-rail-item \.badge\{/.test(CSS));
});

test("the attention badge reads the canonical projection, not an approvals array", () => {
  // THE SECOND ANSWER, REMOVED. This used to be `String(rows.length)`.
  assert.ok(!/badge\.textContent = String\(rows\.length\)/.test(GW),
    "the badge must not count the approvals array");
  assert.ok(GW.includes("function paintAttentionBadge()"));
  assert.ok(/G\.attentionCount = Number\(counts\.actionable\)/.test(GW),
    "attention is the canonical actionable count");
  // The approvals bar still RENDERS the records — it just stops counting them.
  assert.ok(GW.includes("renderPendingApprovalsBar"));
});

test("a lane row shows its unseen count from the server-side owner", () => {
  const html = View.railHtml([
    { lane_id: "lane_a", label: "Alpha", repository_id: "repo_alloy", unseen_notifications: 3, ...t("2026-09-02T10:00:00Z") },
  ], null, {}, {}, { repositories: REPOS });
  assert.ok(/<span class="badge">3<\/span>/.test(html));
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
