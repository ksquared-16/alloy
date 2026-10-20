/**
 * Assignment tuition against the REAL staging catalog (census gar_05cd2b220ea83d, 2026-10-20).
 *
 * The defect: Lennon Kurzman — Toddler 2, Monday–Friday — read "No rate matches this assignment"
 * while `toddler · 5 days/week · $1,700/monthly` sat in additional rates. Measured cause: the
 * resolver saw programKey=null and attendanceType=null (the lead's saved proposal was never read),
 * and even with facts present, schedule types (`full_day`, `weekly`) never equal the offerings'
 * attendance types (`full_time`, `part_time`), so nothing could ever match.
 */
import { describe, expect, it } from "vitest";

import catalog from "../fixtures/commercial/stagingToddlerPreschoolCatalog.json";
import type { CommercialExport } from "@/lib/commercial/execution/commercialExport";
import {
    resolveAssignmentPricingOptions,
    type AssignmentPricingFacts,
} from "@/lib/commercial/execution/evaluate/resolveOptions";
import { proposalFactsFromMetadata } from "@/lib/enrollment/pricing/assignmentPricingFacts";
import { applyDraftFacts } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";

type Raw = (typeof catalog)["offerings"][number];

function exportFrom(offerings: Raw[]): CommercialExport {
    return {
        orgId: "org",
        version: { version: "cfg", effectiveOn: "2026-10-20" },
        programs: [],
        offerings: offerings.map((o) => ({
            id: o.id,
            programKey: o.program_key,
            label: o.program_key,
            attendanceType: o.attendance_type,
            effective: { start: o.effective_start, end: o.effective_end },
            isActive: o.is_active !== false && o.status !== "archived",
        })),
        variants: offerings.flatMap((o) =>
            (o.variants ?? []).map((v) => ({
                id: v.id,
                offeringId: o.id,
                label: v.label ?? "",
                quantityType: v.quantity_type,
                quantityValue: v.quantity_value,
                isActive: v.is_active !== false && v.status !== "archived",
            })),
        ),
        tuitionRates: offerings.flatMap((o) =>
            (o.variants ?? []).flatMap((v) =>
                (v.rates ?? [])
                    .filter((r) => r.is_active)
                    .map((r) => ({
                        id: r.id,
                        variantId: v.id,
                        cadenceKey: r.cadence_key,
                        payerType: "private_pay" as const,
                        locationId: r.location_id,
                        rateCents: r.rate_cents,
                        notOffered: r.not_offered === true,
                        effective: { start: r.effective_start, end: r.effective_end },
                        revenueCategoryId: null,
                    })),
            ),
        ),
        products: [],
        cadences: [],
        revenueCategories: [],
        policies: [],
    } as unknown as CommercialExport;
}

const EXP = exportFrom(catalog.offerings as Raw[]);
const SITE = catalog.site_location_id;

function facts(over: Partial<AssignmentPricingFacts>): AssignmentPricingFacts {
    return {
        programKey: "toddler",
        attendanceType: "full_day", // the schedule type a real pattern carries
        daysPerWeek: 5,
        locationId: SITE,
        payerType: "private_pay",
        cadenceKey: null,
        asOf: "2026-10-20",
        ...over,
    };
}
const amounts = (r: ReturnType<typeof resolveAssignmentPricingOptions>) =>
    (r.kind === "no_match" ? [] : r.kind === "ambiguous" ? r.tied : [r.recommended]).map((o) => o.amount.amountCents).sort((a, b) => a - b);

describe("the Lennon case: toddler, Monday–Friday", () => {
    it("THE DEFECT: with the facts the resolver used to receive, nothing applies", () => {
        const r = resolveAssignmentPricingOptions(EXP, facts({ programKey: null, attendanceType: null }));
        expect(r).toMatchObject({ kind: "no_match", reason: "missing_required_input" });
    });

    it("five days finds the five-day toddler rates — full-time and part-time tie for the operator", () => {
        const r = resolveAssignmentPricingOptions(EXP, facts({}));
        expect(r.kind).toBe("ambiguous");
        expect(amounts(r)).toEqual([120_000, 170_000]);
    });

    it("three days finds the three-day toddler rates", () => {
        expect(amounts(resolveAssignmentPricingOptions(EXP, facts({ daysPerWeek: 3 })))).toEqual([95_000, 120_000]);
    });

    it("the effective date re-evaluates: before part-time takes effect, five-day full-time is the one rate", () => {
        const r = resolveAssignmentPricingOptions(EXP, facts({ asOf: "2026-10-19" }));
        expect(r.kind).toBe("recommended");
        expect(amounts(r)).toEqual([170_000]);
    });

    it("a schedule type that IS an attendance type still narrows exactly as before", () => {
        const r = resolveAssignmentPricingOptions(EXP, facts({ attendanceType: "full_time" }));
        expect(r.kind).toBe("recommended");
        expect(amounts(r)).toEqual([170_000]);
    });

    it("changing the room's program re-prices — preschool five days", () => {
        const r = resolveAssignmentPricingOptions(EXP, facts({ programKey: "preschool" }));
        // Within the one preschool offering, the later-dated 5-day rate supersedes the undated default.
        expect(r.kind).toBe("recommended");
        expect(amounts(r)).toEqual([155_000]);
    });

    it("no program at all is still an honest missing-input answer", () => {
        expect(resolveAssignmentPricingOptions(EXP, facts({ programKey: null }))).toMatchObject({
            kind: "no_match",
            reason: "missing_required_input",
        });
    });
});

describe("the proposal tier and the editor's draft facts", () => {
    it("reads a lead's saved proposal: program, schedule type, distinct weekdays, start, site", () => {
        expect(
            proposalFactsFromMetadata({
                program_category_id: "08e30247",
                schedule_type: "full_day",
                weekdays: [1, 2, 3, 4, 5],
                start_date: "2026-11-02",
                location_id: SITE,
            }),
        ).toEqual({ programCategoryId: "08e30247", scheduleType: "full_day", daysPerWeek: 5, startDate: "2026-11-02", locationId: SITE });
        expect(proposalFactsFromMetadata({ requested_days_per_week: 3 }).daysPerWeek).toBe(3);
        expect(proposalFactsFromMetadata({ weekdays: [] , requested_days_per_week: "" }).daysPerWeek).toBeNull();
    });

    it("the editor's unsaved choices replace only what they name", () => {
        const saved = facts({ programKey: "toddler", daysPerWeek: null, attendanceType: null, locationId: null });
        expect(applyDraftFacts(saved, { daysPerWeek: 3, attendanceType: "weekly", asOf: "2026-11-02", locationId: SITE })).toEqual({
            ...saved,
            daysPerWeek: 3,
            attendanceType: "weekly",
            asOf: "2026-11-02",
            locationId: SITE,
        });
        expect(applyDraftFacts(saved, { daysPerWeek: 0, asOf: "not-a-date" })).toEqual(saved);
    });
});
