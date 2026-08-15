/**
 * D2 — K1 Attention.
 *
 * Governing: docs/platform/runtime/alloy-runtime-kernel.md §K1 (:100–163)
 *   acknowledgment ≤ 50 ms unconditional · newest attention wins · Law of Scope Supersession
 *   · attention never fetches/renders/commits · a URL may hydrate but never move attention.
 */
import { describe, it, expect, vi } from "vitest";
import {
    AttentionOwner,
    ATTENTION_SCOPE,
    supersedes,
    attentionFromUrl,
    urlFromAttention,
    type AttentionRef,
} from "@/lib/runtime/kernel/attention";

const IDENT = { tenant: "org-1", principal: "user-1" };

function ownerAt(target = "new_leads", lens: string | null = "new_leads") {
    const o = new AttentionOwner();
    o.hydrate({ ...IDENT, target, lens, source: "direct_url" });
    return o;
}

describe("D2 — K1 Attention", () => {
    it("1. pointer and keyboard produce the SAME Attention shape (one mechanism, adapters differ)", () => {
        const a = ownerAt();
        const byPointer = a.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" });
        const b = ownerAt();
        const byKeyboard = b.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "keyboard" });
        const shape = (r: AttentionRef) => ({ ...r, source: "x", version: 0 });
        expect(shape(byPointer)).toEqual(shape(byKeyboard));
    });

    it("2. search, direct-link and history adapters enter the SAME owner", () => {
        for (const source of ["search", "direct_url", "history", "notification", "command"] as const) {
            const o = new AttentionOwner();
            const ref =
                source === "direct_url" || source === "history"
                    ? o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source })
                    : (o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "reload" }),
                      o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-9", source }));
            expect(ref.tenant).toBe("org-1");
            expect(o.get()).toEqual(ref); // one owner holds the state, whatever the adapter
        }
    });

    it("3. acknowledgment does not wait on Provisioning — and is well inside 50 ms", () => {
        const marks: number[] = [];
        const o = new AttentionOwner({ onAcknowledged: (_r, ms) => marks.push(ms) });
        o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "reload" });
        // A listener that blocks (as a slow provisioning subscriber would) must not delay ack.
        let ackedBeforeListener = false;
        o.subscribe(() => {
            ackedBeforeListener = marks.length > 0;
        });
        o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" });
        expect(ackedBeforeListener).toBe(true); // acknowledged BEFORE any subscriber ran
        expect(marks.at(-1)!).toBeLessThanOrEqual(50);
    });

    it("3b. K1 cannot fail — a throwing subscriber never breaks acknowledgment", () => {
        const acked: number[] = [];
        const o = new AttentionOwner({ onAcknowledged: (_r, ms) => acked.push(ms) });
        // Hydration establishes attention and is itself acknowledged (every movement is).
        o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "reload" });
        expect(acked.length).toBe(1);
        o.subscribe(() => {
            throw new Error("downstream exploded");
        });
        expect(() => o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" })).not.toThrow();
        expect(acked.length).toBe(2); // the movement was acknowledged despite the subscriber fault
    });

    it("3c. cold-load hydration is acknowledged too — instrumentation has no hole at cold entry", () => {
        const onAccepted = vi.fn();
        const onAcknowledged = vi.fn();
        const o = new AttentionOwner({ onAccepted, onAcknowledged });
        o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "direct_url" });
        expect(onAccepted).toHaveBeenCalledTimes(1);
        expect(onAcknowledged).toHaveBeenCalledTimes(1);
        expect(onAcknowledged.mock.calls[0][1]).toBeLessThanOrEqual(50);
    });

    it("4. latest same-scope intent wins", () => {
        const o = ownerAt();
        const first = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" });
        const second = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-2", source: "pointer" });
        expect(o.get()!.subject).toBe("opp-2");
        expect(supersedes(second, first)).toBe(true);
        expect(supersedes(first, second)).toBe(false); // an older version never supersedes
    });

    it("5. coarser scope supersedes finer pending work", () => {
        const o = ownerAt();
        const subject = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" });
        const aspect = o.move({ scope: ATTENTION_SCOPE.ASPECT, aspect: "activity", source: "pointer" });
        const lens = o.move({ scope: ATTENTION_SCOPE.LENS, lens: "tours", source: "work_view_selection" });
        expect(supersedes(lens, subject)).toBe(true);
        expect(supersedes(lens, aspect)).toBe(true);
        const surface = o.move({ scope: ATTENTION_SCOPE.SURFACE, target: "tours", source: "pointer" });
        expect(supersedes(surface, lens)).toBe(true);
    });

    it("6. a finer movement cannot modify a coarser context (and never supersedes it)", () => {
        const o = ownerAt();
        const lens = o.move({ scope: ATTENTION_SCOPE.LENS, lens: "tours", source: "work_view_selection" });
        const subject = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" });
        const aspect = o.move({ scope: ATTENTION_SCOPE.ASPECT, aspect: "activity", source: "pointer" });
        // Law of Scope Supersession is directional.
        expect(supersedes(aspect, subject)).toBe(false);
        expect(supersedes(aspect, lens)).toBe(false);
        expect(supersedes(subject, lens)).toBe(false);
        // An aspect movement preserves the subject and the lens.
        expect(o.get()!.subject).toBe("opp-1");
        expect(o.get()!.lens).toBe("tours");
    });

    it("7-8. subject movement preserves lens identity, target and Context Frame — by construction", () => {
        const o = ownerAt("new_leads", "new_leads");
        const before = o.get()!;
        o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-42", source: "subject_selection" });
        const after = o.get()!;
        expect(after.lens).toBe(before.lens); // Work View preserved
        expect(after.target).toBe(before.target); // Surface / Business Process preserved
        expect(after.subject).toBe("opp-42");
        // The intent type itself cannot express a lens change at SUBJECT scope — this is structural,
        // not a runtime check. (A compile error is the enforcement; asserted here for the record.)
        expect(Object.keys({ scope: 2, subject: "x", source: "pointer" })).not.toContain("lens");
    });

    it("9. duplicate identical intent is deterministic — a new version, same resolved target", () => {
        const o = ownerAt();
        const a = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" });
        const b = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" });
        expect(b.version).toBe(a.version + 1); // monotonic identity, always
        expect({ ...a, version: 0 }).toEqual({ ...b, version: 0 }); // identical resolved attention
        expect(supersedes(b, a)).toBe(true); // newest wins, even when identical
    });

    it("10. stale intents cannot become current — version is monotonic", () => {
        const o = ownerAt();
        const stale = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" });
        o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-2", source: "pointer" });
        expect(supersedes(stale, o.get()!)).toBe(false);
        expect(o.get()!.version).toBeGreaterThan(stale.version);
    });

    it("11. Attention contains no fetched or presentation data", () => {
        const o = ownerAt();
        const ref = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" });
        // `cohort` joined the coordinates: "the operator selected no cohort" is INTENT, exactly like
        // `lens` and `subject`, and it is here for the same reason they are — nothing else in the
        // runtime can carry it from the gesture to the answer and back through a reload. It is not
        // fetched, not presentation, and holds no payload, which is what this test polices.
        expect(Object.keys(ref).sort()).toEqual([
            "aspect", "cohort", "destination", "lens", "principal", "scope", "source", "subject", "target", "tenant", "version",
        ]);
        for (const forbidden of ["rows", "snapshot", "payload", "data", "layout", "presentation", "ready", "loading"]) {
            expect(ref).not.toHaveProperty(forbidden);
        }
    });

    it("12. the router is not the Attention store — a URL hydrates once and may never move it", () => {
        const o = new AttentionOwner();
        const h = attentionFromUrl(
            new URL("http://x/workspace/work-unit/new_leads?work_view_id=new_leads&subject_id=opp-7"),
            IDENT,
        )!;
        const ref = o.hydrate(h);
        expect(ref.scope).toBe(ATTENTION_SCOPE.SUBJECT);
        expect(ref.subject).toBe("opp-7");
        // Art 2.4 — a second URL read may never move attention.
        expect(() => o.hydrate(h)).toThrow(/may never move it/i);
    });

    it("12b. URL is a projection of committed attention, not a source of it", () => {
        const o = ownerAt("new_leads", "new_leads");
        o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-7", source: "pointer" });
        expect(urlFromAttention(o.get()!)).toBe(
            "/workspace/work-unit/new_leads?work_view_id=new_leads&subject_id=opp-7",
        );
    });

    it("tenant/principal isolation is absolute — attention never supersedes across a boundary", () => {
        const mine: AttentionRef = {
            tenant: "org-1", principal: "user-1", scope: 0, target: "t", lens: null, cohort: null,
            subject: null, aspect: null, destination: null, source: "pointer", version: 9,
        };
        const theirs: AttentionRef = { ...mine, tenant: "org-2", version: 1 };
        expect(supersedes(mine, theirs)).toBe(false);
        expect(supersedes({ ...mine, tenant: "org-1", principal: "user-2" }, mine)).toBe(false);
    });

    it("K4: accepted / acknowledged / superseded marks are emitted", () => {
        const onAccepted = vi.fn();
        const onAcknowledged = vi.fn();
        const onSuperseded = vi.fn();
        const o = new AttentionOwner({ onAccepted, onAcknowledged, onSuperseded });
        o.hydrate({ ...IDENT, target: "new_leads", lens: "new_leads", source: "reload" });
        o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" });
        o.move({ scope: ATTENTION_SCOPE.LENS, lens: "tours", source: "work_view_selection" });
        // 3 = hydration + 2 movements. Every attention that becomes current is accepted AND acknowledged.
        expect(onAccepted).toHaveBeenCalledTimes(3);
        expect(onAcknowledged).toHaveBeenCalledTimes(3);
        // the lens movement superseded the subject movement
        expect(onSuperseded).toHaveBeenCalledTimes(1);
        expect(onAcknowledged.mock.calls.every(([, ms]) => ms <= 50)).toBe(true);
    });

    it("attention.moved names what it supersedes — once, for the whole kernel", () => {
        const events: Array<{ v: number; sup: number | null }> = [];
        const o = ownerAt();
        o.subscribe((e) => events.push({ v: e.ref.version, sup: e.supersedes?.version ?? null }));
        const s = o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-1", source: "pointer" });
        o.move({ scope: ATTENTION_SCOPE.LENS, lens: "tours", source: "work_view_selection" });
        expect(events.at(-1)!.sup).toBe(s.version);
    });
});
