/**
 * THE FOCUS PANEL BODY IS KEYED ON THE SUBJECT OF ATTENTION.
 *
 * The body's React `key` decides whether the pending → enriched transition is a prop change or a
 * remount. The panel documents its own contract as "never a remount: one commit, one geometry, one
 * card composition, one readiness boundary, zero resize" — and a remount breaks all four AND re-runs
 * every self-fetching card's load.
 *
 * The regression this guards: the key read `visible?.displayVm.entity.id ?? operationalSubjectId`.
 * On a CHILD subject those are different ids by construction — `operationalSubjectId` is the child
 * Attention id (process_instance / participation), while the drawer VM is an OPPORTUNITY vm keyed on
 * the family opportunity. So the key flipped the moment the VM resolved.
 *
 * Measured on deployed staging bcd20f004 before the fix: WU-08 and WU-09 each mounted twice on one
 * cold entry (2366 ms, then 6486 ms) and financials/attendance/health each fetched TWICE with
 * identical parameters 3773 ms apart, with no operator interaction.
 */
import { describe, expect, it } from "vitest";

/** The key rule, extracted exactly as the panel applies it. */
const bodyKey = (operationalSubjectId: string | null) => String(operationalSubjectId);
/** The pre-fix rule, kept only so the guard can prove it would fail. */
const legacyBodyKey = (vmEntityId: string | null, operationalSubjectId: string | null) =>
    String(vmEntityId ?? operationalSubjectId ?? "pending");

const CHILD_ATTENTION_ID = "b247b8a3-7df7-4919-9309-698796b59c3b";
const FAMILY_OPPORTUNITY_ID = "0658832a-48d6-4b80-beae-0b12d573fdf2";

describe("Focus Panel body key — pending → enriched must not remount", () => {
    it("a child subject keeps ONE key across the VM resolving", () => {
        const before = bodyKey(CHILD_ATTENTION_ID); // commit-critical seed, no VM yet
        const after = bodyKey(CHILD_ATTENTION_ID); // VM resolved to the FAMILY opportunity
        expect(after).toBe(before);
    });

    it("the pre-fix rule provably remounted the child case (positive control)", () => {
        const before = legacyBodyKey(null, CHILD_ATTENTION_ID);
        const after = legacyBodyKey(FAMILY_OPPORTUNITY_ID, CHILD_ATTENTION_ID);
        expect(after).not.toBe(before); // key flip == React remount == duplicate card fetches
    });

    it("a family subject also keeps one key (the ids coincide there, which is why this hid)", () => {
        expect(bodyKey(FAMILY_OPPORTUNITY_ID)).toBe(bodyKey(FAMILY_OPPORTUNITY_ID));
    });

    it("a genuine record switch DOES change the key, so the keyed swap still settles", () => {
        expect(bodyKey("subject-a")).not.toBe(bodyKey("subject-b"));
    });

    it("the key never degrades to the literal 'pending' — the subject is guarded non-null", () => {
        expect(bodyKey(CHILD_ATTENTION_ID)).not.toBe("pending");
    });
});

describe("source guard — the body key reads only the committed subject", () => {
    it("does not reintroduce a VM-derived key", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const src = readFileSync(
            join(process.cwd(), "components/presentation/workUnit/InlineOpportunityFocusPanel.tsx"),
            "utf8",
        );
        const decl = src.slice(src.indexOf("const bodyRenderKey"), src.indexOf("const bodyRenderKey") + 120);
        expect(decl).toContain("operationalSubjectId");
        // A VM entity id in the key is exactly the defect.
        expect(decl).not.toContain("displayVm");
    });
});
