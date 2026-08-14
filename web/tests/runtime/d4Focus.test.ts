/**
 * D4 — K3 Focus state machine.
 *
 * Governing: docs/platform/runtime/alloy-runtime-kernel.md §K3 (:232–289).
 *   commit atomically on preparation.terminal and NOTHING else · never shown before Operational
 *   · no surface destroyed before its successor is Operational · promotion is a role change, never a
 *   rebuild · Focus never fetches · Focus never un-commits.
 */
import { describe, it, expect, vi } from "vitest";
import { AttentionOwner, ATTENTION_SCOPE, urlFromAttention, type AttentionRef } from "@/lib/runtime/kernel/attention";
import { FocusOwner, surfaceIdFor } from "@/lib/runtime/kernel/focus";
import type { PreparationTerminal, PreparationOutcome } from "@/lib/runtime/kernel/provisioning";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { selectedWorkViewId } from "@/lib/runtime/provisioning/contextualFocusAnswer";

const IDENT = { tenant: "org-1", principal: "user-1" };

/**
 * ProvisioningAnswer is a discriminated union. `error` carries neither field, and `contextual` carries
 * `activeWorkView: null` with no Context Frame at all — it was entered from no Work View.
 *
 * `lensOf` reads the lens through the canonical accessor, so this file cannot develop its own opinion
 * about what "no lens" means. `frameOf` narrows POSITIVELY to the two terminals that page a cohort
 * rather than to "not an error" — the latter was right only while every non-error terminal had a lens.
 */
const lensOf = (s: Readonly<ProvisioningAnswer> | undefined) => selectedWorkViewId(s);
const frameOf = (s: Readonly<ProvisioningAnswer> | undefined) =>
    s && (s.terminal === "operational" || s.terminal === "empty") ? s.contextFrame.workViewId : null;

const snapshot = (outcome: PreparationOutcome, lens = "new_leads"): ProvisioningAnswer =>
    ({
        terminal: outcome,
        orgId: "org-1",
        workUnit: { id: "wu", key: "new_leads", name: "New Leads" },
        businessProcess: { key: "enrollment", name: "Enrollment" },
        activeWorkView: { id: lens, label: lens },
        lensSet: [{ id: "new_leads", label: "New Leads", displayOrder: 1 }, { id: "tours", label: "Tours", displayOrder: 2 }],
        rowGrain: "family",
        rows: outcome === "operational" ? [{ id: "opp-1", stageKey: "lead", statusKey: "open", updatedAt: null, title: "A" }] : [],
        recordOfAttention: outcome === "operational" ? { id: "opp-1", strategy: "first_row", strategySource: "declared_fallback" } : null,
        recordOfTruth: { entityType: "opportunity", id: "opp-1" },
        contextFrame: { workViewId: lens, workViewLabel: lens },
        focusPanelScopeState: "in_scope",
        currentBusinessState: { stageKey: "lead", stageLabel: "New Lead", purpose: "p", workTemplateKey: "contact_family", workTemplateLabel: "Contact Family", required: true },
        primaryAction: { actionRef: "quick_message", label: "Contact Family", workTemplateKey: "contact_family" },
        presentation: { queueLayoutId: null, focusPanelLayoutId: null, rowVariant: "crm_compact" },
        code: "records_unavailable",
        message: "boom",
        timings: { authorization_ms: 0, work_unit_ms: 0, configuration_ms: 0, records_ms: 0, projection_ms: 0, composition_ms: 0, total_ms: 1 },
    }) as unknown as ProvisioningAnswer;

const terminal = (ref: AttentionRef, outcome: PreparationOutcome = "operational", lens?: string): PreparationTerminal => ({
    key: "k",
    outcome,
    snapshot: Object.freeze(snapshot(outcome, lens ?? ref.lens ?? "new_leads")),
    attentionVersion: ref.version,
    durationMs: 10,
});

function rig() {
    const o = new AttentionOwner();
    const instr = {
        onYieldStart: vi.fn(), onTransitionLegible: vi.fn(), onTerminalReceived: vi.fn(),
        onCommitStarted: vi.fn(), onCommitCompleted: vi.fn(), onStaleCommitPrevented: vi.fn(),
        onUrlProjected: vi.fn(), onSurfaceRetained: vi.fn(), onRecovered: vi.fn(),
    };
    const k3 = new FocusOwner(instr, (r) => urlFromAttention(r));
    o.subscribe((e) => k3.onAttentionMoved(e.ref));
    return { o, k3, instr };
}

describe("D4 — K3 Focus", () => {
    it("1. Workspace → Work Unit reaches Operational Commit", () => {
        const { o, k3 } = rig();
        const ref = o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "direct_url" });
        expect(k3.get().current).toBeNull(); // nothing shown before a terminal
        expect(k3.onPreparationTerminal(terminal(ref))).toBe(true);
        expect(k3.get().phase).toBe("stable");
        expect(k3.get().current?.outcome).toBe("operational");
    });

    it("4. the destination is INVISIBLE before a terminal outcome — no phase renders it", () => {
        const { o, k3 } = rig();
        o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "direct_url" });
        o.move({ scope: ATTENTION_SCOPE.SURFACE, target: "tours", source: "pointer" });
        // Attention is ahead of focus; nothing of the destination exists in the visible world.
        expect(k3.get().incoming).toBeNull();
        expect(k3.get().current).toBeNull(); // cold boot: still nothing committed
        expect(["yielding", "awaiting_terminal"]).toContain(k3.get().phase);
    });

    it("2-3. the outgoing Workspace is RETAINED and yields — never blanked, never destroyed early", () => {
        const { o, k3, instr } = rig();
        const first = o.hydrate({ ...IDENT, target: "workspace", lens: "new_leads", source: "direct_url" });
        k3.onPreparationTerminal(terminal(first));
        const wsSurface = k3.get().current!;

        o.move({ scope: ATTENTION_SCOPE.SURFACE, target: "new_leads", source: "pointer" });
        // The Workspace is still TRUE and still held. Art 3.4: no surface destroyed before its
        // successor is Operational.
        expect(k3.get().outgoing).toBe(wsSurface);
        expect(k3.get().phase).toBe("yielding");
        expect(instr.onYieldStart).toHaveBeenCalledTimes(1);
        expect(k3.get().current).toBe(wsSurface); // still what the operator sees

        k3.markYieldLegible();
        expect(k3.get().phase).toBe("awaiting_terminal"); // held, mounted, non-interactive
        expect(k3.get().outgoing).toBe(wsSurface); // STILL not destroyed
    });

    it("5-8. the commit is ONE atomic transaction — header/queue/panel cannot commit separately", () => {
        const { o, k3, instr } = rig();
        const ref = o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "direct_url" });
        k3.onPreparationTerminal(terminal(ref, "operational"));
        const s = k3.get().current!;
        // They are FIELDS OF ONE FROZEN SNAPSHOT — there is no API by which they could arrive apart.
        expect(Object.isFrozen(s.snapshot)).toBe(true);
        if (s.snapshot.terminal !== "operational") throw new Error("expected operational");
        expect(s.snapshot.workUnit).toBeDefined();
        expect(s.snapshot.rows.length).toBeGreaterThan(0);
        expect(s.snapshot.currentBusinessState).toBeDefined();
        expect(s.snapshot.primaryAction).toBeDefined();
        // outgoing released only at commit, in the same transaction
        expect(k3.get().outgoing).toBeNull();
        expect(instr.onCommitStarted).toHaveBeenCalledTimes(1);
        expect(instr.onCommitCompleted).toHaveBeenCalledTimes(1);
    });

    it("9. the first visible destination frame is already operational", () => {
        const { o, k3 } = rig();
        const ref = o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "direct_url" });
        // Before terminal: no frame at all. After terminal: the frame IS operational. There is no
        // third state in which a frame exists but is not operational.
        expect(k3.get().current).toBeNull();
        k3.onPreparationTerminal(terminal(ref));
        const s = k3.get().current!;
        expect(s.outcome).toBe("operational");
        if (s.snapshot.terminal !== "operational") throw new Error("expected operational");
        expect(s.snapshot.focusPanelScopeState).toBe("in_scope");
        expect(s.snapshot.rowGrain).toBe("family");
    });

    it("6. an authoritative empty terminal commits ONE coherent empty surface", () => {
        const { o, k3 } = rig();
        const ref = o.hydrate({ ...IDENT, target: "new_leads", lens: "tours", source: "direct_url" });
        expect(k3.onPreparationTerminal(terminal(ref, "empty"))).toBe(true);
        expect(k3.get().current?.outcome).toBe("empty");
        expect(k3.get().phase).toBe("stable"); // empty is a workable place, fully committed
    });

    it("7. an honest error terminal commits ONE coherent error surface — never rendered as empty", () => {
        const { o, k3 } = rig();
        const ref = o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "direct_url" });
        expect(k3.onPreparationTerminal(terminal(ref, "error"))).toBe(true);
        expect(k3.get().current?.outcome).toBe("error");
        expect(k3.get().current?.outcome).not.toBe("empty");
        expect(k3.get().phase).toBe("stable");
    });

    it("10. the URL is projected FROM committed focus — and may never re-enter as an input", () => {
        const { o, k3, instr } = rig();
        const ref = o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "direct_url" });
        expect(k3.get().projectedUrl).toBeNull(); // nothing projected before commit
        k3.onPreparationTerminal(terminal(ref));
        expect(k3.get().projectedUrl).toBe("/workspace/work-unit/new_leads?work_view_id=new_leads");
        expect(instr.onUrlProjected).toHaveBeenCalledTimes(1);
        expect(() => k3.hydrateProjectedUrl("/anything")).toThrow(/may not re-enter as an input/i);
    });

    it("14. Work View movement preserves the Work Unit shell — no rebuild", () => {
        const { o, k3 } = rig();
        const a = o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "direct_url" });
        k3.onPreparationTerminal(terminal(a));
        const before = k3.get().current!;

        const lens = o.move({ scope: ATTENTION_SCOPE.LENS, lens: "tours", source: "work_view_selection" });
        k3.onPreparationTerminal(terminal(lens, "operational", "tours"));
        const after = k3.get().current!;

        // The surface exchanged (lens is part of surface identity) but the Business Process and the
        // Work Unit are the same; only queue truth and the panel composition changed.
        expect(after.snapshot.terminal !== "error" && after.snapshot.businessProcess.key).toBe("enrollment");
        expect(after.snapshot.terminal !== "error" && after.snapshot.workUnit.key).toBe("new_leads");
        expect(lensOf(after.snapshot)).toBe("tours");
        expect(lensOf(before.snapshot)).toBe("new_leads");
    });

    it("15+23. Record of Attention movement preserves lens/process/Context Frame AND the surface identity", () => {
        const { o, k3, instr } = rig();
        const a = o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "direct_url" });
        k3.onPreparationTerminal(terminal(a));
        const surfaceBefore = k3.get().current!.surfaceId;

        const subj = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-9", source: "subject_selection" });
        // A subject movement is NOT a surface exchange: nothing yields, nothing is retained-as-outgoing.
        expect(k3.get().outgoing).toBeNull();
        expect(instr.onYieldStart).not.toHaveBeenCalled();
        expect(instr.onSurfaceRetained).toHaveBeenCalledWith(surfaceBefore);

        k3.onPreparationTerminal(terminal(subj));
        // SAME surface identity across the movement — zero reconstruction.
        expect(k3.get().current!.surfaceId).toBe(surfaceBefore);
        expect(subj.lens).toBe("new_leads");
        expect(frameOf(k3.get().current!.snapshot)).toBe("new_leads");
    });

    it("19-22. rapid intents: latest wins; a superseded terminal can NEVER commit", () => {
        const { o, k3, instr } = rig();
        const a = o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "direct_url" });
        k3.onPreparationTerminal(terminal(a));

        const stale = o.move({ scope: ATTENTION_SCOPE.LENS, lens: "tours", source: "work_view_selection" });
        const newest = o.move({ scope: ATTENTION_SCOPE.LENS, lens: "follow_up", source: "work_view_selection" });

        // The stale lens terminal arrives LATE — after attention has moved on. It must not commit.
        expect(k3.onPreparationTerminal(terminal(stale, "operational", "tours"))).toBe(false);
        expect(instr.onStaleCommitPrevented).toHaveBeenCalled();
        expect(lensOf(k3.get().current!.snapshot)).not.toBe("tours");

        // The newest commits.
        expect(k3.onPreparationTerminal(terminal(newest, "operational", "follow_up"))).toBe(true);
        expect(lensOf(k3.get().current!.snapshot)).toBe("follow_up");
    });

    it("Focus never un-commits — commitVersion is monotonic and current is never nulled by movement", () => {
        const { o, k3 } = rig();
        const a = o.hydrate({ ...IDENT, target: "workspace", lens: "new_leads", source: "direct_url" });
        k3.onPreparationTerminal(terminal(a));
        const v1 = k3.get().current!.commitVersion;
        o.move({ scope: ATTENTION_SCOPE.SURFACE, target: "new_leads", source: "pointer" });
        expect(k3.get().current).not.toBeNull(); // movement never revokes a commit
        const b = o.get()!;
        k3.onPreparationTerminal(terminal(b));
        expect(k3.get().current!.commitVersion).toBe(v1 + 1);
    });

    it("25-26. Focus has no clock and no DOM — commit has exactly one cause", () => {
        const src = require("fs").readFileSync(
            require("path").join(__dirname, "../../lib/runtime/kernel/focus.ts"), "utf8",
        );
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        for (const forbidden of ["setTimeout", "setInterval", "requestAnimationFrame", "querySelector", "document.", "window.", "next/navigation", "next/router", "useEffect"]) {
            expect(code).not.toContain(forbidden);
        }
        // and it never fetches
        expect(code).not.toMatch(/fetch\(|supabase|QueueService/);
    });

    it("the reload floor answers an inconsistent runtime — not slowness", () => {
        const { o, k3, instr } = rig();
        const a = o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "direct_url" });
        k3.onPreparationTerminal(terminal(a));
        k3.recover("no_terminal_outcome");
        expect(instr.onRecovered).toHaveBeenCalledWith("no_terminal_outcome");
        expect(k3.get().current).toBeNull(); // a deliberate, correct rebuild
        expect(k3.get().desired).not.toBeNull(); // attention survives the floor
    });

    it("surface identity is keyed by (target, lens) — subject is not part of the visible world's identity", () => {
        const base: AttentionRef = {
            ...IDENT, scope: 2, target: "new_leads", lens: "new_leads",
            subject: "opp-1", aspect: null, destination: null, source: "pointer", version: 1,
        };
        expect(surfaceIdFor(base)).toBe(surfaceIdFor({ ...base, subject: "opp-2" }));
        expect(surfaceIdFor(base)).not.toBe(surfaceIdFor({ ...base, lens: "tours" }));
        expect(surfaceIdFor(base)).not.toBe(surfaceIdFor({ ...base, target: "tours" }));
    });
});
