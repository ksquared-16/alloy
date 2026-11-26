/**
 * An OWNED key must survive parse → serialize.
 *
 * `captureUnknownFields` preserves anything the parser does not understand, and it is keyed on the
 * OWNED-key lists: a key on those lists is declared to be the parser's responsibility, so the
 * residue deliberately skips it. That makes "owned" and "read" the same claim — and where they came
 * apart, the field was owned by nobody.
 *
 * `processes[].description` was exactly that. It is writable through the live canonical API
 * (`updateProcessDescription`, reached from the department lifecycle-builder route) and is shown on
 * the /workspace department tile, but the process assembly never read it back. Every canonical save
 * round-trips the payload through this parser — `saveDraft` serializes the builder, and
 * `saveLifecycleStageRuntimeConfig` goes through the same pair — so an operator could type a
 * description and the next save of ANY part of the configuration silently deleted it. A publish
 * would then have written that deletion into an immutable revision.
 *
 * These controls are written against the key LISTS rather than against one field, because the defect
 * is a class: any future key added to an owned list without a matching read reintroduces it.
 */

import { describe, expect, it } from "vitest";
import {
    parseLifecycleBuilderV1,
    serializeLifecycleBuilderV1,
    updateProcessDescription,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

const DESCRIPTION = "Lead to enrolled — inquiry, tour, decision, placement.";

/**
 * A payload shaped like a real authored draft: one process, one stage, both described.
 *
 * `null` means "the key is absent", spelled explicitly rather than as `undefined` — a JS default
 * parameter fires on an explicit `undefined`, so the absent case would silently become the authored
 * one and the control would pass without testing anything.
 */
function authoredPayload(description: string | null = DESCRIPTION): Record<string, unknown> {
    return {
        version: 1,
        active_process_id: "p1",
        processes: [
            {
                id: "p1",
                key: "enrollment",
                name: "Enrollment",
                ...(description === null ? {} : { description }),
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                stages: [
                    {
                        id: "s1",
                        key: "enrolling",
                        label: "Enrolling",
                        description: "The parent completes the paperwork.",
                        sort_order: 0,
                        is_active: true,
                    },
                ],
            },
        ],
    };
}

const roundTrip = (payload: Record<string, unknown>) =>
    serializeLifecycleBuilderV1(parseLifecycleBuilderV1(payload)!);

describe("an authored description survives the canonical round trip", () => {
    it("keeps a process description through parse → serialize", () => {
        const out = roundTrip(authoredPayload()) as Record<string, any>;
        expect(out.processes[0].description).toBe(DESCRIPTION);
    });

    it("keeps it through a SECOND round trip — the save-after-save case", () => {
        // One save was never the failure mode. The description was lost on whichever save came
        // next, including a save that changed something else entirely.
        const out = roundTrip(roundTrip(authoredPayload())) as Record<string, any>;
        expect(out.processes[0].description).toBe(DESCRIPTION);
    });

    it("survives a save that edits an unrelated part of the configuration", () => {
        const parsed = parseLifecycleBuilderV1(authoredPayload())!;
        const edited = {
            ...parsed,
            processes: parsed.processes.map((p) => ({
                ...p,
                stages: p.stages.map((s) => ({ ...s, label: "Enrolling (renamed)" })),
            })),
        };
        const out = serializeLifecycleBuilderV1(edited) as Record<string, any>;
        expect(out.processes[0].description).toBe(DESCRIPTION);
        expect(out.processes[0].stages[0].label).toBe("Enrolling (renamed)");
    });

    it("round-trips what the canonical writer actually writes", () => {
        // Closes the loop on the live path: the API route calls this exact function.
        const written = updateProcessDescription(parseLifecycleBuilderV1(authoredPayload(null))!, "p1", "  Trimmed me  ");
        const out = roundTrip(serializeLifecycleBuilderV1(written)) as Record<string, any>;
        expect(out.processes[0].description).toBe("Trimmed me");
    });

    it("keeps the stage description too — the path that was already correct", () => {
        const out = roundTrip(authoredPayload()) as Record<string, any>;
        expect(out.processes[0].stages[0].description).toBe("The parent completes the paperwork.");
    });

    it("leaves an unauthored description absent rather than materializing an empty one", () => {
        // Absent must stay absent, or every existing draft gains a key on its next save and the
        // pre-publish diff stops being able to say "nothing else moved".
        const out = roundTrip(authoredPayload(null)) as Record<string, any>;
        expect("description" in out.processes[0]).toBe(false);
    });

    it("treats a whitespace-only description as unauthored, as the writer does", () => {
        const out = roundTrip(authoredPayload("   ")) as Record<string, any>;
        expect("description" in out.processes[0]).toBe(false);
    });
});

describe("the defect class, not just the field", () => {
    it("round-trips every OWNED process and stage key that was authored", () => {
        // The generalisation: for each owned key present in the payload, the same key must be
        // present after a round trip. A key added to an owned list without a matching read fails
        // here rather than in a tenant's configuration.
        const payload = authoredPayload();
        const out = roundTrip(payload) as Record<string, any>;
        const before = (payload.processes as any[])[0];
        const after = out.processes[0];
        for (const key of Object.keys(before)) {
            if (key === "stages") continue;
            expect(key in after, `process key "${key}" was dropped by the round trip`).toBe(true);
        }
        const stageBefore = before.stages[0];
        const stageAfter = after.stages[0];
        for (const key of Object.keys(stageBefore)) {
            expect(key in stageAfter, `stage key "${key}" was dropped by the round trip`).toBe(true);
        }
    });

    it("still preserves keys the parser does NOT own", () => {
        // The residue must keep working — the fix must not have moved description into it.
        const payload = authoredPayload();
        (payload.processes as any[])[0].future_section_v9 = { keep: true };
        const out = roundTrip(payload) as Record<string, any>;
        expect(out.processes[0].future_section_v9).toEqual({ keep: true });
        expect(out.processes[0].description).toBe(DESCRIPTION);
    });
});
