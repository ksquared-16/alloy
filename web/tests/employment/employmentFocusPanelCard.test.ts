/**
 * EMPLOYMENT ON THE FOCUS PANEL — the card seam, end to end through the pure layers.
 *
 * Two distinctions carry the weight here, and both are the kind that fail silently:
 *
 *   1. "not composed yet" vs "nobody is staff". A card that reads an absent projection as an
 *      answer tells the operator a family has no staff before the enrichment pass has run.
 *   2. `visible: false` vs a rendered empty card. An empty "Employment" shell asserts a
 *      relationship that does not exist.
 */

import { describe, expect, it } from "vitest";

import { buildEmploymentCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { FOCUS_PANEL_CARD_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { cardDefinition } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { normalizeFocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import { FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import type { OperationalSubjectViewModel } from "@/lib/adminV2/viewModel/drawer/types";

const period = (overrides: Record<string, unknown> = {}) => ({
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
    start_date: "2026-08-01",
    end_date: null,
    end_reason_key: null,
    ...overrides,
});

const projection = (people: unknown[], primaryPersonId: string | null = null) => ({
    primary: primaryPersonId ? { person_id: primaryPersonId } : null,
    people,
});

const employedPerson = (personId: string, label: string, current: unknown = period()) => ({
    person_id: personId,
    person_label: label,
    employment: { is_staff: Boolean(current), current, periods: current ? [current] : [], configured_facts: [] },
});

describe("Employment card vocabulary", () => {
    it("is a declared card key, catalog entry, registry entry and gesture destination", () => {
        expect(FOCUS_PANEL_CARD_KEYS).toContain("employment");
        expect(normalizeFocusPanelCardKey("Employment")).toBe("employment");
        expect(cardDefinition("employment")?.title).toBe("Employment");
        expect(OPERATOR_FOCUS_CARDS.employment).toBe("employment");
    });

    it("does NOT own operational truth — it reads a person-owned projection", () => {
        // Ownership flags drive canvas elevation and edit affordances. Claiming truth ownership
        // here would offer employment editing on a surface with no employment write path.
        expect(cardDefinition("employment")?.ownsOperationalTruth).toBeUndefined();
    });

    it("is placed VISIBLE in the default composition, not Linked", () => {
        // A Linked card is navigable but never rendered (`linkedCardKeys` only feeds focusTargets),
        // so a staff gesture would land on a panel that does not show the answer.
        const entry = FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.find((e) => e.key === "employment");
        expect(entry?.visibility).toBe("visible");
        expect(entry?.area).toBeTruthy();
    });

    it("occupies its own row — existing card geometry is untouched", () => {
        const employment = FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.find((e) => e.key === "employment")!;
        const others = FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.filter((e) => e.key !== "employment" && e.area);
        for (const other of others) {
            const otherEnd = other.area!.rowStart + other.area!.rowSpan;
            expect(
                employment.area!.rowStart,
                `employment overlaps ${other.key}`,
            ).toBeGreaterThanOrEqual(otherEnd);
        }
    });
});

describe("buildEmploymentCardModel", () => {
    it("is not visible when no linked contact holds employment", () => {
        const model = buildEmploymentCardModel({ _case_employment: projection([]) });
        expect(model.visible).toBe(false);
    });

    it("is not visible when the projection is absent entirely", () => {
        expect(buildEmploymentCardModel({}).visible).toBe(false);
    });

    it("leads with the primary contact and answers who / what / where in one line", () => {
        const model = buildEmploymentCardModel({
            _case_employment: projection(
                [employedPerson("p-2", "Blake Guardian"), employedPerson("p-1", "Avery Guardian")],
                "p-1",
            ),
        });
        expect(model.visible).toBe(true);
        expect(model.insight).toBe("Avery Guardian — Lead Teacher at Riverside");
        expect(model.statusChip).toBeTruthy();
    });

    it("falls back to the first employed contact when the primary person is not staff", () => {
        const model = buildEmploymentCardModel({
            _case_employment: projection([employedPerson("p-2", "Blake Guardian")], null),
        });
        expect(model.insight).toBe("Blake Guardian — Lead Teacher at Riverside");
    });

    it("says so in the past tense when employment has ended", () => {
        const ended = {
            person_id: "p-1",
            person_label: "Avery Guardian",
            employment: {
                is_staff: false,
                current: null,
                periods: [period({ position_label: "Assistant", end_date: "2026-06-30" })],
                configured_facts: [],
            },
        };
        const model = buildEmploymentCardModel({ _case_employment: projection([ended], "p-1") });
        expect(model.insight).toBe("Avery Guardian worked here as Assistant");
        expect(model.statusTone).toBe("neutral");
    });

    it("reports additional employed contacts rather than hiding them", () => {
        const model = buildEmploymentCardModel({
            _case_employment: projection(
                [employedPerson("p-1", "Avery Guardian"), employedPerson("p-2", "Blake Guardian")],
                "p-1",
            ),
        });
        expect(model.secondaryInsight).toBe("1 other contact with employment here");
    });

    it("offers NO mutation — Add/Edit/End belong to /organization/staff", () => {
        const model = buildEmploymentCardModel({
            _case_employment: projection([employedPerson("p-1", "Avery Guardian")], "p-1"),
        });
        expect(model.primaryAction).toBeNull();
    });
});

describe("employment on the Operational Context", () => {
    const subjectVm = {
        entity: { type: "opportunity" },
        above_fold: { record: {} },
        workspace: { stage_context: null, lifecycle_rail: null, stage_work_runtime: null, stage_work: null },
        summaries: { tasks: null, attention: null, active_tour_bookings: [], reminders: null },
        actions: { header_menu: [], record_header: null },
        activity: {},
    } as unknown as OperationalSubjectViewModel;

    const contextFor = (truth: Record<string, unknown>) =>
        buildOperationalContext({
            subjectId: "opp-1",
            title: "Testfamily",
            subjectVm,
            truth,
            perspective: null,
            statusLabel: null,
            canMutate: true,
        });

    it("distinguishes NOT COMPOSED from NOBODY IS STAFF", () => {
        // Absent key: enrichment has not run. Null, so the card stays silent.
        expect(contextFor({}).employment).toBeNull();

        // Present-but-empty: enrichment ran and found nobody. A real answer.
        const answered = contextFor({ _case_employment: projection([]) }).employment;
        expect(answered).not.toBeNull();
        expect(answered!.hasEmployment).toBe(false);
    });

    it("projects the people and resolves the primary from the projection", () => {
        const ctx = contextFor({
            _case_employment: projection(
                [employedPerson("p-1", "Avery Guardian"), employedPerson("p-2", "Blake Guardian")],
                "p-1",
            ),
        });
        expect(ctx.employment!.hasEmployment).toBe(true);
        expect(ctx.employment!.people.map((p) => p.personId)).toEqual(["p-1", "p-2"]);
        expect(ctx.employment!.primary?.personLabel).toBe("Avery Guardian");
    });

    it("drops malformed rows instead of surfacing a half-answer", () => {
        const ctx = contextFor({
            _case_employment: projection([{ person_id: "p-1" }, employedPerson("p-2", "Blake Guardian")]),
        });
        expect(ctx.employment!.people.map((p) => p.personId)).toEqual(["p-2"]);
    });
});
