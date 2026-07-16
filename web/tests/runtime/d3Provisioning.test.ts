/**
 * D3 — K2 Provisioning Runtime.
 *
 * Governing: docs/platform/runtime/alloy-runtime-kernel.md §K2 (:167–228).
 *   keyed by (scope, target, lens, principal, tenant) · one answer · terminate exactly once
 *   · deadline product is `error` only · a superseded response never lands.
 */
import { describe, it, expect, vi } from "vitest";
import { AttentionOwner, ATTENTION_SCOPE, type AttentionRef } from "@/lib/runtime/kernel/attention";
import {
    ProvisioningRuntime,
    provisioningKey,
    type EntryResource,
    type PreparationTerminal,
} from "@/lib/runtime/kernel/provisioning";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

const IDENT = { tenant: "org-1", principal: "user-1" };

const answer = (terminal: "operational" | "empty" | "error"): ProvisioningAnswer =>
    ({
        terminal,
        orgId: "org-1",
        workUnit: { id: "wu", key: "new_leads", name: "New Leads" },
        businessProcess: { key: "enrollment", name: "Enrollment" },
        activeWorkView: { id: "new_leads", label: "New Leads" },
        lensSet: [],
        rowGrain: "family",
        rows: terminal === "operational" ? [{ id: "opp-1", stageKey: "lead", statusKey: "open", updatedAt: null, title: "A" }] : [],
        recordOfAttention: terminal === "operational" ? { id: "opp-1", strategy: "first_row", strategySource: "declared_fallback" } : null,
        recordOfTruth: { entityType: "opportunity", id: "opp-1" },
        contextFrame: { workViewId: "new_leads", workViewLabel: "New Leads" },
        focusPanelScopeState: "in_scope",
        currentBusinessState: { stageKey: "lead", stageLabel: "New Lead", purpose: "p", workTemplateKey: "contact_family", workTemplateLabel: "Contact Family", required: true },
        primaryAction: { actionRef: "quick_message", label: "Contact Family", workTemplateKey: "contact_family" },
        presentation: { queueLayoutId: null, focusPanelLayoutId: null, rowVariant: "crm_compact" },
        code: "records_unavailable",
        message: "boom",
        timings: { authorization_ms: 0, work_unit_ms: 0, configuration_ms: 0, records_ms: 0, projection_ms: 0, composition_ms: 0, total_ms: 1 },
    }) as unknown as ProvisioningAnswer;

function owner(lens = "new_leads") {
    const o = new AttentionOwner();
    o.hydrate({ ...IDENT, target: "new_leads", lens, source: "direct_url" });
    return o;
}
const refAt = (o: AttentionOwner) => o.get()!;

function runtimeWith(entry: EntryResource, instr = {}, deadlineMs?: number) {
    return new ProvisioningRuntime({ entryResource: entry, instrumentation: instr, deadlineMs });
}
const resolves = (t: "operational" | "empty" | "error" = "operational", delay = 0): EntryResource =>
    () => new Promise((r) => setTimeout(() => r(answer(t)), delay));

describe("D3 — K2 Provisioning Runtime", () => {
    it("1. one accepted Attention begins one preparation", async () => {
        const entry = vi.fn(resolves());
        const k2 = runtimeWith(entry);
        const o = owner();
        const t = await k2.onAttentionMoved({ type: "attention.moved", ref: refAt(o), supersedes: null, t0: 0 });
        expect(entry).toHaveBeenCalledTimes(1);
        expect(t?.outcome).toBe("operational");
    });

    it("2. preparation starts from intent — no route, mount, or DOM involved", async () => {
        const started: number[] = [];
        const k2 = runtimeWith(resolves(), { onStarted: () => started.push(Date.now()) });
        const o = owner();
        const p = k2.onAttentionMoved({ type: "attention.moved", ref: refAt(o), supersedes: null, t0: 0 });
        // Composition is already in flight synchronously after the movement — nothing was awaited.
        expect(started.length).toBe(1);
        await p;
    });

    it("3. two identical concurrent intents share ONE D1 invocation", async () => {
        const entry = vi.fn(resolves("operational", 20));
        const k2 = runtimeWith(entry);
        const o = owner();
        const [a, b] = await Promise.all([k2.prepare(refAt(o)), k2.prepare(refAt(o))]);
        expect(entry).toHaveBeenCalledTimes(1);
        expect(a).toBe(b); // the same in-flight work, consumed twice
    });

    it("4. different keys do not share", async () => {
        const entry = vi.fn(resolves());
        const k2 = runtimeWith(entry);
        const a = owner("new_leads");
        const b = owner("tours");
        await Promise.all([k2.prepare(refAt(a)), k2.prepare(refAt(b))]);
        expect(entry).toHaveBeenCalledTimes(2);
        expect(provisioningKey(refAt(a))).not.toBe(provisioningKey(refAt(b)));
    });

    it("5. different tenants or principals NEVER share", async () => {
        const entry = vi.fn(resolves());
        const k2 = runtimeWith(entry);
        const mine = refAt(owner());
        const otherTenant: AttentionRef = { ...mine, tenant: "org-2" };
        const otherUser: AttentionRef = { ...mine, principal: "user-2" };
        await Promise.all([k2.prepare(mine), k2.prepare(otherTenant), k2.prepare(otherUser)]);
        expect(entry).toHaveBeenCalledTimes(3);
        expect(new Set([provisioningKey(mine), provisioningKey(otherTenant), provisioningKey(otherUser)]).size).toBe(3);
    });

    it("5b. a completed snapshot is never reused across a tenant boundary", async () => {
        const k2 = runtimeWith(resolves());
        const mine = refAt(owner());
        await k2.prepare(mine);
        const entry2 = vi.fn(resolves());
        const k2b = runtimeWith(entry2);
        await k2b.prepare(mine);
        await k2b.prepare({ ...mine, tenant: "org-2", version: mine.version + 1 });
        expect(entry2).toHaveBeenCalledTimes(2); // no cross-tenant reuse
    });

    it("6-7. coarser intent supersedes finer preparation; the superseded result never lands", async () => {
        const disposed: string[] = [];
        const k2 = runtimeWith(resolves("operational", 40), { onDisposed: (_k, r) => disposed.push(r) });
        const o = owner("new_leads");
        // A lens preparation in flight…
        const first = k2.onAttentionMoved({ type: "attention.moved", ref: refAt(o), supersedes: null, t0: 0 });
        // …superseded by a coarser SURFACE movement before it completes.
        const surface = o.move({ scope: ATTENTION_SCOPE.SURFACE, target: "tours", source: "pointer" });
        const second = k2.onAttentionMoved({ type: "attention.moved", ref: surface, supersedes: null, t0: 0 });
        expect(await first).toBeNull(); // disposed — NOT a terminal outcome
        expect((await second)?.outcome).toBe("operational");
        expect(disposed).toContain("superseded");
    });

    it("8-9. stale completion cannot win EVEN IF the request could not be physically aborted", async () => {
        // The entry resource ignores the abort signal entirely and resolves anyway.
        const unabortable: EntryResource = () => new Promise((r) => setTimeout(() => r(answer("operational")), 30));
        const stale: string[] = [];
        const k2 = runtimeWith(unabortable, { onStaleDiscarded: (k) => stale.push(k) });
        const o = owner("new_leads");
        const first = k2.onAttentionMoved({ type: "attention.moved", ref: refAt(o), supersedes: null, t0: 0 });
        const next = o.move({ scope: ATTENTION_SCOPE.LENS, lens: "tours", source: "work_view_selection" });
        const second = k2.onAttentionMoved({ type: "attention.moved", ref: next, supersedes: null, t0: 0 });
        // The stale request DID complete — and still cannot become terminal.
        expect(await first).toBeNull();
        expect((await second)?.outcome).toBe("operational");
        expect(stale.length).toBeGreaterThan(0);
    });

    it("10-12. D1 terminal maps 1:1 — operational→operational, empty→empty, error→error", async () => {
        for (const t of ["operational", "empty", "error"] as const) {
            const k2 = runtimeWith(resolves(t));
            const got = await k2.prepare(refAt(owner()));
            expect(got?.outcome).toBe(t);
        }
    });

    it("11b. authoritative empty is never upgraded and never confused with error", async () => {
        const k2 = runtimeWith(resolves("empty"));
        const t = await k2.prepare(refAt(owner()));
        expect(t?.outcome).toBe("empty");
        expect(t?.outcome).not.toBe("error");
        expect(t?.snapshot.terminal).toBe("empty");
    });

    it("13-14. the deadline produces `error` ONLY — time can never produce operational", async () => {
        const onDeadline = vi.fn();
        // A preparation that never concludes.
        const never: EntryResource = () => new Promise(() => {});
        const k2 = runtimeWith(never, { onDeadline }, 30);
        const t = await k2.prepare(refAt(owner()));
        expect(t?.outcome).toBe("error");
        expect(onDeadline).toHaveBeenCalledTimes(1);
        expect(t?.snapshot.terminal).toBe("error");
    });

    it("14b. a slow-but-successful preparation is NOT concluded by the deadline", async () => {
        const onDeadline = vi.fn();
        const k2 = runtimeWith(resolves("operational", 10), { onDeadline }, 200);
        const t = await k2.prepare(refAt(owner()));
        expect(t?.outcome).toBe("operational");
        expect(onDeadline).not.toHaveBeenCalled(); // deadline is for non-termination, not slowness
    });

    it("15. a completed valid preparation is reused — one D1 invocation, not two", async () => {
        const entry = vi.fn(resolves());
        const onReused = vi.fn();
        const k2 = runtimeWith(entry, { onReused });
        const o = owner();
        await k2.prepare(refAt(o));
        await k2.prepare(refAt(o));
        expect(entry).toHaveBeenCalledTimes(1);
        expect(onReused).toHaveBeenCalledTimes(1);
    });

    it("16. invalidated truth cannot be reused", async () => {
        const entry = vi.fn(resolves());
        const k2 = runtimeWith(entry);
        const ref = refAt(owner());
        await k2.prepare(ref);
        k2.invalidate(provisioningKey(ref));
        await k2.prepare(ref);
        expect(entry).toHaveBeenCalledTimes(2); // stale truth is never served to make warm look good
        expect(k2.peekCompleted(provisioningKey(ref))).not.toBeNull();
    });

    it("17. Record of Attention change preserves lens and Context Frame — and REUSES the lens answer", async () => {
        const entry = vi.fn(resolves());
        const k2 = runtimeWith(entry);
        const o = owner("new_leads");
        await k2.onAttentionMoved({ type: "attention.moved", ref: refAt(o), supersedes: null, t0: 0 });
        const subject = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-2", source: "subject_selection" });
        const t = await k2.onAttentionMoved({ type: "attention.moved", ref: subject, supersedes: null, t0: 0 });
        // The Kernel key contains lens, not subject: subject movement reuses the lens preparation.
        expect(entry).toHaveBeenCalledTimes(1);
        expect(subject.lens).toBe("new_leads");
        expect(t?.snapshot.terminal === "operational" && t.snapshot.contextFrame.workViewId).toBe("new_leads");
    });

    it("18. the Queue Lane failure is unreachable from K2", () => {
        const src = require("fs").readFileSync(
            require("path").join(__dirname, "../../lib/runtime/kernel/provisioning.ts"), "utf8",
        );
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        expect(code).not.toMatch(/QueueService|compat_queue_key|queue_definition/);
    });

    it("19. K2 has no route, mount, or DOM dependency", () => {
        const src = require("fs").readFileSync(
            require("path").join(__dirname, "../../lib/runtime/kernel/provisioning.ts"), "utf8",
        );
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        for (const forbidden of ["next/router", "next/navigation", "useEffect", "document.", "window.", "usePathname", "react"]) {
            expect(code).not.toContain(forbidden);
        }
    });

    it("20. instrumentation records every lifecycle outcome", async () => {
        const marks: string[] = [];
        const k2 = runtimeWith(resolves("operational", 20), {
            onStarted: () => marks.push("started"),
            onCompositionStarted: () => marks.push("composition_started"),
            onCompositionFinished: () => marks.push("composition_finished"),
            onTerminal: () => marks.push("terminal"),
            onDeduplicated: () => marks.push("deduplicated"),
            onReused: () => marks.push("reused"),
            onDisposed: () => marks.push("disposed"),
            onInflightCount: () => marks.push("inflight"),
        });
        const o = owner();
        await Promise.all([k2.prepare(refAt(o)), k2.prepare(refAt(o))]);
        await k2.prepare(refAt(o));
        expect(marks).toContain("started");
        expect(marks).toContain("composition_started");
        expect(marks).toContain("composition_finished");
        expect(marks).toContain("terminal");
        expect(marks).toContain("deduplicated");
        expect(marks).toContain("reused");
    });

    it("the snapshot handed to K3 is immutable", async () => {
        const k2 = runtimeWith(resolves());
        const t = (await k2.prepare(refAt(owner())))!;
        expect(Object.isFrozen(t.snapshot)).toBe(true);
    });

    it("superseded/cancelled are DISPOSAL REASONS, never terminal outcomes (no fourth outcome)", async () => {
        const k2 = runtimeWith(resolves("operational", 40));
        const o = owner();
        const p = k2.prepare(refAt(o));
        k2.cancel(refAt(o));
        const t = await p;
        expect(t).toBeNull(); // disposed work yields NO terminal — it never reaches K3
    });

    it("the retention boundary flushes on principal change — a context never crosses a tenant", async () => {
        const entry = vi.fn(resolves());
        const k2 = runtimeWith(entry);
        const ref = refAt(owner());
        await k2.prepare(ref);
        k2.flushForPrincipalChange();
        await k2.prepare(ref);
        expect(entry).toHaveBeenCalledTimes(2);
    });

    it("exactly one active preparation exists per canonical key", async () => {
        const k2 = runtimeWith(resolves("operational", 30));
        const o = owner();
        const a = k2.prepare(refAt(o));
        const b = k2.prepare(refAt(o));
        expect(k2.inflightCount).toBe(1);
        await Promise.all([a, b]);
        expect(k2.inflightCount).toBe(0);
    });

    it("every preparation reaches a terminal outcome, or is disposed — never a non-outcome", async () => {
        const outcomes: Array<PreparationTerminal | null> = [];
        const k2 = runtimeWith(resolves());
        const o = owner();
        outcomes.push(await k2.prepare(refAt(o)));
        const k2b = runtimeWith(() => Promise.reject(new Error("network died")));
        outcomes.push(await k2b.prepare(refAt(owner("tours"))));
        for (const t of outcomes) {
            expect(t === null || ["operational", "empty", "error"].includes(t.outcome)).toBe(true);
        }
        expect(outcomes[1]?.outcome).toBe("error"); // a thrown entry resource terminates honestly
    });
});
