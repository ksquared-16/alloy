/**
 * A4 — subjectless operational residue, thread subjects, and workflow-event classification.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md §4ter
 *
 * The rule under test is that there is NO fourth category. Every row resolves to delete,
 * preserve-with-reason, or abort. These fixtures are built from the hosted shapes that produced the
 * final 74 survivors, so a regression here reintroduces a real residue class rather than a
 * hypothetical one.
 */

import { describe, expect, it } from "vitest";

import {
    A4_TABLES,
    CANONICAL_THREAD_SUBJECTS,
    CONFIG_EVENT_SUBJECTS,
    classifySubjectlessRow,
    classifyThread,
    classifyWorkflowEvent,
    isReusableDocument,
} from "@/scripts/lib/certificationResidueSelection";

const deleted = {
    opportunityIds: new Set(["opp-dead"]),
    personIds: new Set(["p-dead"]),
    customerIds: new Set(["c-dead"]),
};

describe("communication thread subjects", () => {
    it("follows a deleted PERSON — the bug that left threads behind", () => {
        const d = classifyThread({ id: "th", primary_entity_type: "persons", primary_entity_id: "p-dead" }, deleted);
        expect(d.verdict).toBe("delete");
        expect(d.reason).toMatch(/persons\/p-dead is being deleted/);
    });

    it("follows a deleted opportunity and a deleted customer", () => {
        expect(classifyThread({ id: "a", primary_entity_type: "opportunities", primary_entity_id: "opp-dead" }, deleted).verdict).toBe("delete");
        expect(classifyThread({ id: "b", primary_entity_type: "customers", primary_entity_id: "c-dead" }, deleted).verdict).toBe("delete");
    });

    it("PRESERVES a thread whose person survives", () => {
        const d = classifyThread({ id: "th", primary_entity_type: "persons", primary_entity_id: "p-alive" }, deleted);
        expect(d.verdict).toBe("preserve");
        expect(d.reason).toMatch(/survives the reset/);
    });

    it("deletes synthetic staging/validation subjects with a stated reason", () => {
        for (const t of ["staging_live_validation", "staging_resend_smoke", "communications_unknown"]) {
            const d = classifyThread({ id: `th-${t}`, primary_entity_type: t, primary_entity_id: "b0000001-0000" }, deleted);
            expect(d.verdict).toBe("delete");
            expect(d.reason).toMatch(/synthetic validation subject/);
        }
    });

    it("FAILS CLOSED on an unrecognised subject type", () => {
        const d = classifyThread({ id: "th", primary_entity_type: "martian_records", primary_entity_id: "x" }, deleted);
        expect(d.verdict).toBe("ambiguous");
        expect(d.reason).toMatch(/unrecognised thread subject type/);
    });

    it("declares the canonical subject set explicitly", () => {
        expect([...CANONICAL_THREAD_SUBJECTS]).toEqual(["opportunities", "persons", "customers"]);
    });
});

describe("workflow event classification", () => {
    it("PRESERVES configuration history for program and gl_accounts", () => {
        for (const t of CONFIG_EVENT_SUBJECTS) {
            const d = classifyWorkflowEvent({ id: `e-${t}`, entity_type: t });
            expect(d.verdict).toBe("preserve");
            expect(d.reason).toMatch(/configuration history/);
        }
    });

    it("deletes operational-subject events", () => {
        for (const t of ["opportunities", "persons", "documents", "form_submissions", "tour_bookings"]) {
            expect(classifyWorkflowEvent({ id: `e-${t}`, entity_type: t }).verdict).toBe("delete");
        }
    });

    it("FAILS CLOSED on an unclassified event subject", () => {
        const d = classifyWorkflowEvent({ id: "e", entity_type: "brand_new_subject" });
        expect(d.verdict).toBe("ambiguous");
        expect(d.reason).toMatch(/unclassified workflow event subject/);
    });

    /**
     * Regression: `customers` was missing, and the guard caught it on a LIVE tenant — a single new
     * event written between two dry runs aborted the whole run. That is the guard working, but the
     * gap was real. This pins every subject type observed on hosted Firefly so the same omission
     * cannot recur silently.
     */
    it("classifies every subject type observed on the hosted tenant", () => {
        const OBSERVED = [
            "form_submissions", "documents", "opportunities", "program", "persons",
            "child_placements", "tour_bookings", "gl_accounts", "schedule_assignments",
            "customer_members", "child_enrollment_agreements", "child", "form_packet_sessions",
            "opportunity", "staging_resend_smoke", "staging_live_validation", "customers",
            "opportunity_customer_members", "communications_unknown",
        ];
        for (const t of OBSERVED) {
            const d = classifyWorkflowEvent({ id: `e-${t}`, entity_type: t });
            expect(d.verdict, `subject "${t}" must be classified, not ambiguous`).not.toBe("ambiguous");
        }
    });

    it("treats customers as operational — they are removed by anchor A2", () => {
        expect(classifyWorkflowEvent({ id: "e", entity_type: "customers" }).verdict).toBe("delete");
    });
});

describe("A4 subjectless rows", () => {
    it("deletes a document with no subject and no Processing case", () => {
        const d = classifySubjectlessRow("documents", { id: "d1", entity_type: null, entity_id: null });
        expect(d.verdict).toBe("delete");
        expect(d.reason).toMatch(/bound to no record/);
    });

    it("PRESERVES a reusable document template", () => {
        expect(isReusableDocument({ template_key: "enrollment_agreement_v1" })).toBe(true);
        expect(isReusableDocument({ doc_type: "profile_photo" })).toBe(true);
        expect(isReusableDocument({ template_key: null, doc_type: null })).toBe(false);

        const d = classifySubjectlessRow("documents", { id: "d1", entity_type: null, entity_id: null }, { reusable: true });
        expect(d.verdict).toBe("preserve");
        expect(d.reason).toMatch(/reusable\/configuration/);
    });

    it("deletes an orphan compatibility contact", () => {
        const d = classifySubjectlessRow("contacts", { id: "ct", customer_id: null, person_id: null, vendor_id: null });
        expect(d.verdict).toBe("delete");
        expect(d.reason).toMatch(/identity that no longer exists/);
    });

    it("PRESERVES a subjectless row still referenced by something preserved", () => {
        const d = classifySubjectlessRow(
            "contacts",
            { id: "ct", customer_id: null, person_id: null, vendor_id: null },
            { protectedRefIds: new Set(["ct"]) },
        );
        expect(d.verdict).toBe("preserve");
        expect(d.reason).toMatch(/still referenced by a preserved record/);
    });

    it("FAILS CLOSED when a row HAS a subject but no anchor reached it", () => {
        // This is a missing traversal, not a deletion candidate — the distinction that keeps A4
        // from quietly becoming "delete whatever is left".
        const d = classifySubjectlessRow("form_submissions", {
            id: "fs",
            opportunity_id: null,
            person_id: "p-alive",
            customer_id: null,
            customer_member_id: null,
        });
        expect(d.verdict).toBe("ambiguous");
        expect(d.reason).toMatch(/no anchor reached it/);
    });

    it("is an explicit allowlist, not 'every operational table'", () => {
        expect(Object.keys(A4_TABLES).sort()).toEqual([
            "contacts",
            "documents",
            "form_submissions",
            "operational_tasks",
        ]);
        for (const spec of Object.values(A4_TABLES)) {
            expect(spec.subjectColumns.length).toBeGreaterThan(0);
            expect(spec.nullMeaning.length).toBeGreaterThan(0);
        }
    });

    it("deletes a task that could still surface in Work Items with nothing behind it", () => {
        const d = classifySubjectlessRow("operational_tasks", { id: "t", entity_type: null, entity_id: null });
        expect(d.verdict).toBe("delete");
        expect(d.reason).toMatch(/Work Items/);
    });
});
