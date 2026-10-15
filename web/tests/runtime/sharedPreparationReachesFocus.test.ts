import { describe, expect, it } from "vitest";
import { AttentionOwner, ATTENTION_SCOPE } from "@/lib/runtime/kernel/attention";
import { ProvisioningRuntime, type EntryResource } from "@/lib/runtime/kernel/provisioning";
import { FocusOwner } from "@/lib/runtime/kernel/focus";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/**
 * E2E-22 — A WARM SELECTION THAT NAMES A CARD NEVER COMMITTED.
 *
 * Measured on deployed 50affaee: Global Search → a child's Waitlist destination, and the Children
 * card's "…'s work →", both stated one focus selection with `card_focus`. The listener turns that into
 * SURFACE → SUBJECT → ASPECT in one tick. Both provisioning answers returned 200 within ~2s, and the
 * surface stayed on "Thinking" for as long as anyone watched. A cold load of the same address (one
 * hydration, one version) rendered.
 *
 * The ASPECT movement shares the SUBJECT preparation (aspect is not part of the key). The dedup branch
 * restamped the shared terminal for the consuming attention — but only on the promise it returned,
 * and Focus is fed from `onTerminal` alone (#1252). So the only terminal Focus ever received carried
 * the SUBJECT version, Focus refused it as superseded by the ASPECT it was waiting for, and nothing
 * else ever arrived.
 *
 * Driven through the real kernel chain, wired exactly as `RuntimeKernelContext` wires it: movement
 * drives preparation, `onTerminal` drives commit, the preparation promise is discarded.
 */
const IDENT = { tenant: "org-1", principal: "user-1" };

const answerFor = (target: string, subject: string | null, settled = false): ProvisioningAnswer =>
    ({
        terminal: "operational",
        orgId: "org-1",
        workUnit: { id: "wu", key: target, name: target },
        activeWorkView: { id: target, label: target },
        lensSet: [],
        rowGrain: "child",
        rows: [{ id: subject ?? "row-default", stageKey: "waitlist", statusKey: "open", updatedAt: null, title: "A" }],
        recordOfAttention: { id: subject ?? "row-default", strategy: "first_row", strategySource: "declared_fallback" },
        recordOfTruth: { entityType: "opportunity", id: "opp-1" },
        contextFrame: { workViewId: target, workViewLabel: settled ? "settled" : target },
        focusPanelScopeState: "in_scope",
        presentation: { queueLayoutId: null, focusPanelLayoutId: null, rowVariant: "crm_compact" },
        timings: { authorization_ms: 0, work_unit_ms: 0, configuration_ms: 0, records_ms: 0, projection_ms: 0, composition_ms: 0, total_ms: 1 },
    }) as unknown as ProvisioningAnswer;

function kernel() {
    const entry: EntryResource = ((ref: { target: string; subject?: string | null }) =>
        new Promise((r) => setTimeout(() => r(answerFor(ref.target, ref.subject ?? null)), 5))) as unknown as EntryResource;
    const attention = new AttentionOwner();
    const focus = new FocusOwner({});
    const k2 = new ProvisioningRuntime({
        entryResource: entry,
        deadlineMs: 5000,
        instrumentation: { onTerminal: (t) => focus.onPreparationTerminal(t) },
    });
    const pending: Promise<unknown>[] = [];
    attention.subscribe((e) => {
        focus.onAttentionMoved(e.ref);
        // The runtime discards what this resolves with; so does the harness.
        pending.push(k2.onAttentionMoved(e).then(() => undefined));
    });
    const settle = async () => {
        await Promise.all(pending);
        await new Promise((r) => setTimeout(r, 20));
    };
    return { attention, focus, settle };
}

describe("E2E-22 — a shared preparation commits for the attention that consumed it", () => {
    it("SURFACE → SUBJECT → ASPECT in one tick commits the subject on the new surface", async () => {
        const { attention, focus, settle } = kernel();
        attention.hydrate({ ...IDENT, target: "all", subject: "opp-family", source: "direct_url" });
        await settle();
        expect(focus.get().current?.ref.target).toBe("all");

        // `useWorkUnitEntryMovement().move(href, null, subject, aspect)` — the warm path.
        attention.move({ scope: ATTENTION_SCOPE.SURFACE, target: "new-work-view-4", lens: null, cohort: null, source: "pointer" });
        attention.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "pi-alpha", source: "subject_selection" });
        attention.move({ scope: ATTENTION_SCOPE.ASPECT, aspect: "card:children|item:cm-alpha", source: "search" });
        const desired = attention.get()!;
        await settle();

        const state = focus.get();
        expect(state.phase).toBe("stable");
        expect(state.current?.ref.version).toBe(desired.version);
        expect(state.current?.ref.target).toBe("new-work-view-4");
        expect(state.current?.ref.subject).toBe("pi-alpha");
        expect(state.current?.ref.aspect).toBe("card:children|item:cm-alpha");
    });

    it("without a card (SURFACE → SUBJECT) it committed before and still does", async () => {
        const { attention, focus, settle } = kernel();
        attention.hydrate({ ...IDENT, target: "all", subject: "opp-family", source: "direct_url" });
        await settle();
        attention.move({ scope: ATTENTION_SCOPE.SURFACE, target: "new-work-view-4", lens: null, cohort: null, source: "pointer" });
        attention.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "pi-alpha", source: "subject_selection" });
        await settle();
        expect(focus.get().phase).toBe("stable");
        expect(focus.get().current?.ref.subject).toBe("pi-alpha");
    });

    it("a speculative warm that shares in-flight work still never reaches Focus", async () => {
        const entry: EntryResource = (() => new Promise((r) => setTimeout(() => r(answerFor("x", null)), 5))) as unknown as EntryResource;
        const seen: number[] = [];
        const k2 = new ProvisioningRuntime({ entryResource: entry, instrumentation: { onTerminal: (t) => seen.push(t.attentionVersion) } });
        const o = new AttentionOwner();
        o.hydrate({ ...IDENT, target: "x", source: "direct_url" });
        const ref = o.get()!;
        const spec = k2.prepare(ref, { speculative: true });
        await k2.prepare({ ...ref, version: ref.version + 1 }, { speculative: true });
        await spec;
        expect(seen).toEqual([]);
    });
});
