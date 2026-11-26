/**
 * D2 + D3 live certification — Attention → Provisioning against the real co-located environment.
 *
 * Proves the central claim of the mission: the new Runtime PREPARES FROM INTENT, not after mount.
 * The old path composes only once a route has committed and a component has mounted; here the D1
 * composition is already in flight in the same tick as the gesture, and acknowledgment has already
 * been discharged before any of it starts.
 *
 * Live-only (D3_LIVE=1) — CI never depends on a local stack.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { AttentionOwner, ATTENTION_SCOPE } from "@/lib/runtime/kernel/attention";
import { ProvisioningRuntime, provisioningKey } from "@/lib/runtime/kernel/provisioning";
import { workUnitEntryResource } from "@/lib/runtime/kernel/workUnitEntryResource";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { selectedWorkViewId } from "@/lib/runtime/provisioning/contextualFocusAnswer";

const LIVE = process.env.D3_LIVE === "1";
const ORG = process.env.DEV_QUEUE_ORG_ID || "00000000-0000-4000-8000-000000000001";
const PRINCIPAL = "qa.operator@northwind.invalid";

function supa() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false },
    });
}

describe.skipIf(!LIVE)("D2+D3 live — Attention → Provisioning (co-located, production build)", () => {
    it("captures the timestamped graph: gesture → acknowledgment → preparation → D1 → terminal", async () => {
        const graph: Array<{ t: number; event: string }> = [];
        const t0 = performance.now();
        const at = (e: string) => graph.push({ t: +(performance.now() - t0).toFixed(2), event: e });

        let ackMs = Number.NaN;
        const attention = new AttentionOwner({
            onAccepted: () => at("attention accepted"),
            onAcknowledged: (_r, ms) => {
                ackMs = ms;
                at("acknowledgment discharged");
            },
        });
        const k2 = new ProvisioningRuntime({
            entryResource: workUnitEntryResource({ supabase: supa(), currentUserId: PRINCIPAL }),
            instrumentation: {
                onStarted: () => at("preparation started"),
                onCompositionStarted: () => at("D1 composition started"),
                onCompositionFinished: () => at("D1 composition finished"),
                onTerminal: (t) => at(`K2 terminal = ${t.outcome}`),
            },
        });
        attention.subscribe((e) => void k2.onAttentionMoved(e));

        // Cold entry: a URL hydrates attention ONCE (Art 2.4), which is the operator arriving.
        at("operator gesture (cold entry)");
        const ref = attention.hydrate({
            tenant: ORG, principal: PRINCIPAL, target: "new_leads", lens: "new_leads", source: "direct_url",
        });
        // The gesture returned synchronously; preparation is ALREADY in flight.
        at("gesture returned (synchronous)");
        expect(k2.inflightCount).toBe(1);

        const terminal = await k2.prepare(ref);
        at("awaited terminal");

        expect(terminal?.outcome).toBe("operational");
        expect(ackMs).toBeLessThanOrEqual(50);

        const evidence = {
            acknowledgment_ms: +ackMs.toFixed(3),
            acknowledgment_budget_ms: 50,
            acknowledgment_within_budget: ackMs <= 50,
            terminal: terminal?.outcome,
            preparation_ms: +(terminal?.durationMs ?? 0).toFixed(2),
            d1_server_composition_ms: terminal?.snapshot.timings.total_ms
                ? +terminal.snapshot.timings.total_ms.toFixed(2)
                : null,
            d1_budget_p75_ms: 400,
            rows: terminal?.snapshot.terminal === "operational" ? terminal.snapshot.rows.length : 0,
            provisioning_key: JSON.parse(provisioningKey(ref)),
            graph,
        };
        const dir = process.env.RC_EVIDENCE_DIR;
        if (dir) {
            const { writeFileSync, mkdirSync } = await import("fs");
            mkdirSync(dir, { recursive: true });
            writeFileSync(`${dir}/d2d3-timing-graph.json`, JSON.stringify(evidence, null, 2));
        }
    }, 60_000);

    it("repeated identical preparation is deduplicated, then reused — one D1 invocation each", async () => {
        let compositions = 0;
        const base = workUnitEntryResource({ supabase: supa(), currentUserId: PRINCIPAL });
        const k2 = new ProvisioningRuntime({
            entryResource: (r, s) => {
                compositions++;
                return base(r, s);
            },
        });
        const o = new AttentionOwner();
        const ref = o.hydrate({ tenant: ORG, principal: PRINCIPAL, target: "new_leads", lens: "new_leads", source: "direct_url" });

        // concurrent identical → shared
        await Promise.all([k2.prepare(ref), k2.prepare(ref), k2.prepare(ref)]);
        expect(compositions).toBe(1);
        // subsequent identical → reused
        await k2.prepare(ref);
        expect(compositions).toBe(1);
    }, 60_000);

    it("rapid Work View selection supersedes stale work; rapid subject selection preserves the lens", async () => {
        const stale: string[] = [];
        const k2 = new ProvisioningRuntime({
            entryResource: workUnitEntryResource({ supabase: supa(), currentUserId: PRINCIPAL }),
            instrumentation: {
                onStaleDiscarded: (k: string) => stale.push(k),
                onDisposed: (_k: string, r: string) => stale.push(r),
            },
        });
        const o = new AttentionOwner();
        o.subscribe((e) => void k2.onAttentionMoved(e));
        const first = o.hydrate({ tenant: ORG, principal: PRINCIPAL, target: "new_leads", lens: "new_leads", source: "direct_url" });
        const p1 = k2.prepare(first);

        // Rapid lens switch before the first can settle.
        const second = o.move({ scope: ATTENTION_SCOPE.LENS, lens: "tours", source: "work_view_selection" });
        const p2 = k2.prepare(second);
        const [r1, r2] = await Promise.all([p1, p2]);

        // The newest lens wins and reaches a terminal outcome. NOTE: `tours` over the New Leads work
        // unit is authoritatively EMPTY — that work unit holds only `lead` (150) and `closed` (350)
        // rows, no `tour` rows. Empty is the CORRECT terminal here, and it is a workable place. What
        // matters for supersession is that the answer describes the lens the operator moved to.
        expect(["operational", "empty"]).toContain(r2?.outcome);
        // The canonical accessor — `null` for both the `error` terminal (no such field) and the
        // lens-free `contextual` one. This test asserts a LENS movement, so every expectation below
        // still demands a concrete lens id; reading it through the shared accessor just stops this file
        // from deciding for itself which terminals have one.
        const lensOf = (s: ProvisioningAnswer | undefined) => selectedWorkViewId(s);
        expect(lensOf(r2?.snapshot)).toBe("tours");
        // The superseded preparation must not win: it is either disposed, or it describes the lens
        // the operator LEFT — never allowed to stand in for the destination.
        if (r1) expect(lensOf(r1.snapshot)).not.toBe("tours");

        // Subject movement preserves lens identity — and reuses the lens preparation.
        const subj = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "any", source: "subject_selection" });
        expect(subj.lens).toBe("tours");
        const r3 = await k2.prepare(subj);
        expect(lensOf(r3?.snapshot)).toBe("tours");
        expect(
            r3 && (r3.snapshot.terminal === "operational" || r3.snapshot.terminal === "empty")
                ? r3.snapshot.contextFrame.workViewId
                : null,
        ).toBe("tours");
    }, 60_000);

    it("no hosted Supabase traffic — the runtime targets loopback only", () => {
        expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
    });
});
