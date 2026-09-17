/**
 * STRUCTURAL COMMIT (P0-7.1) — structure and meaning are two questions, and they now have two gates.
 *
 * ── WHAT THE DEPLOYED MEASUREMENT ACTUALLY FOUND ──
 *
 * Measured on deployed `96448f5d8`, cold Work Unit entry, 120 ms sampling:
 *
 *   813 ms      first non-blank — the word "Thinking", and a 37-character document
 *   813–12,862  the SAME thing: zero grid areas, zero cards, zero queue rows, zero Work View pills
 *   12,991 ms   destination shell, pills, queue rows, provisioned surface, published structure,
 *               first configured cell and first critical meaning — ALL in one frame
 *   21,012 ms   the two reserved cells become real cards
 *
 * Two of the three things this slice was sent to fix turned out to be ALREADY CORRECT, and the
 * measurement is what established that rather than a reading of the source:
 *
 *   · the critical cards do NOT arrive card-by-card. Business Process, Financials, Attendance and
 *     Health & Safety all become meaningful in the SAME frame — a critical coherence window of 0 ms.
 *   · there is NO late structural mounting. At 13,243 ms the composition is already complete: four
 *     painted cards plus two RESERVED cells carrying "Resolving children…" and "Resolving household…".
 *     Those reserved cells simply do not carry `data-universal-card-key`, so a naive cell census
 *     reports them as appearing at 21,012 ms. They were there the whole time, holding their
 *     geometry, exactly as P0-7.4 requires.
 *
 * What is NOT already correct is the 12.2 seconds before any of it — and the predicate below is the
 * half of that this slice can honestly move.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    isOperationallyResolved,
    isStructurallyResolved,
    isSemanticallyResolved,
} from "@/components/presentation/workUnit/OperationalSubjectContext";

const PANEL = readFileSync(
    join(process.cwd(), "components/presentation/workUnit/InlineOpportunityFocusPanel.tsx"),
    "utf8",
);
const HOST = readFileSync(join(process.cwd(), "lib/experience/surfaceHost/SurfaceHostContext.tsx"), "utf8");
const SHELL = readFileSync(
    join(process.cwd(), "components/admin/workspace/AlloyOperationalBootShell.tsx"),
    "utf8",
);

/** A subject carrying only the fields these predicates are entitled to read. */
function subject(over: Record<string, unknown> = {}) {
    return {
        subjectId: null, attentionKind: "operational", entityType: null, subjectGrain: null,
        identitySeed: null, situation: null, decision: null, action: null, actionAbsence: null,
        stageWorkRuntime: null, operationalProjection: null, workIntentRuntime: null,
        subjectIdentityTruth: null, summaryDocSeed: null,
        ...over,
    } as never;
}
const PUBLISHED = { doc: null } as never;
const SITUATION = { stageKey: "waitlist", stageLabel: "Waitlist", purpose: null } as never;

describe("structural readiness asks a structural question", () => {
    it("THE GATE: structure needs the subject and the PUBLISHED COMPOSITION — nothing else", () => {
        expect(isStructurallyResolved(subject({ subjectId: "s1", summaryDocSeed: PUBLISHED }))).toBe(true);
        // No action, no situation, no stage work, no identity truth — and structure is still known,
        // because none of those decide what cells the surface has.
        expect(isStructurallyResolved(subject({ subjectId: "s1", summaryDocSeed: PUBLISHED, situation: null, action: null }))).toBe(true);
    });

    it("THE GATE: with no published composition, structure is NOT resolved — nothing is fabricated", () => {
        // The audit is explicit that the real composition does not exist before the answer. Returning
        // true here would licence a skeleton grid, which is the false construction the invariant bans.
        expect(isStructurallyResolved(subject({ subjectId: "s1", summaryDocSeed: null }))).toBe(false);
        expect(isStructurallyResolved(subject({ subjectId: null, summaryDocSeed: PUBLISHED }))).toBe(false);
    });

    it("THE GATE: the branch that was withheld — family grain, a situation, no action, no absence", () => {
        // This is an ordinary state: a family-grain subject at a stage that configures no action.
        // `isOperationallyResolved` answers false for it, and that answer used to decide whether the
        // REAL configured structure could be presented at all.
        const s = subject({
            subjectId: "fam-1",
            subjectGrain: { grain: "family", subjectType: "opportunity" },
            situation: SITUATION,
            action: null,
            actionAbsence: null,
            summaryDocSeed: PUBLISHED,
        });
        expect(isOperationallyResolved(s), "semantic answer is genuinely 'not yet'").toBe(false);
        expect(isStructurallyResolved(s), "but the structure is already known").toBe(true);
    });

    it("the semantic predicate is UNCHANGED — this slice added a gate, it did not move one", () => {
        // Pinned in both directions, because 7.2–7.5 are deployed against this exact behaviour.
        expect(isOperationallyResolved(subject({ attentionKind: "contextual", subjectId: "c1" }))).toBe(true);
        expect(isOperationallyResolved(subject({ attentionKind: "contextual", subjectId: null }))).toBe(false);
        expect(isOperationallyResolved(subject({ subjectId: "s", situation: null }))).toBe(false);
        expect(isOperationallyResolved(subject({ subjectId: "s", situation: SITUATION, action: { actionRef: "a", label: "A" } }))).toBe(true);
        expect(isOperationallyResolved(subject({ subjectId: "s", situation: SITUATION, actionAbsence: { code: "none", message: "m" } }))).toBe(true);
        expect(isOperationallyResolved(subject({ subjectId: "s", situation: SITUATION, subjectGrain: { grain: "child", subjectType: "customer_member" } }))).toBe(true);
        expect(isOperationallyResolved(subject({ subjectId: "s", situation: SITUATION, subjectGrain: { grain: "family", subjectType: "opportunity" } }))).toBe(false);
        // …and the alias is exactly it, never a second implementation that can drift.
        for (const s of [subject({ subjectId: "s", situation: SITUATION }), subject({ subjectId: null })]) {
            expect(isSemanticallyResolved(s)).toBe(isOperationallyResolved(s));
        }
    });
});

describe("the panel presents structure on the structural gate", () => {
    it("THE GATE: the body renders when structure is resolved, not only when meaning is", () => {
        const gate = /: resolved \|\| heldPrior \|\| operationallyResolved \|\| structurallyResolved \?/;
        expect(PANEL).toMatch(gate);
    });

    it("THE GATE: commit-critical is built under structural resolution, so structure never commits an empty shell", () => {
        // Presenting the grid with no commit-critical input would be a configured surface that says
        // nothing — construction without content, which is the failure mode, not the fix.
        expect(PANEL).toMatch(/operationallyResolved \|\| structurallyResolved\s*\n\s*\? \{/);
    });

    it("the structural phase is reported distinctly, so a timeline can see it", () => {
        expect(PANEL).toContain('structurallyResolved ? "published-structure"');
    });

    it("structure is never gated on action or stage work in this panel's reveal decision", () => {
        const decl = PANEL.slice(PANEL.indexOf("const structurallyResolved"), PANEL.indexOf("const structurallyResolved") + 120);
        expect(decl).not.toMatch(/action|stageWork|situation/);
    });
});

describe("PHASE 0 — the pre-commit window names the destination", () => {
    it("THE GATE: the surface host hands the boot shell the destination it already knows", () => {
        expect(HOST).toMatch(/destination=\{\{/);
        expect(HOST).toContain("workUnitSlug:");
        expect(HOST).toContain("workViewId: desired?.lens ?? null");
    });

    it("THE GATE: the destination comes from the route and desired attention — no new read", () => {
        // Phase 0 must cost nothing. Both facts are authoritative the instant the gesture happens.
        expect(HOST).toContain("const routeRef = surfaceRefFromPath(pathname)");
        const block = HOST.slice(HOST.indexOf("destination={{"), HOST.indexOf("destination={{") + 400);
        expect(block).not.toMatch(/fetch|useQuery|await|api\//);
    });

    it("THE GATE: the shell shows no business fact — no counts, no statuses, no configured labels", () => {
        const content = SHELL.slice(SHELL.indexOf('if (chrome === "content")'), SHELL.indexOf("data-destination-work-view"));
        // Only the slug, the subject the seed already knew, and the retained Thinking owner.
        expect(content).toContain("destinationName");
        expect(content).not.toMatch(/count|status|stage|Enrolling|records/i);
    });

    it("the single Thinking owner is RETAINED — Phase 0 adds evidence, it does not claim readiness", () => {
        expect(SHELL).toContain("<AlloyThinkingLabel size=\"lg\" />");
    });

    it("no card structure may be fabricated in the pre-commit window", () => {
        const content = SHELL.slice(SHELL.indexOf('if (chrome === "content")'), SHELL.indexOf("return (", SHELL.indexOf("data-destination-work-view")));
        for (const forbidden of ["data-universal-card-key", "data-fp-grid-area", "focus-panel-grid", "UniversalCard"]) {
            expect(content).not.toContain(forbidden);
        }
    });
});

describe("what the deployed baseline already satisfies — pinned so a repair cannot undo it", () => {
    it("reserved cells hold configured structure, which is why there is no late mount", () => {
        // The 21,012 ms 'appearance' of children/household is a census artifact: a reserved cell has
        // no `data-universal-card-key`. The cell itself exists from the structure commit, and that is
        // what makes the no-late-mount contract already true on the deployed build.
        const grid = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"),
            "utf8",
        );
        expect(grid).toContain("data-focus-panel-cell-reserved");
        expect(grid).toContain("data-focus-panel-cell-resolving");
    });
});
