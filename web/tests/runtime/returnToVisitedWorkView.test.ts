import { describe, expect, it } from "vitest";
import { AttentionOwner, ATTENTION_SCOPE } from "@/lib/runtime/kernel/attention";
import { ProvisioningRuntime, type EntryResource } from "@/lib/runtime/kernel/provisioning";
import { FocusOwner } from "@/lib/runtime/kernel/focus";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/**
 * PLANT 6 — RETURNING TO A WORK VIEW THE SESSION HAS ALREADY VISITED.
 *
 * Measured on deployed d2776af1 with real pills and real queue rows: the FIRST visit to a view always
 * commits, and a RETURN to a view visited earlier in the same session never does. Clicking again does
 * not rescue it. Every failing click still lights the pill within ~150ms, so the operator is left
 * reading the previous view's rows under the new view's name.
 *
 * This drives the REAL kernel chain — AttentionOwner, ProvisioningRuntime, FocusOwner, wired the way
 * the runtime wires them — rather than a fixture, because the whole question is which of those three
 * declines to re-commit. A stub here would prove only that the stub agrees with me.
 *
 * Visited is not current: reusing a cached snapshot is allowed, reusing stale navigation authority
 * is not.
 */
const IDENT = { tenant: "org-1", principal: "user-1" };

/** An answer that NAMES the lens it was produced for, so a committed snapshot can be attributed. */
const answerForLens = (lens: string): ProvisioningAnswer =>
    ({
        terminal: "operational",
        orgId: "org-1",
        workUnit: { id: "wu", key: "new_leads", name: "New Leads" },
        businessProcess: { key: "enrollment", name: "Enrollment" },
        activeWorkView: { id: lens, label: lens },
        lensSet: [
            { id: "waitlist", label: "Waitlist" },
            { id: "all", label: "All" },
        ],
        rowGrain: "family",
        rows: [{ id: `row-${lens}`, stageKey: "lead", statusKey: "open", updatedAt: null, title: lens }],
        recordOfAttention: { id: `row-${lens}`, strategy: "first_row", strategySource: "declared_fallback" },
        recordOfTruth: { entityType: "opportunity", id: `row-${lens}` },
        contextFrame: { workViewId: lens, workViewLabel: lens },
        focusPanelScopeState: "in_scope",
        currentBusinessState: { stageKey: "lead", stageLabel: "New Lead", purpose: "p", workTemplateKey: "t", workTemplateLabel: "T", required: true },
        primaryAction: { actionRef: "quick_message", label: "Contact", workTemplateKey: "t" },
        presentation: { queueLayoutId: null, focusPanelLayoutId: null, rowVariant: "crm_compact" },
        timings: { authorization_ms: 0, work_unit_ms: 0, configuration_ms: 0, records_ms: 0, projection_ms: 0, composition_ms: 0, total_ms: 1 },
    }) as unknown as ProvisioningAnswer;

/** The kernel, wired as the runtime wires it: movement drives preparation, terminal drives commit. */
function harness() {
    const prepared: string[] = [];
    const entry: EntryResource = ((ref: { lens?: string | null; destination?: { workViewId?: string | null } | null }) => {
        const lens = ref?.destination?.workViewId ?? ref?.lens ?? "new_leads";
        prepared.push(String(lens));
        return Promise.resolve(answerForLens(String(lens)));
    }) as unknown as EntryResource;

    const attention = new AttentionOwner();
    const staleCommitsPrevented: number[] = [];
    const focus = new FocusOwner({ onStaleCommitPrevented: () => staleCommitsPrevented.push(1) });
    /*
     * WIRED EXACTLY AS PRODUCTION WIRES IT, and this is the whole point of the plant.
     *
     * `RuntimeKernelContext` feeds Focus from the `onTerminal` instrumentation hook ONLY, and
     * discards the value the preparation promise resolves with (`.then(() => notify())`). A first
     * harness here awaited that promise and fed Focus from it, which is strictly more generous than
     * the runtime — and it passed, hiding the defect. A test must not be kinder than the caller it
     * stands in for.
     */
    const k2 = new ProvisioningRuntime({
        entryResource: entry,
        deadlineMs: 5000,
        instrumentation: { onTerminal: (t) => focus.onPreparationTerminal(t) },
    });

    attention.hydrate({ ...IDENT, target: "new-leads", lens: "new_leads", source: "direct_url" });
    const hydrated = attention.get()!;
    focus.onAttentionMoved(hydrated);

    const drive = async (ref: ReturnType<AttentionOwner["get"]>) => {
        focus.onAttentionMoved(ref!);
        await k2.onAttentionMoved({ ref: ref! } as never);
        await Promise.resolve();
    };

    return { attention, k2, focus, drive, prepared, staleCommitsPrevented, hydrated };
}

const committedLens = (focus: FocusOwner): string | null => {
    const snap = focus.get().current?.snapshot as { activeWorkView?: { id?: string } } | undefined;
    return snap?.activeWorkView?.id ?? null;
};

describe("returning to a visited work view", () => {
    it("commits the FIRST visit to each view", async () => {
        const h = harness();
        await h.drive(h.hydrated);
        h.attention.move({ scope: ATTENTION_SCOPE.LENS, lens: "waitlist", source: "work_view_selection" });
        await h.drive(h.attention.get());
        expect(committedLens(h.focus)).toBe("waitlist");

        h.attention.move({ scope: ATTENTION_SCOPE.LENS, lens: "all", source: "work_view_selection" });
        await h.drive(h.attention.get());
        expect(committedLens(h.focus)).toBe("all");
    });

    it("PLANT 6 — commits a RETURN to a view already visited this session", async () => {
        const h = harness();
        await h.drive(h.hydrated);
        for (const lens of ["waitlist", "all", "waitlist"]) {
            h.attention.move({ scope: ATTENTION_SCOPE.LENS, lens, source: "work_view_selection" });
            await h.drive(h.attention.get());
        }
        /*
         * Waitlist → All → Waitlist. The operator's last explicit intent is Waitlist, so Waitlist is
         * what must be committed. Reuse of the cached Waitlist snapshot is fine and expected; what is
         * not fine is the committed navigation authority staying on All.
         */
        expect(committedLens(h.focus)).toBe("waitlist");
        expect(h.staleCommitsPrevented.length, "a return must not be refused as a stale commit").toBe(0);
    });

    it("PLANT 4 — a reused answer for an older lens cannot commit over a newer explicit lens", async () => {
        /*
         * THE RISK THE REPAIR ITSELF INTRODUCES.
         *
         * Making the reuse branch emit means a cached answer now reaches the commit path. If that
         * emission ignored supersession it would be strictly worse than the bug it fixes: a stale
         * Work View could repaint over the one the operator just chose. Latest explicit intent wins,
         * and the reuse path must obey that exactly as a fresh preparation does.
         */
        const h = harness();
        await h.drive(h.hydrated);
        for (const lens of ["waitlist", "all"]) {
            h.attention.move({ scope: ATTENTION_SCOPE.LENS, lens, source: "work_view_selection" });
            await h.drive(h.attention.get());
        }
        expect(committedLens(h.focus)).toBe("all");

        // The operator is on All. Replay the cached WAITLIST preparation WITHOUT moving attention —
        // a late answer for a view already left. It must not become the committed view.
        const stale = h.attention.get()!;
        void stale;
        await h.k2.prepare({
            ...h.attention.get()!,
            lens: "waitlist",
            destination: { workUnitId: "wu", workViewId: "waitlist", subjectId: null, focusMode: null },
            version: 1,
        } as never);
        await Promise.resolve();
        expect(committedLens(h.focus), "a late lens answer must not replace the committed one").toBe("all");
    });

    it("PLANT — HOVER WARMS AND DOES NOT NAVIGATE, even for a view already visited", async () => {
        /*
         * The other edge of the reuse repair, reported from staging as "hovering a Work View pill
         * changes to it".
         *
         * `prepareOperationalDestination` builds its LENS ref by spreading the CURRENT attention, so
         * the terminal carries the committed attention's own version. K3's staleness guard compares
         * versions, finds them EQUAL, and commits — so once reuse began redelivering through
         * onTerminal, a hover could commit the hovered view's snapshot with no click at all.
         *
         * Warming must still work: the answer has to land in the cache so the click that follows
         * consumes it. Only the commit is forbidden.
         */
        const h = harness();
        await h.drive(h.hydrated);
        h.attention.move({ scope: ATTENTION_SCOPE.LENS, lens: "waitlist", source: "work_view_selection" });
        await h.drive(h.attention.get());
        expect(committedLens(h.focus)).toBe("waitlist");

        const committedRef = h.attention.get()!;
        const preparedBefore = h.prepared.length;
        const hoverRef = (lens: string) => ({
            ...committedRef, lens, scope: ATTENTION_SCOPE.LENS, subject: null,
            destination: committedRef.destination
                ? { ...committedRef.destination, workViewId: lens, subjectId: null, focusMode: null }
                : null,
        });
        await h.k2.prepare(hoverRef("all") as never, { speculative: true });
        await Promise.resolve();
        expect(committedLens(h.focus), "hover must not commit the hovered view").toBe("waitlist");
        expect(h.prepared.length, "hover must still warm").toBeGreaterThan(preparedBefore);

        // A hover over a view ALREADY WARMED — the cached path — must also not commit.
        await h.k2.prepare(hoverRef("all") as never, { speculative: true });
        await Promise.resolve();
        expect(committedLens(h.focus), "a cached hover must not commit either").toBe("waitlist");
    });

    it("PLANT — the warmed answer is CONSUMED by the click that follows", async () => {
        /*
         * Fixing hover by refusing to warm would trade one defect for another. The warm must be keyed
         * EXACTLY as the movement it is warming: `attention.move` at LENS scope carries the previous
         * destination forward and re-points its workViewId, so the warm does the same. A first
         * version of this test invented a destination the click would never produce, keyed the warm
         * under a different work unit, and failed for its own reason rather than the product's.
         */
        const h = harness();
        await h.drive(h.hydrated);
        const ref = h.attention.get()!;
        await h.k2.prepare({
            ...ref, lens: "waitlist", scope: ATTENTION_SCOPE.LENS, subject: null,
            destination: ref.destination
                ? { ...ref.destination, workViewId: "waitlist", subjectId: null, focusMode: null }
                : null,
        } as never, { speculative: true });
        const afterWarm = h.prepared.length;

        h.attention.move({ scope: ATTENTION_SCOPE.LENS, lens: "waitlist", source: "work_view_selection" });
        await h.drive(h.attention.get());
        expect(committedLens(h.focus), "the click must still commit").toBe("waitlist");
        expect(h.prepared.length, "the click must reuse the warm, not refetch").toBe(afterWarm);
    });

    it("PLANT 2 — a SUBJECT movement cannot express a lens change", () => {
        // Structural, not behavioural: the subject scope inherits lens/target from the previous ref,
        // so selecting a row has no shape in which it could carry a Work View.
        const h = harness();
        h.attention.move({ scope: ATTENTION_SCOPE.LENS, lens: "waitlist", source: "work_view_selection" });
        const beforeLens = h.attention.get()!.lens;
        h.attention.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "row-9", source: "queue_row" } as never);
        expect(h.attention.get()!.lens, "subject selection must inherit the lens, never set it").toBe(beforeLens);
        expect(h.attention.get()!.subject).toBe("row-9");
    });
});
