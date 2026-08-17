import { describe, expect, it } from "vitest";

import { resolveSearchDestinations, splitInlineDestinations } from "@/lib/search/searchDestinations";
import type {
    SearchContext,
    SearchOperationalMembershipRef,
    SearchSubject,
} from "@/lib/search/searchContracts";

/**
 * DESTINATIONS COME FROM MEMBERSHIP, NOT FROM STAGE.
 *
 * The reported defect: Search displayed "Enrollment — Waitlist" for a waitlisted child and then
 * committed the family case's unit, whose default lens is `New` — a real, operational, and entirely
 * empty view. The label was right and the destination was a different grain's answer.
 *
 * These pin the destination layer specifically: given truthful memberships, what does Search OFFER,
 * and what does it refuse to offer.
 */

const CASE = "opp-kurzman";
const HOUSEHOLD = "cust-kurzman";
const FAMILY_UNIT = "new-leads";

const membership = (
    id: string,
    label: string,
    rowGrain: "child" | "family",
): SearchOperationalMembershipRef => ({
    work_view_id: id,
    label,
    row_grain: rowGrain,
    host_work_unit_key: FAMILY_UNIT,
    host_entity_id: CASE,
    // The Work View ROW identity. A child lens rows at PARTICIPATIONS — never the case, never the
    // durable child. A family lens rows at the case, where member and host genuinely coincide.
    operational_member_id: rowGrain === "child" ? `pi-${id}` : CASE,
});

const enrollment = (memberships: SearchOperationalMembershipRef[]): SearchContext => ({
    kind: "process",
    key: "enrollment",
    label: "Enrollment",
    detail: "Waitlist",
    destination_entity_type: "opportunity",
    destination_entity_id: CASE,
    destination_work_unit_key: FAMILY_UNIT,
    // The stage signal is still carried. It must not be what decides the destination.
    destination_work_view_id: "new_leads",
    operational_memberships: memberships,
});

const lennon: SearchSubject = {
    kind: "child",
    id: "cm-lennon",
    display_name: "Lennon Kurzman",
    person_id: "p-lennon",
    household_id: HOUSEHOLD,
};

const kurzmanFamily: SearchSubject = {
    kind: "household",
    id: HOUSEHOLD,
    display_name: "Kurzman Family",
    household_id: HOUSEHOLD,
    household_case_entity_id: CASE,
    household_case_work_unit_key: FAMILY_UNIT,
};

const resolve = (
    subject: SearchSubject,
    contexts: SearchContext[],
    promotedKeys: readonly string[] = [],
) => resolveSearchDestinations({ subject, contexts, promotedKeys });

const keys = (ds: ReturnType<typeof resolve>) => ds.map((d) => d.key);
const labels = (ds: ReturnType<typeof resolve>) => ds.map((d) => d.label);

describe("a subject's destinations are its truthful cohorts", () => {
    it("a child with ONE membership offers exactly that view — never the empty family default", () => {
        // The live Lennon shape.
        const destinations = resolve(lennon, [enrollment([membership("waitlist", "Waitlist", "child")])]);

        expect(labels(destinations)).toContain("Waitlist");
        // `new_leads` is the family unit's default lens and contains neither Lennon nor the family.
        expect(keys(destinations)).not.toContain("work_view:enrollment:new_leads");
        // The generic per-process destination is superseded — it had to guess a host.
        expect(keys(destinations)).not.toContain("process:enrollment");
    });

    it("the Work View destination commits the VIEW and focuses the child as an ITEM", () => {
        // "Show me Lennon in Waitlist" — the whole chain: host, subject, Children ASPECT, item.
        const [, waitlist] = resolve(lennon, [
            enrollment([membership("waitlist", "Waitlist", "child")]),
        ]);

        expect(waitlist.target).toBe("focus_panel");
        expect(waitlist.host_work_view_id).toBe("waitlist");
        expect(waitlist.host_work_unit_key).toBe(FAMILY_UNIT);
        expect(waitlist.host_entity_id).toBe(CASE);
        expect(waitlist.item_id).toBe("cm-lennon");
        expect(waitlist.card_key).toBeTruthy();
    });

    it("OVERLAPPING memberships each become their own destination", () => {
        const destinations = resolve(lennon, [
            enrollment([
                membership("waitlist", "Waitlist", "child"),
                membership("all_children", "All Children", "child"),
            ]),
        ]);

        expect(labels(destinations)).toEqual(expect.arrayContaining(["Waitlist", "All Children"]));
        // Two cohorts of one process are two distinct operator intents; neither dedupes the other.
        expect(keys(destinations)).toContain("work_view:enrollment:waitlist");
        expect(keys(destinations)).toContain("work_view:enrollment:all_children");
    });

    it("THREE memberships all survive, and stay compact behind the existing overflow", () => {
        const destinations = resolve(lennon, [
            enrollment([
                membership("waitlist", "Waitlist", "child"),
                membership("all_children", "All Children", "child"),
                membership("priority", "Priority", "child"),
            ]),
        ]);

        const viewKeys = keys(destinations).filter((k) => k.startsWith("work_view:"));
        expect(viewKeys).toHaveLength(3);

        // Compactness is the EXISTING mechanism's job, not a new nested menu.
        const { inline, overflow } = splitInlineDestinations(destinations);
        expect(inline.length + overflow.length).toBe(destinations.length);
        expect(inline.length).toBeLessThanOrEqual(destinations.length);
    });

    it("SIBLINGS sharing one case do not contaminate each other", () => {
        const wrigley: SearchSubject = { ...lennon, id: "cm-wrigley", display_name: "Wrigley Kurzman" };

        const lennonDests = keys(
            resolve(lennon, [enrollment([membership("waitlist", "Waitlist", "child")])]),
        );
        const wrigleyDests = keys(
            resolve(wrigley, [enrollment([membership("enrolling", "Enrolling", "child")])]),
        );

        expect(lennonDests).toContain("work_view:enrollment:waitlist");
        expect(wrigleyDests).not.toContain("work_view:enrollment:waitlist");
        expect(wrigleyDests).toContain("work_view:enrollment:enrolling");
    });

    it("a household offers ITS memberships, and never its children's", () => {
        // The live Kurzman Family shape: All and Tours, both family grain.
        const destinations = resolve(kurzmanFamily, [
            enrollment([membership("all_work", "All", "family"), membership("tours", "Tours", "family")]),
        ]);

        expect(labels(destinations)).toEqual(expect.arrayContaining(["All", "Tours"]));
        expect(keys(destinations)).not.toContain("work_view:enrollment:waitlist");
        // A household is worked at case grain — it is not an item inside a Children card.
        const all = destinations.find((d) => d.key === "work_view:enrollment:all_work");
        expect(all?.item_id ?? null).toBeNull();
    });

    it("NO memberships ⇒ the subject keeps its process context rather than losing everything", () => {
        const destinations = resolve(lennon, [enrollment([])]);
        expect(keys(destinations)).toContain("process:enrollment");
    });
});

describe("the subject click does not claim a Work View the operator did not choose", () => {
    it("claims NO Work View at all — the strongest form of not choosing one", () => {
        // This test used to assert the subject click hosted on a view that PROVABLY contained the
        // subject, which was the best available answer while the record click was still an
        // operational movement. It no longer has to settle: "show me Lennon" is a record intent and
        // names no lens, provable or otherwise.
        const [primary] = resolve(lennon, [enrollment([membership("waitlist", "Waitlist", "child")])]);

        expect(primary.key).toBe("subject");
        expect(primary.label).toContain("Lennon");
        expect(primary.target).toBe("durable_record");
        expect(primary.host_work_view_id ?? null).toBeNull();
        expect(primary.host_work_unit_key ?? null).toBeNull();
    });

    it("the OPERATIONAL cohorts still host on views that PROVABLY contain the subject", () => {
        // The property the old subject assertion protected, kept where it belongs. Previously this
        // fell back to the case unit, whose default lens was the empty `New`.
        const waitlist = resolve(lennon, [enrollment([membership("waitlist", "Waitlist", "child")])]).find(
            (d) => d.key === "work_view:enrollment:waitlist",
        )!;

        expect(waitlist.host_work_view_id).toBe("waitlist");
        expect(waitlist.host_work_view_id).not.toBe("new_leads");
    });

    it("with nothing provable the process destination falls back to the stage signal", () => {
        // Still a fallback, never an invention — and now it can only affect an explicitly
        // operational destination, never the record click.
        const process = resolve(lennon, [enrollment([])]).find((d) => d.key === "process:enrollment")!;
        expect(process.host_work_view_id).toBe("new_leads");
    });
});

describe("ranking reorders truthful destinations and never creates one", () => {
    it("`Lennon waitlist` promotes Waitlist above the other cohorts", () => {
        const destinations = resolve(
            lennon,
            [
                enrollment([
                    membership("all_children", "All Children", "child"),
                    membership("waitlist", "Waitlist", "child"),
                ]),
            ],
            // Intent promotes the DESTINATION key verbatim — the vocabulary carries view labels.
            ["work_view:enrollment:waitlist"],
        );

        const secondary = destinations.filter((d) => d.key !== "subject");
        expect(secondary[0].key).toBe("work_view:enrollment:waitlist");
    });

    it("`Kurzman tours` promotes Tours for the household", () => {
        const destinations = resolve(
            kurzmanFamily,
            [enrollment([membership("all_work", "All", "family"), membership("tours", "Tours", "family")])],
            ["work_view:enrollment:tours"],
        );

        const secondary = destinations.filter((d) => d.key !== "subject");
        expect(secondary[0].key).toBe("work_view:enrollment:tours");
    });

    it("promoting a cohort the subject does NOT belong to adds nothing", () => {
        // The load-bearing half of ranking. Naming a view in a query is not evidence of membership.
        const destinations = resolve(
            lennon,
            [enrollment([membership("waitlist", "Waitlist", "child")])],
            ["work_view:enrollment:tours"],
        );

        expect(keys(destinations)).not.toContain("work_view:enrollment:tours");
        expect(keys(destinations)).toContain("work_view:enrollment:waitlist");
    });
});
