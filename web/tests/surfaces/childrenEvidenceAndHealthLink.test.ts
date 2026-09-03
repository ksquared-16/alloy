import { describe, expect, it } from "vitest";
import { availableFieldsForFocusPanelCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardFieldPicker";
import { resolveIdentityFieldValue } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompose";
import {
    childrenEvidenceRefIsOfferable,
    childrenEvidenceWithholdReason,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenEvidenceAuthoring";
import {
    CHILD_HEALTH_LINK_FIELD_REF,
    IDENTITY_LINK_CARD_OPTIONS,
    defaultIdentityFieldLinkTarget,
    resolveIdentityFieldLinkContract,
    resolveConfiguredOrDefaultIdentityFieldLink,
    summarizeIdentityFieldLinkTarget,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract";

/** One child with every projection populated — anything null here is genuinely unresolvable. */
const FULL_CHILD = {
    id: "part-1", name: "Ada Lovelace", firstName: "Ada", lastName: "Lovelace",
    preferredName: "Addie", nickname: "Ada", dob: "2021-03-04", age: "4", dobAge: "4 yrs",
    gender: "Female", allergies: "Peanuts", medicalNotes: "Inhaler",
    specialInstructions: "Nap at 1", ageBand: "Preschool", location: "Bend",
    locationId: "L1", programCategoryId: "P1", initial: "A", imageUrl: null,
    program: "Preschool", room: "Sunflower", schedule: "Full time", teacher: null,
    startDate: "Sep 1, 2026", requestedStart: "Sep 1, 2026",
    requestedDaysPerWeek: "3 days per week", preferredWeekdays: "Mon, Wed, Fri",
    status: "Enrolled", statusTone: "positive" as const, notes: "Loves trains",
    needsAttention: false, missingLine: null, customerMemberId: "member-1", personId: "person-1",
};

describe("Children evidence picker — every option can answer", () => {
    const offered = availableFieldsForFocusPanelCard("children");

    it("offers nothing the Children card cannot resolve", () => {
        const dead = offered
            .filter((f) => f.key !== CHILD_HEALTH_LINK_FIELD_REF)
            .filter((f) => resolveIdentityFieldValue({ kind: "child", value: FULL_CHILD }, f.key) == null)
            .map((f) => f.key);
        expect(dead).toEqual([]);
    });

    it("withholds household aggregates — a per-child card does not answer family questions", () => {
        for (const ref of ["children.count", "children.names", "children.summary"]) {
            expect(childrenEvidenceRefIsOfferable(ref)).toBe(false);
            expect(childrenEvidenceWithholdReason(ref)).toMatch(/[Hh]ousehold aggregate/);
        }
    });

    it("withholds the placeholders whose resolvers can only answer null", () => {
        for (const ref of [
            "child.documents_summary",
            "child.pickup_summary",
            "child.communications_summary",
        ]) {
            expect(childrenEvidenceRefIsOfferable(ref)).toBe(false);
        }
    });

    it("offers exactly one Notes — two identical choices is a coin flip", () => {
        const notes = offered.filter((f) => f.label === "Notes");
        expect(notes.map((f) => f.key)).toEqual(["inquiry_child.notes"]);
    });

    it("resolves the canonical enrollment refs it offers, not only their child.* aliases", () => {
        // These were offered by the picker and resolved by nothing — blank rows forever.
        const subject = { kind: "child" as const, value: FULL_CHILD };
        expect(resolveIdentityFieldValue(subject, "inquiry_child.program_room_cohort_key")).toBe("Sunflower");
        expect(resolveIdentityFieldValue(subject, "inquiry_child.outcome_status_key")).toBe("Enrolled");
        expect(resolveIdentityFieldValue(subject, "child.full_name")).toBe("Ada Lovelace");
    });

    it("keeps enrollment-grain evidence named in operator language, on the child surface", () => {
        const byKey = new Map(offered.map((f) => [f.key, f]));
        expect(byKey.get("inquiry_child.program")?.label).toBe("Program");
        expect(byKey.get("inquiry_child.program_room_cohort_key")?.label).toBe("Room");
        expect(byKey.get("inquiry_child.outcome_status_key")?.label).toBe("Enrollment status");
    });
});

describe("Children → Health & Safety is the Assignments link, pointed elsewhere", () => {
    it("offers Health & Safety as a link destination in the builder", () => {
        expect(IDENTITY_LINK_CARD_OPTIONS).toContainEqual({
            value: "health_safety",
            label: "Health & Safety",
        });
    });

    it("makes the Children health row linkable, defaulting to this child's Health card", () => {
        const contract = resolveIdentityFieldLinkContract(CHILD_HEALTH_LINK_FIELD_REF);
        expect(contract.canOfferLinked).toBe(true);
        expect(contract.destinationCard).toBe("health_safety");
        expect(contract.linkLabel).toBe("Health & Safety");

        const target = defaultIdentityFieldLinkTarget(CHILD_HEALTH_LINK_FIELD_REF);
        // The child is the subject — with siblings, anything else opens the wrong record.
        expect(target).toEqual({ toCard: "health_safety", open: "detail", subject: "this_child" });
        expect(summarizeIdentityFieldLinkTarget(target)).toBe("Opens Health & Safety for this child");
    });

    it("carries the clicked child as the destination subject", () => {
        const link = resolveConfiguredOrDefaultIdentityFieldLink({
            links: null,
            fromCard: "children",
            fieldRef: CHILD_HEALTH_LINK_FIELD_REF,
            itemId: "member-1",
        });
        expect(link).toMatchObject({
            fromCard: "children",
            toCard: "health_safety",
            destinationSubject: "this_child",
            destinationOpen: "detail",
        });
    });

    it("reuses the Assignments architecture rather than adding a Health-specific one", () => {
        // Same allowlist, same contract shape — Program still links to Assignments.
        const assignments = resolveIdentityFieldLinkContract("child.program");
        expect(assignments.destinationCard).toBe("scheduling");
        expect(assignments.canOfferLinked).toBe(true);
    });

    it("does not copy health truth onto the Children card", () => {
        // The health row has no value of its own; it is an affordance, and Health & Safety
        // remains the only owner of the answer.
        expect(
            resolveIdentityFieldValue({ kind: "child", value: FULL_CHILD }, CHILD_HEALTH_LINK_FIELD_REF),
        ).toBeNull();
    });
});
