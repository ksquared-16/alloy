/**
 * REPAIR SLICE 9 — PRESENTATION TRUTH.
 *
 * The operator rejected a correctness-complete runtime as feeling broken. Three of the reasons were
 * not about speed at all — they were about the surface making FALSE STATEMENTS while it waited:
 *
 *   P0-7.2  the previous child's avatar shown under the newly selected subject (~5.8 s measured)
 *   P0-7.3  the previous lens's rows shown as live destination rows (~3.3 s measured)
 *   P0-7.4  a configured card reserved as an empty bordered box for 8.5 s, reading as failure
 *
 * The invariant these hold: the operator may see prior CONTENT for continuity, but must never see
 * prior IDENTITY presented as the new subject, must never see held content presented as live
 * destination content, and must never see reserved structure that looks broken.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { focusPanelSeedFromQueueRow } from "@/lib/presentation/runtime/focusPanelSeedFromQueueRow";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PANEL = "components/presentation/workUnit/InlineOpportunityFocusPanel.tsx";
const OVERLAY = "lib/adminV2/runtime/focusPanel/overlayChildMissionOntoSettledFocusModel.ts";
const RUNTIME = "lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts";
const GRID = "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx";

/** A production-shaped child queue row: the row the operator clicks, with the photo it renders. */
const childRow = (imageUrl: string | null) =>
    ({
        entityType: "opportunity",
        context: {
            row_subject: { subject_type: "child", display_name: "Ava Wenc", image_url: imageUrl },
            row_stage: "Waitlist",
            drawer_open: { entity_id: "opp-family-1" },
        },
    }) as never;

describe("P0-7.2 — the identity seed carries the image the row is already showing", () => {
    it("the seed exposes the selected row's subject image", () => {
        expect(focusPanelSeedFromQueueRow(childRow("https://img/ava.png"))?.subjectImageUrl).toBe("https://img/ava.png");
    });

    it("a row with no image yields no image — absence is not invented", () => {
        expect(focusPanelSeedFromQueueRow(childRow(null))?.subjectImageUrl).toBeUndefined();
    });

    it("it reads the image by the ROW's own rule, not a second one", () => {
        // `CondensedQueueRow`: focused primary when Subject Focus is set, else the row subject —
        // deliberately with no fallback between them. Same expression, same source.
        const seedSrc = strip(read("lib/presentation/runtime/focusPanelSeedFromQueueRow.ts"));
        const rowSrc = strip(read("components/presentation/workUnit/CondensedQueueRow.tsx"));
        for (const src of [seedSrc, rowSrc]) {
            expect(src).toContain("focus.primary.image_url");
            expect(src).toContain("context.row_subject?.image_url");
        }
    });

    it("carries presentation identity ONLY — no business truth is promoted from a preview", () => {
        const seed = focusPanelSeedFromQueueRow(childRow("https://img/ava.png"))!;
        for (const forbidden of ["attendance", "health", "financial", "balance", "enrolment", "enrollment"]) {
            expect(JSON.stringify(seed).toLowerCase()).not.toContain(forbidden);
        }
        expect(Object.keys(seed).sort()).toEqual(["familyOpportunityId", "statusImageUrlGuard", "subjectImageUrl", "statusLabel", "title"]
            .filter((k) => k !== "statusImageUrlGuard").sort());
    });
});

describe("P0-7.2 — the header avatar is on the CLICK clock, never the held payload", () => {
    const panel = strip(read(PANEL));

    it("THE GATE: the header receives a scope whose image is the SELECTION's", () => {
        expect(panel).toContain("subjectScope={headerSubjectScope}");
        expect(panel).not.toMatch(/OpportunityFocusPanelHeader[\s\S]{0,200}subjectScope=\{subjectScope\}/);
    });

    it("the image prefers the seed, then only a scope that IS this selection", () => {
        expect(panel).toContain("const identityImageUrl = seedSubjectImageUrl ?? (scopeIsThisSelection ? subjectScope?.imageUrl ?? null : null)");
    });

    it("a scope belonging to another subject contributes NOTHING — not even as a fallback", () => {
        // The ternary's else-arm is `null`, not `subjectScope?.imageUrl`. That is the whole repair.
        expect(panel).toMatch(/scopeIsThisSelection \? subjectScope\?\.imageUrl \?\? null : null/);
    });

    it("the selection match is by identity, not by position or recency", () => {
        expect(panel).toContain("subjectScope.participationId === operationalSubjectId");
        expect(panel).toContain("subjectScope.customerMemberId === operationalSubjectId");
    });
});

describe("P0-7.2 — the child overlay no longer launders the prior subject's face", () => {
    const overlay = strip(read(OVERLAY));

    it("THE PLANTED DEFECT'S TARGET: no fallback to the settled scope's image", () => {
        expect(overlay).not.toContain("settled.context.participantScope?.imageUrl");
    });

    it("this child's own photo is still preferred, in order", () => {
        expect(overlay).toContain('child.resolved_photo_url');
        expect(overlay).toContain("childRow?.resolved_photo_url");
        expect(overlay).toContain("childRow?.photo_url");
    });

    it("the scope itself is still the resolver's, not rebuilt", () => {
        expect(overlay).toContain("customerMemberId: childMemberId");
    });
});

describe("P0-7.3 — held rows are marked held, not presented as live", () => {
    const runtime = strip(read(RUNTIME));

    it("THE GATE: the queue reports holding while attention has moved to another lens", () => {
        expect(runtime).toContain("const queueIsHoldingPriorLens =");
        expect(runtime).toContain("desiredLens != null && committedLens != null && desiredLens !== committedLens");
        expect(runtime).toContain("queue: { ...operationalModelFromSnapshot.queue, loading: true }");
    });

    it("it reuses the EXISTING hold treatment rather than inventing a state machine", () => {
        // QueueRegion already renders the hold and the aria-busy from `queue.loading`.
        const region = strip(read("components/presentation/workUnit/QueueRegion.tsx"));
        expect(region).toContain("const holdActive = queue.loading && queue.rows.length > 0");
        expect(runtime).not.toMatch(/useState<.*[Hh]old/);
    });

    it("the lens is read reactively, from the same attention subscription as the subject", () => {
        const hook = strip(read("lib/runtime/kernel/useAttentionCardFocus.ts"));
        expect(hook).toContain("export function useAttentionLens()");
        expect(hook).toContain("ref?.lens ?? null");
        expect(runtime).toContain("const desiredLens = useAttentionLens()");
    });

    it("when the lenses AGREE the model is untouched — the ordinary case is unchanged", () => {
        expect(runtime).toContain("? {\n                      ...operationalModelFromSnapshot,");
        expect(runtime).toContain(": operationalModelFromSnapshot,");
    });

    it("the snapshot model still states its own truth — this narrows presentation, not the snapshot", () => {
        const snap = strip(read("lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot.ts"));
        expect(snap).toContain("loading: false");
    });
});

describe("P0-7.4 — a reserved cell resolves visibly, and still asserts nothing", () => {
    const grid = strip(read(GRID));

    it("THE GATE: a settling reserved cell says what it is resolving", () => {
        expect(grid).toContain("data-focus-panel-cell-resolving={typeKey}");
        expect(grid).toContain("`Resolving ${title.toLowerCase()}…`");
    });

    it("only the SETTLING reserve — a resolved not-applicable cell never claims to be arriving", () => {
        expect(grid).toContain("{!settled && title ? (");
    });

    it("it still invents no values, counts, statuses, bars or shimmer", () => {
        const cell = grid.slice(grid.indexOf("function ReservedFocusPanelCell"), grid.indexOf("type Props = {"));
        for (const forbidden of ["animate-pulse", "shimmer", "h-3 w-", "h-3.5 w-", "0 children", "No "]) {
            expect(cell).not.toContain(forbidden);
        }
    });

    it("the cell keeps its identity, geometry and card key", () => {
        expect(grid).toContain('data-focus-panel-cell-reserved={settled ? undefined : "true"}');
        expect(grid).toContain('minHeight: "7.5rem"');
        expect(grid).toContain("data-focus-panel-cell-preparing={settled ? undefined : typeKey}");
    });
});

describe("architecture guards — no new engine, cache, or subject system", () => {
    it("no new cache, reveal engine or subject store was added", () => {
        for (const f of [PANEL, RUNTIME, GRID, OVERLAY]) {
            const src = strip(read(f));
            expect(src).not.toMatch(/new Map\(\)\s*;\s*\/\/\s*cache/i);
            expect(src).not.toContain("localStorage");
        }
    });

    it("card readiness and admission are untouched by this slice", () => {
        const specs = strip(read("lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards.ts"));
        expect([...specs.matchAll(/key: "([a-z_]+)"/g)].map((m) => m[1]).sort()).toEqual(
            ["business_process", "children", "current_work", "household", "readiness_kpi"].sort(),
        );
    });

    it("no structural-commit gate was touched — that is Slice 10", () => {
        const panel = strip(read(PANEL));
        expect(panel).toContain("operationallyResolved");
        const host = strip(read("lib/experience/surfaceHost/SurfaceHostContext.tsx"));
        expect(host).toContain("showWorkUnit");
    });
});
