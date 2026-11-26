/**
 * DX-5.5 browser certification — live + fixture continuation surfaces.
 * Usage: node scripts/local-dev/apps/vacilando/capture-dx5-5-continuation.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/web/node_modules/playwright/index.mjs";
import { missionContinuationVm } from "../../lib/vacilando/presentation/mission-continuation.mjs";

const PORT = process.env.VAC_PORT || "3026";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/docs/platform/planning/vacilando-os/qa/director-experience-v2/screenshots";
mkdirSync(OUT, { recursive: true });

async function api(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

function cardHtml(card, primary = false) {
  const why = card.whyChoose || "";
  const expected = card.expectedOutcome || card.expectedOutput || "";
  return `<article class="card${primary ? " rec" : ""}">
    <div class="h"><b>${card.title}</b>${primary ? " <span class='pill'>Recommended</span>" : ""}</div>
    <ul>
      <li><span>Why</span> ${why}</li>
      <li><span>Expected outcome</span> ${expected}</li>
      <li><span>Work</span> ${card.workLaunchesLabel || ""}</li>
      <li><span>Workers</span> ${card.workersAssignedLabel || ""}</li>
      <li><span>Path</span> ${card.pathRelationNote || ""}</li>
    </ul>
    <button>${card.buttonLabel}</button>
  </article>`;
}

function packHtml(title, pack) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font:15px/1.4 ui-sans-serif,system-ui;margin:24px;color:#1a1a1a;background:#f7f5f1}
  h2{margin:0 0 12px} .rec{border-color:#2f6b45;background:#eef6f0}
  .card{border:1px solid #d5d0c8;border-radius:12px;padding:14px;margin:10px 0;background:#fff}
  .h{display:flex;gap:8px;align-items:center;margin-bottom:8px}
  .pill{font-size:11px;background:#2f6b45;color:#fff;padding:2px 8px;border-radius:999px}
  ul{list-style:none;padding:0;margin:0 0 12px} li{padding:3px 0;font-size:13.5px}
  li span{display:inline-block;min-width:140px;font-size:11px;text-transform:uppercase;color:#666;margin-right:8px}
  button{background:#1a1a1a;color:#fff;border:0;border-radius:8px;padding:8px 14px;font:inherit}
  .alts{margin-top:16px} .muted{color:#666;font-size:13px}
  </style></head><body>
  <h2>${title}</h2>
  <p class="muted">continuationState: ${pack.continuationState}</p>
  ${pack.recommended ? cardHtml(pack.recommended, true) : "<p>No recommendation</p>"}
  ${pack.whyRecommended ? `<p><b>Why this is recommended</b> — ${pack.whyRecommended}</p>` : ""}
  ${pack.expectedOutcome ? `<p><b>Expected outcome</b> — ${pack.expectedOutcome}</p>` : ""}
  <div class="alts"><h3>Alternative decisions</h3>
  ${(pack.alternatives || []).map((c) => cardHtml(c)).join("")}
  </div>
  </body></html>`;
}

const mid = "msn_fixture_dx55";
const advanceChoices = [
  { id: "advance", kind: "advance_implementation", label: "Advance", missionId: mid },
  { id: "more", kind: "reopen_work", label: "More", missionId: mid },
  { id: "park", kind: "park_outcome", label: "Park", missionId: mid },
  { id: "close", kind: "certify_completion", label: "Close mission (no implementation)", missionId: mid },
];

const fixtures = {
  discovery_complete: missionContinuationVm(mid, {
    choices: advanceChoices,
    posture: {
      id: "operator_review",
      next: "Recommended: Advance",
      secondaryAction: { kind: "advance_implementation" },
      choices: advanceChoices,
    },
    advance: { ok: true },
  }),
  blocked: missionContinuationVm(mid, {
    choices: [],
    posture: {
      id: "blocked",
      detail: "Blocked",
      primaryAction: { kind: "open_mission", href: `missions/${mid}`, missionId: mid },
    },
    advance: { ok: false },
  }),
  parked: missionContinuationVm(mid, {
    choices: [],
    posture: {
      id: "paused",
      needsYou: true,
      primaryAction: { kind: "resume_stalled", missionId: mid },
    },
    advance: { ok: false },
  }),
  certification_complete: missionContinuationVm(mid, {
    choices: [
      { id: "close", kind: "certify_completion", label: "Accept and close", missionId: mid },
      { id: "more", kind: "reopen_work", label: "Need more", missionId: mid },
      { id: "park", kind: "park_outcome", label: "Park", missionId: mid },
    ],
    posture: { id: "awaiting_completion", choices: [] },
    advance: { ok: false },
  }),
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
const shots = {};
const fixtureSummary = {};

for (const [key, pack] of Object.entries(fixtures)) {
  fixtureSummary[key] = {
    continuationState: pack.continuationState,
    recommended: pack.recommended?.buttonLabel,
    alts: (pack.alternatives || []).map((c) => c.buttonLabel),
    hasFeedback: (pack.cards || []).some((c) => c.kind === "provide_feedback"),
    hasFindings: (pack.cards || []).some((c) => c.kind === "review_findings"),
    closeLabel: (pack.cards || []).find((c) => c.kind === "certify_completion" && !/accept/i.test(c.buttonLabel || ""))?.buttonLabel
      || (pack.cards || []).find((c) => c.kind === "certify_completion")?.buttonLabel,
  };
  await page.setContent(packHtml(`Fixture — ${key}`, pack), { waitUntil: "domcontentloaded" });
  const path = join(OUT, `dx5_5-fixture-${key}.png`);
  await page.screenshot({ path, fullPage: true });
  shots[`fixture_${key}`] = { path: `dx5_5-fixture-${key}.png`, ok: true, ...fixtureSummary[key] };
}

// Live Mission 2
const liveId = "msn_f74ed02c126c88d7ff";
let liveMeta = null;
try {
  const wrap = await api(`/api/v2/views/mission/dashboard?id=${encodeURIComponent(liveId)}`);
  const dash = wrap.dashboard || wrap;
  const d = dash.executive?.decisions || {};
  liveMeta = {
    missionId: liveId,
    postureId: dash.posture?.id,
    continuationState: d.continuationState,
    recommended: d.recommended?.buttonLabel || null,
    alts: (d.alternatives || []).map((c) => c.buttonLabel),
    hasFeedback: (d.cards || []).some((c) => c.kind === "provide_feedback"),
    hasFindings: (d.cards || []).some((c) => c.kind === "review_findings"),
  };
  await page.goto(`${BASE}/#/missions/${encodeURIComponent(liveId)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  const cont = page.locator("#mc-decisions");
  if (await cont.count()) {
    await cont.scrollIntoViewIfNeeded();
    const summary = cont.locator("details.mc-decision-alts summary");
    if (await summary.count()) await summary.first().click().catch(() => {});
    await page.waitForTimeout(300);
    const path = join(OUT, "dx5_5-live-operator-review.png");
    await cont.screenshot({ path });
    shots.live_operator_review = { path: "dx5_5-live-operator-review.png", ok: true, ...liveMeta };

    if (await page.locator("[data-mc-review-findings]").count()) {
      await page.locator("[data-mc-review-findings]").first().click();
      await page.waitForTimeout(500);
      shots.live_review_findings = {
        ok: true,
        focus: await page.locator("#mc-exec-summary.mc-findings-focus").count() > 0,
      };
    }
    if (await page.locator("[data-mc-provide-feedback]").count()) {
      await page.locator("[data-mc-provide-feedback]").first().click();
      await page.waitForTimeout(400);
      const panel = page.locator("#mc-feedback-panel:not([hidden])");
      if (await panel.count()) {
        const fbPath = join(OUT, "dx5_5-live-feedback-panel.png");
        await panel.screenshot({ path: fbPath });
        shots.live_feedback = { ok: true, path: "dx5_5-live-feedback-panel.png" };
      }
    }
    // Full L1 scroll for IA
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, "dx5_5-live-l1-top.png"), fullPage: false });
    shots.live_l1_top = { path: "dx5_5-live-l1-top.png", ok: true };
  } else {
    shots.live_operator_review = { ok: false, note: "no #mc-decisions", ...liveMeta };
  }
} catch (e) {
  shots.live_operator_review = { ok: false, error: String(e.message || e) };
}

await browser.close();

const report = {
  controlPlane: BASE,
  capturedAt: new Date().toISOString(),
  liveMeta,
  fixtureSummary,
  shots,
  checks: {
    discoveryCompleteRecommendsBeginImplementation:
      fixtures.discovery_complete.recommended?.buttonLabel === "Begin Implementation",
    blockedRecommendsResolve: fixtures.blocked.recommended?.buttonLabel === "Resolve Blockers",
    parkedRecommendsResume: fixtures.parked.recommended?.buttonLabel === "Resume Mission",
    closeRenamed: fixtures.discovery_complete.alternatives.some((c) => c.buttonLabel === "Close Without Continuing"),
    feedbackDistinct: fixtures.discovery_complete.alternatives.some((c) => c.kind === "provide_feedback")
      && fixtures.discovery_complete.alternatives.some((c) => c.kind === "reopen_work"),
    reviewFindingsPresent: fixtures.discovery_complete.alternatives.some((c) => c.kind === "review_findings"),
    liveHasRecommended: Boolean(liveMeta?.recommended),
    liveHasFeedback: Boolean(liveMeta?.hasFeedback),
    liveHasFindings: Boolean(liveMeta?.hasFindings),
  },
};

writeFileSync(join(OUT, "dx5_5-browser-checks.json"), JSON.stringify(report, null, 2));
writeFileSync(join(OUT, "dx5_5-continuation-state-fixtures.json"), JSON.stringify(fixtureSummary, null, 2));
console.log(JSON.stringify({ checks: report.checks, shots: Object.keys(shots), liveMeta }, null, 2));
