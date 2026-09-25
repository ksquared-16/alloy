import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
const SURFACE = read("components/presentation/workUnit/ProvisionedWorkUnitSurface.tsx");
const PANEL = read("components/presentation/workUnit/InlineOpportunityFocusPanel.tsx");

/** The provider's prop block — where identity and facts are handed to the Focus Panel. */
function providerBlock(): string {
    const a = SURFACE.indexOf("<OperationalSubjectProvider");
    const b = SURFACE.indexOf("<WorkUnitSurfaceBodyFromModel", a);
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    return SURFACE.slice(a, b);
}

/**
 * OX SLICE 7 — PROGRESSIVE AUTHORITATIVE COMMIT.
 *
 * Measured on deployed eb896a8c: the selected subject reached the panel only when the provisioning
 * answer completed (14/14 samples within ~2ms of it, P50 ~1,094ms), and the panel then held the
 * PRIOR subject until the new VM was complete (~1,052ms). Both are the same policy — wait for a
 * complete answer before showing anything — and together they are essentially the whole J5 wait.
 *
 * Identity and configured geometry may now commit immediately. Facts may not. These pin that line,
 * because crossing it trades a correctness guarantee for latency, which is the worse bargain.
 */
describe("progressive authoritative commit", () => {
    it("the committed subject is the SELECTED record, not the answer's record", () => {
        const blk = providerBlock();
        expect(blk).toContain("subjectId={selectedSubjectId ?? (contextual ? contextual.subject.id : null)}");
        // The old binding made identity wait for the answer. It must not come back.
        expect(blk).not.toContain("subjectId={op ? op.recordOfAttention.id");
        expect(blk).not.toContain("subjectId={factsOp ? factsOp.recordOfAttention.id");
    });

    it("selection identity comes from attention, falling back to the answer", () => {
        expect(SURFACE).toContain("attentionSubject ?? (op ? String(op.recordOfAttention.id) : null)");
    });

    it("facts are gated on the answer actually describing the selected subject", () => {
        expect(SURFACE).toContain("const answerDescribesSelection =");
        expect(SURFACE).toContain("String(op.recordOfAttention.id) === String(selectedSubjectId)");
        expect(SURFACE).toContain("const factsOp = answerDescribesSelection ? op : null;");
    });

    it("NO FACT PROP READS THE RAW ANSWER — this is the leak that would put A's values under B", () => {
        const blk = providerBlock();
        // Every fact must flow through `factsOp`. A bare `op` guard in this block means a value
        // belonging to the previous subject can render beneath the new subject's identity.
        const bareOp = [...blk.matchAll(/(?<![A-Za-z])op(?=[?.&\s])/g)].map((m) => m[0]);
        expect(bareOp, `bare 'op' references left in the provider block: ${bareOp.length}`).toEqual([]);
    });

    it("configured geometry is retained across the switch — it is layout, not truth", () => {
        expect(SURFACE).toContain("summaryDocSeed={retainedSummaryDoc}");
        expect(SURFACE).toContain("lastSummaryDocRef");
        // Retained from the published composition only; never from a record's business fields.
        expect(SURFACE).toContain("op?.focusPanelSummaryDoc ?? lastSummaryDocRef.current");
    });

    it("the prior subject is held only while it IS the committed subject", () => {
        expect(PANEL).toContain("const heldPriorMatchesCommittedSubject =");
        expect(PANEL).toContain("String(displayVm.entity.id) === String(operationalSubjectId)");
        expect(PANEL).toContain("&& heldPriorMatchesCommittedSubject ?");
    });

    it("an unconditional hold cannot return — that is what painted A under B", () => {
        // The exact prior expression, which held the previous payload regardless of selection.
        expect(PANEL).not.toMatch(
            /const heldPrior =\s*!resolved && holdPriorPayload && displayVm != null && record != null \?\s*\{ displayVm, record \}/,
        );
    });

    it("the identity-safe frame still has a published-structure body source to fall to", () => {
        // With the hold released, the panel must land on configured geometry with unresolved
        // meaning — not on a cold loader, and not on a fabricated composition.
        expect(PANEL).toContain('structurallyResolved ? "published-structure"');
        expect(PANEL).toContain('operationallyResolved ? "commit-critical-seed"');
    });

    it("prior slice wins are untouched", () => {
        const RECORD_WORK = read("lib/presentation/runtime/useRecordWorkRuntime.ts");
        const WU = read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts");
        // Slice 2: the warm VM is consumed in the consumer's own scope.
        expect(RECORD_WORK).toContain("loadOpportunityDrawerViaViewModel(id, warmContext)");
        // Slice 3: the reveal gate is armed synchronously at selection.
        const open = WU.slice(WU.indexOf("const openRecord"));
        expect(open.indexOf("beginWorkUnitPrimaryReveal();")).toBeLessThan(open.indexOf("kernel.attention.move("));
        // Slice 4: non-active mode prewarm still defers through the canonical scheduler.
        expect(read("lib/adminV2/runtime/focusPanel/useFocusPanelModePrewarm.ts"))
            .toContain('reason: "focus_panel_mode_prewarm"');
    });
});
