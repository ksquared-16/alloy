/**
 * OPERATIONS HOSTS CANONICAL CARDS — it does not have cards of its own.
 *
 * The correction this file guards:
 *
 *     same subject + same selected context ⇒ the same card, the same actions, the same editability,
 *     whichever host renders it.
 *
 * Human review found Operations rendering a small invented Child card — four hardcoded facts, no
 * photo, no medical rows, no Edit — beside a Focus Panel that rendered the tenant's configured
 * Children card for the same child. Two platform answers to one question, and which one an operator
 * saw depended on how they had arrived.
 *
 * ── WHY THESE ASSERTIONS AND NOT A SCREENSHOT ──
 *
 * "Both surfaces show child information" is exactly the proof the architecture refuses. So nothing
 * here asserts that a card appeared. The assertions are on the CARD MODEL and the wiring that
 * produces it: which key each host resolves, that both reach it through the same producer, that the
 * durable subject composes the collection the card reads, and that the host mounts the canonical
 * renderer with a mutation seam rather than a read-only clone.
 *
 * The source-reading assertions are the tie that makes the rest real. A test that composed both
 * sides itself would compare two values it had just built and pass forever.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildChildrenCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import { deriveChildFocusPanelCards } from "@/lib/adminV2/runtime/focusPanel/durableSubject/deriveChildFocusPanelCards";
import {
    durableChildCollectionRow,
    type DurableChildSubject,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import {
    DURABLE_CHILD_ROWS_KEY,
    truthHoldsDurableChildCollection,
} from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";
import { cardAppliesToGrain } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { findInquiryChildRow } from "@/lib/adminV2/runtime/focusPanel/children/childFocusEditState";
import { derivePersonEmploymentCard } from "@/lib/adminV2/runtime/focusPanel/durableSubject/derivePersonFocusPanelCards";
import { derivePersonFocusPanelCards } from "@/lib/adminV2/runtime/focusPanel/durableSubject/derivePersonFocusPanelCards";

const NOW = new Date("2026-08-18T12:00:00.000Z");

/** Lennon, as the composer produces him: identity, profile scalars, and his own collection row. */
function lennon(): DurableChildSubject {
    const subject: DurableChildSubject = {
        memberId: "cm-lennon",
        personId: null,
        householdId: "cust-kurzman",
        label: "Lennon Kurzman",
        dateOfBirth: "2022-04-11",
        householdName: "Kurzman Family",
        isActive: true,
        truth: {
            customer_member_id: "cm-lennon",
            first_name: "Lennon",
            last_name: "Kurzman",
            dob: "2022-04-11",
            gender: "male",
            allergies: "Peanuts",
            medical_notes: "Inhaler in the office",
            special_instructions: "Naps after lunch",
        },
    };
    subject.truth[DURABLE_CHILD_ROWS_KEY] = [durableChildCollectionRow(subject)];
    return subject;
}

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Source with COMMENTS REMOVED, for assertions about what a file does.
 *
 * A blunt scan over raw source flags the file's own docblock explaining why it does not do the
 * thing — the assertion then fails on the prose that proves it is right. Every "this file must not
 * contain X" check below reads code only.
 */
const code = (rel: string) =>
    src(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the Child context resolves the canonical Children card, not an invented one", () => {
    it("the durable child panel composes `children` — the same key the case panel composes", () => {
        const cards = deriveChildFocusPanelCards({ subject: lennon(), now: NOW });
        expect([...cards.keys()]).toEqual(["children"]);
        expect(cards.get("children")!.key).toBe("children");
        // The invented card is not what a child record leads with any more.
        expect(cards.has("child_identity")).toBe(false);
    });

    it("both hosts build that model from ONE producer, given the same truth", () => {
        const subject = lennon();
        const fromDurablePanel = deriveChildFocusPanelCards({ subject, now: NOW }).get("children")!;
        const fromSharedProducer = buildChildrenCardModel(subject.truth);
        expect(fromDurablePanel).toEqual(fromSharedProducer);
    });

    it("the card reaches the child grain, and the registry is what says so", () => {
        expect(cardAppliesToGrain("children", "child")).toBe(true);
    });
});

describe("the canonical content an operator was missing is actually there", () => {
    it("carries the profile facts the invented card had no room for", () => {
        const child = buildChildrenCardEvidence({ truth: lennon().truth }).children[0]!;
        expect(child.name).toBe("Lennon Kurzman");
        expect(child.firstName).toBe("Lennon");
        expect(child.lastName).toBe("Kurzman");
        expect(child.dob).toBe("2022-04-11");
        expect(child.gender).toBe("Male");
        expect(child.allergies).toBe("Peanuts");
        expect(child.medicalNotes).toBe("Inhaler in the office");
        expect(child.specialInstructions).toBe("Naps after lunch");
    });

    it("the server composer is what supplies the collection — not a host assembling one", () => {
        // Two hosts assembling their own row is how they drift. `composeDurableChildSubject` writes
        // it once, and the Operations host spreads the composed truth without adding to it.
        expect(src("lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildSubject.ts")).toContain(
            "durableChildCollectionRow(subject)",
        );
        expect(code("components/presentation/durableRecord/DurableRecordContextualCard.tsx")).not.toContain(
            DURABLE_CHILD_ROWS_KEY,
        );
    });
});

describe("editability travels with the card", () => {
    it("the host mounts the canonical renderer WITH a mutation seam", () => {
        const host = src("components/presentation/durableRecord/DurableRecordContextualCard.tsx");
        expect(host).toContain("FocusPanelCardRenderer");
        expect(host).toContain("buildDurableChildFocusPanelMutation");
        expect(host).toContain("mutation={childMutation}");
        // A card that renders its fields and refuses to change them is a different card wearing the
        // right labels — which is what a read-only clone would be.
        expect(code("components/presentation/durableRecord/DurableRecordContextualCard.tsx")).not.toContain(
            "deriveChildIdentityCard",
        );
    });

    it("the seam calls the SAME write authorities the case host calls", () => {
        const durable = src("lib/adminV2/runtime/focusPanel/durableSubject/buildDurableChildFocusPanelMutation.ts");
        const cased = src("lib/adminV2/runtime/focusPanel/focusPanelMutation.ts");
        for (const authority of [
            "patchInquiryChildIdentityFromDrawer",
            "patchCustomerMemberFromInquiryChild",
        ]) {
            expect(durable).toContain(authority);
            expect(cased).toContain(authority);
        }
        // Not a second write path: identity and profile writes go through the shared authorities, so
        // the durable seam names no child route of its own. The only direct route it calls is the
        // person profile-photo one, which the case seam calls identically.
        const durableCode = code(
            "lib/adminV2/runtime/focusPanel/durableSubject/buildDurableChildFocusPanelMutation.ts",
        );
        expect(durableCode).not.toContain("/api/admin/customer-members");
        const directRoutes = [...durableCode.matchAll(/\/api\/admin\/[a-z-]+/g)].map((m) => m[0]);
        expect([...new Set(directRoutes)]).toEqual(["/api/admin/persons"]);
    });

    it("the inline-save seed resolves on a durable host — an edit that cannot seed is an edit that lies", () => {
        /*
         * `findInquiryChildRow` read `_inquiry_children` directly while the card composed through the
         * normalizer. On a durable host the two disagreed: the card rendered Lennon and offered Edit,
         * the seed came back null, and `saveInquiryChild` returned `{ok:false}` with nothing to say.
         */
        const row = findInquiryChildRow(lennon().truth, "cm-lennon");
        expect(row?.customer_member_id).toBe("cm-lennon");
    });

    it("participation fields are refused rather than written into an enrollment that does not exist", () => {
        const durable = src("lib/adminV2/runtime/focusPanel/durableSubject/buildDurableChildFocusPanelMutation.ts");
        expect(durable).toContain("PARTICIPATION_ELSEWHERE");
        expect(durable).toContain("patch.ocmPatch");
    });
});

describe("a child on a family CASE is not treated as a record's subject", () => {
    it("the durable collection key is what separates them, not the grain", () => {
        // Durable record: the subject alone, under its own key.
        expect(truthHoldsDurableChildCollection(lennon().truth)).toBe(true);
        // Child attention on a settled family case: same grain, but a family's roster.
        expect(
            truthHoldsDurableChildCollection({
                _inquiry_children: [{ id: "a" }, { id: "b" }],
            }),
        ).toBe(false);
        // A truth carrying both is read as the case it claims to be.
        expect(
            truthHoldsDurableChildCollection({
                _inquiry_children: [{ id: "a" }],
                [DURABLE_CHILD_ROWS_KEY]: [{ id: "a" }],
            }),
        ).toBe(false);
    });

    it("the card asks that question before opening focused", () => {
        const card = src("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(card).toContain("truthHoldsDurableChildCollection(context.truth)");
    });
});

describe("Employment is already canonical, and Operations renders that one", () => {
    it("the host renders the person-grain producer the durable panel composes", () => {
        const jane = {
            personId: "p-jane",
            personLabel: "Jane Okafor",
            employment: {
                is_staff: true,
                current: {
                    state_label: "Active",
                    position_label: "Lead Teacher",
                    primary_location_label: "Northwind — Riverside Campus",
                    employment_type_label: "Full time",
                },
                periods: [],
            },
        };
        const person = {
            personId: "p-jane",
            label: "Jane Okafor",
            // The signal shape the composer produces: primary first, then every person with a period.
            employment: { primary: jane, people: [jane], hasEmployment: true },
            truth: {},
        };

        const fromPanel = derivePersonFocusPanelCards({ employment: person.employment }).get("employment");
        const fromHostProducer = derivePersonEmploymentCard(person.employment);
        expect(fromPanel).toEqual(fromHostProducer);

        const host = code("components/presentation/durableRecord/DurableRecordContextualCard.tsx");
        expect(host).toContain("derivePersonEmploymentCard(subject.person.employment)");
        // Read-only on both hosts. This slice renders the existing card; it does not widen it.
        expect(host).not.toContain("mutation={employmentMutation}");
    });
});
