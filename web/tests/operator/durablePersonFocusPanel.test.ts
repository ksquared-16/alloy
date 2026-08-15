/**
 * DURABLE PERSON FOCUS PANEL — Workstreams B + D.
 *
 * Three properties, in order of how badly each would fail silently:
 *
 *  1. A staff Person with no household, no Opportunity and no Work Unit composes a SETTLED Focus
 *     Panel model with the Employment card in it.
 *  2. Card applicability is DECLARED per card and selected by grain — case-only cards do not reach a
 *     person surface merely by existing in the global catalog.
 *  3. The existing case surface is UNCHANGED: same cards, same order, same doc object.
 *
 * (3) is the one that would be invisible. Grain generalization that quietly reshuffles the enrollment
 * panel would still pass every person-side assertion, so the case regression is asserted by object
 * IDENTITY and by explicit card order, not by "it still renders".
 */

import { describe, expect, it } from "vitest";

import {
    FOCUS_PANEL_SUMMARY_DEFAULT_DOC,
    focusPanelSummaryDefaultDocForGrain,
} from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import {
    FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION,
    focusPanelDefaultCompositionForGrain,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import {
    cardAppliesToGrain,
    cardGrains,
    cardKeysForGrain,
    FOCUS_PANEL_CARDS,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { DEFAULT_CARD_GRAINS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrainConcern";
import { asFocusPanelSubjectGrain } from "@/lib/adminV2/runtime/focusPanel/focusPanelSubjectGrainRead";
import { focusPanelWorkModeModelFromDurablePerson } from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import {
    personEmploymentSignal,
    type DurablePersonSubject,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durablePersonSubjectModel";
import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";
import { NOT_APPLICABLE_CASE_SIGNALS } from "@/lib/adminV2/runtime/operationalContext/types";

const PERSON_ID = "person-teacher";

/** Exactly what `buildPersonEmploymentComposition` returns for an employed staff member. */
function employedComposition(): PersonEmploymentComposition {
    return {
        is_staff: true,
        current: {
            id: "emp-1",
            status: "active",
            state_label: "Active",
            is_open: true,
            position_label: "Lead Teacher",
            employment_type: "full_time",
            employment_type_label: "Full time",
            primary_location_id: "loc-1",
            primary_location_label: "Riverside",
            external_employee_id: null,
            start_date: "2026-01-05",
            end_date: null,
            end_reason_key: null,
        },
        periods: [
            {
                id: "emp-1",
                status: "active",
                state_label: "Active",
                is_open: true,
                position_label: "Lead Teacher",
                employment_type: "full_time",
                employment_type_label: "Full time",
                primary_location_id: "loc-1",
                primary_location_label: "Riverside",
                external_employee_id: null,
                start_date: "2026-01-05",
                end_date: null,
                end_reason_key: null,
            },
        ],
        configured_facts: [],
        never_employed: false,
    };
}

function neverEmployedComposition(): PersonEmploymentComposition {
    return { is_staff: false, current: null, periods: [], configured_facts: [], never_employed: true };
}

/**
 * A staff member exactly as `staff.add` creates one — and nothing else. No `_customer_persons`, no
 * `_linked_opportunities`: the point of the fixture is that those are genuinely absent, not empty.
 */
function staffSubject(
    composition: PersonEmploymentComposition = employedComposition(),
): DurablePersonSubject {
    const truth: Record<string, unknown> = {
        id: PERSON_ID,
        org_id: "org-1",
        first_name: "Dana",
        last_name: "Okafor",
        _person_name: "Dana Okafor",
        _employment: composition,
    };
    return {
        personId: PERSON_ID,
        label: "Dana Okafor",
        truth,
        employment: personEmploymentSignal(PERSON_ID, "Dana Okafor", composition),
    };
}

// ── B — the durable Person model ─────────────────────────────────────────────────────

describe("a staff Person with no case composes a Focus Panel model", () => {
    const model = focusPanelWorkModeModelFromDurablePerson({
        mode: "summary",
        subject: staffSubject(),
        canMutate: true,
    });

    it("is a person subject, settled, from the durable producer", () => {
        expect(model.subject).toEqual({ type: "person", id: PERSON_ID, label: "Dana Okafor" });
        expect(model.source).toBe("durable_subject");
        // Settled, not commit: there is no later pass, so a card that is not ready is resolved-empty.
        expect(model.phase).toBe("settled");
        expect(model.context.grain).toBe("person");
        expect(model.context.status).toBe("ready");
    });

    it("includes the Employment card, ready, with the person's own answer", () => {
        expect(model.cardReadiness.get("employment")).toBe("ready");
        const card = model.cardModels.get("employment");
        expect(card?.visible).toBe(true);
        // "who, in what capacity, where" — minus the name, which is the surface's own subject.
        expect(card?.insight).toBe("Lead Teacher at Riverside");
        expect(card?.statusChip).toBe("Active");
    });

    it("carries employment truth verbatim from lib/employment and recomputes nothing", () => {
        const signal = model.context.employment;
        expect(signal?.primary?.personId).toBe(PERSON_ID);
        // The composition object is passed through, not rebuilt at another grain.
        expect(signal?.primary?.employment).toEqual(employedComposition());
        expect(signal?.people).toHaveLength(1);
    });

    it("claims no business process, because a person is not in one", () => {
        expect(model.context.businessProcess).toEqual({ key: null, label: null, stageKey: null });
        expect(model.perspective).toBeNull();
        expect(model.statusLabel).toBeNull();
    });

    it("offers no commands — employment is authored elsewhere", () => {
        expect(model.commands).toEqual([]);
        expect(model.cardModels.get("employment")?.primaryAction).toBeNull();
    });

    it("never-employed resolves to not_applicable, keeping the cell without claiming employment", () => {
        const m = focusPanelWorkModeModelFromDurablePerson({
            mode: "summary",
            subject: staffSubject(neverEmployedComposition()),
            canMutate: true,
        });
        expect(m.cardReadiness.get("employment")).toBe("not_applicable");
        expect(m.cardModels.get("employment")?.visible).toBe(false);
        // Null signal, not an empty one: "never employed" is an answer the card must not dress up.
        expect(m.context.employment).toBeNull();
    });
});

describe("the case-shaped signals are not read on a person panel", () => {
    // NOT_APPLICABLE_CASE_SIGNALS is safe ONLY under this invariant. If a future person-grain card
    // reads one of these, it gets a zero that means "not applicable" and renders it as an answer.
    it("no card declared for the person grain is a case-signal consumer", () => {
        const CASE_SIGNAL_CARDS = [
            "current_work",
            "attention",
            "tour_summary",
            "communications",
            "billing_preview",
            "readiness_kpi",
            "health",
        ] as const;
        for (const key of CASE_SIGNAL_CARDS) {
            expect(cardAppliesToGrain(key, "person"), `${key} must not apply to person`).toBe(false);
        }
    });

    it("the constant is the declared not-applicable state, not incidental zeroes", () => {
        const model = focusPanelWorkModeModelFromDurablePerson({
            mode: "summary",
            subject: staffSubject(),
            canMutate: true,
        });
        expect(model.context.signals).toBe(NOT_APPLICABLE_CASE_SIGNALS);
    });
});

// ── D — grain-aware card selection ───────────────────────────────────────────────────

describe("card applicability is declared per card, not switched centrally", () => {
    it("Employment is the one card declared for both case and person", () => {
        expect(cardGrains("employment")).toEqual(["opportunity", "person"]);
        expect(cardAppliesToGrain("employment", "person")).toBe(true);
        expect(cardAppliesToGrain("employment", "opportunity")).toBe(true);
    });

    it("an undeclared card is case-only — silence never widens applicability", () => {
        expect(DEFAULT_CARD_GRAINS).toEqual(["opportunity"]);
        /*
         * `children` is the honest witness for this rule now that `household` carries a declaration
         * of its own — and it stays undeclared deliberately, not by oversight.
         * `buildChildrenCardModel` reads `_inquiry_children`, which is ONE ENROLLMENT'S projection of
         * a family's children; a durable household knows its children through `customer_members`, a
         * wider and differently-shaped set. Declaring the grain without a builder that reads the
         * canonical edge would put enrollment framing on children who have no enrollment.
         */
        expect(cardGrains("children")).toEqual(["opportunity"]);
        expect(cardAppliesToGrain("children", "household")).toBe(false);
        expect(cardAppliesToGrain("children", "person")).toBe(false);
        // …and a declaration widens a card only to the grains it NAMES, never to every grain: the
        // Household card is declared for `household`, and is still not a person card.
        expect(cardAppliesToGrain("household", "person")).toBe(false);
    });

    it("Household is declared for the case AND the durable family", () => {
        // The second card to carry a grain declaration, and the reason the durable Household surface
        // composes at all: silence would have left it case-only, `deriveHouseholdFocusPanelCards`
        // would have built nothing, and the record would have opened empty.
        expect(cardGrains("household")).toEqual(["opportunity", "household"]);
        expect(cardAppliesToGrain("household", "household")).toBe(true);
        expect(cardAppliesToGrain("household", "opportunity")).toBe(true);
    });

    it("the person grain selects only Employment out of the whole catalog", () => {
        expect(cardKeysForGrain("person")).toEqual(["employment"]);
        // The catalog is one vocabulary; selection is what varies.
        expect(FOCUS_PANEL_CARDS.length).toBeGreaterThan(10);
    });

    it("every card that was case-grain is still case-grain — only child-grain cards are excluded", () => {
        // Written when every registered card was case-only. It is no longer "all of them", and that
        // is the point: the ONLY cards outside the case grain are ones explicitly declared elsewhere.
        const caseKeys = cardKeysForGrain("opportunity");
        const excluded = FOCUS_PANEL_CARDS.map((c) => c.key).filter((k) => !caseKeys.includes(k));
        expect(excluded).toEqual(["child_identity"]);
    });

    it("an unsupported grain/card pair is refused deterministically, never thrown", () => {
        expect(cardAppliesToGrain("current_work", "person")).toBe(false);
        expect(cardAppliesToGrain("employment", "child")).toBe(false);
        // An unregistered key is applicable to NOTHING — including the case grain, so an unknown
        // card can never slip onto the enrollment panel through the default.
        expect(cardAppliesToGrain("not_a_card" as never, "opportunity")).toBe(false);
        expect(cardAppliesToGrain("not_a_card" as never, "person")).toBe(false);
    });

    it("a person model emits no cell for a card that does not apply", () => {
        const model = focusPanelWorkModeModelFromDurablePerson({
            mode: "summary",
            subject: staffSubject(),
            canMutate: true,
        });
        expect([...model.cardModels.keys()]).toEqual(["employment"]);
        // No empty shell pretending applicability.
        expect(model.cardReadiness.has("current_work")).toBe(false);
        expect(model.cardReadiness.has("household")).toBe(false);
    });
});

describe("default composition varies by grain", () => {
    it("person composes exactly one card, and it is Employment", () => {
        const composition = focusPanelDefaultCompositionForGrain("person");
        expect(composition.map((e) => e.key)).toEqual(["employment"]);
        expect(composition[0]!.visibility).toBe("visible");
    });

    it("child composes its own identity card, never the case composition", () => {
        // Was asserted EMPTY before Workstream C — the point then and now is the same: a second
        // surface must not fall through to the enrollment cards (inventory R3).
        expect(focusPanelDefaultCompositionForGrain("child").map((e) => e.key)).toEqual(["child_identity"]);
        expect(focusPanelSummaryDefaultDocForGrain("child").sections).toHaveLength(1);
    });

    it("every card a grain's default composition places is declared for that grain", () => {
        for (const grain of ["opportunity", "person", "child"] as const) {
            for (const entry of focusPanelDefaultCompositionForGrain(grain)) {
                expect(
                    cardAppliesToGrain(entry.key, grain),
                    `${entry.key} is placed on the ${grain} surface but not declared for it`,
                ).toBe(true);
            }
        }
    });
});

// ── CASE REGRESSION — the failure that would be invisible ────────────────────────────

describe("the existing case surface is unchanged", () => {
    it("the case default doc is the SAME OBJECT, not an equivalent rebuild", () => {
        expect(focusPanelSummaryDefaultDocForGrain("opportunity")).toBe(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        expect(focusPanelDefaultCompositionForGrain("opportunity")).toBe(
            FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION,
        );
    });

    it("the case card set and its reading order are exactly what they were", () => {
        expect(FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.map((e) => e.key)).toEqual([
            "current_work",
            "household",
            "children",
            "scheduling",
            "billing_preview",
            "employment",
            "tour_summary",
            "communications",
            "milestones",
        ]);
    });

    it("the case doc's sections keep their order and visibility", () => {
        const sections = FOCUS_PANEL_SUMMARY_DEFAULT_DOC.sections;
        expect(sections).toHaveLength(FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.length);
        expect(sections.map((s, i) => s.key === FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION[i]!.key)).not.toContain(
            false,
        );
    });

    it("an opportunity subject still reads as the case grain", () => {
        expect(asFocusPanelSubjectGrain("opportunity")).toBe("opportunity");
        // Compatibility default: unrecognized narrows to the case grain, which is what the surface
        // has always been — the renderer never blanks on an unexpected producer.
        expect(asFocusPanelSubjectGrain(undefined)).toBe("opportunity");
        expect(asFocusPanelSubjectGrain("typo")).toBe("opportunity");
        expect(asFocusPanelSubjectGrain("person")).toBe("person");
        expect(asFocusPanelSubjectGrain("child")).toBe("child");
    });
});

// ── E — optional operational-host enrichment (person) ────────────────────────────────

describe("a person's operational host is enrichment only", () => {
    const HOST = { opportunityId: "opp-active", workUnitKey: "enrollment_pipeline" };

    function personModel(host: typeof HOST | null) {
        return focusPanelWorkModeModelFromDurablePerson({
            mode: "summary",
            subject: staffSubject(),
            canMutate: true,
            operationalHost: host,
        });
    }

    it("is null for a staff member with no household — the ordinary case", () => {
        expect(personModel(null).context.operationalHost).toBeNull();
    });

    it("is carried when a household case is being worked", () => {
        expect(personModel(HOST).context.operationalHost).toEqual(HOST);
    });

    it("changes neither identity, cards, nor businessProcess", () => {
        const withHost = personModel(HOST);
        const without = personModel(null);
        expect(withHost.subject).toEqual(without.subject);
        expect([...withHost.cardModels.keys()]).toEqual([...without.cardModels.keys()]);
        expect(withHost.cardModels.get("employment")).toEqual(without.cardModels.get("employment"));
        expect(withHost.context.businessProcess).toEqual({ key: null, label: null, stageKey: null });
    });
});
