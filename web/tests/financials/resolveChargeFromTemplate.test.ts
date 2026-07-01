import { describe, expect, it } from "vitest";
import {
    addDays,
    firstOfNextMonth,
    resolveChargeFromTemplate,
} from "@/lib/financials/chargeLifecycle/resolveChargeFromTemplate";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";

const TODAY = "2026-06-29";

function template(p: Partial<ChargeTemplateRow> & { template_key: string }): ChargeTemplateRow {
    return {
        id: p.id ?? "tpl-1",
        org_id: "org-1",
        service_id: p.service_id ?? null,
        template_key: p.template_key,
        label: p.label ?? p.template_key,
        description: null,
        charge_category: p.charge_category ?? "fee",
        trigger_type: p.trigger_type ?? "manual",
        trigger_key: null,
        amount_strategy: p.amount_strategy ?? "fixed",
        amount_cents: p.amount_cents ?? 15000,
        currency_code: "USD",
        occurs_on_strategy: p.occurs_on_strategy ?? "now",
        billable_on_strategy: p.billable_on_strategy ?? "immediate",
        billable_offset_days: p.billable_offset_days ?? null,
        default_gl_mapping_key: p.default_gl_mapping_key ?? null,
        default_responsibility_key: p.default_responsibility_key ?? null,
        review_required: p.review_required ?? false,
        is_active: p.is_active ?? true,
        effective_start: p.effective_start ?? "2026-01-01",
        effective_end: p.effective_end ?? null,
        source_key: "config",
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "",
        updated_at: "",
    };
}

describe("date helpers", () => {
    it("addDays + firstOfNextMonth", () => {
        expect(addDays("2026-06-29", 21)).toBe("2026-07-20");
        expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
        expect(firstOfNextMonth("2026-06-29")).toBe("2026-07-01");
        expect(firstOfNextMonth("2026-12-15")).toBe("2027-01-01");
    });
});

describe("resolveChargeFromTemplate", () => {
    it("immediate fixed template → draft today, eligible, stable resolution key", () => {
        const i = resolveChargeFromTemplate(template({ template_key: "registration_fee", amount_cents: 15000 }), { today: TODAY, scopeKey: "agr-1" });
        expect(i).toMatchObject({ eligible: true, occursOn: TODAY, billableOn: TODAY, amountCents: 15000, lifecycleStatus: "draft", wouldCreateDraft: true });
        expect(i.resolutionKey).toBe("tpl:registration_fee:2026-06-29:agr-1");
    });

    it("event_date + offset_days → occurs on event, billable later, scheduled", () => {
        const t = template({ template_key: "field_trip", occurs_on_strategy: "event_date", billable_on_strategy: "offset_days", billable_offset_days: 21, amount_cents: 4500 });
        const i = resolveChargeFromTemplate(t, { today: TODAY, eventDate: "2026-07-01", scopeKey: "agr-1" });
        expect(i.occursOn).toBe("2026-07-01");
        expect(i.billableOn).toBe("2026-07-22"); // +21d
        expect(i.lifecycleStatus).toBe("scheduled"); // billable in the future
    });

    it("missing event date → not eligible", () => {
        const t = template({ template_key: "field_trip", occurs_on_strategy: "event_date" });
        expect(resolveChargeFromTemplate(t, { today: TODAY }).eligible).toBe(false);
        expect(resolveChargeFromTemplate(t, { today: TODAY }).reason).toBe("missing_event_date");
    });

    it("retired or not-yet-effective template → not eligible", () => {
        expect(resolveChargeFromTemplate(template({ template_key: "x", effective_end: "2026-01-01" }), { today: TODAY }).reason).toBe("template_retired");
        expect(resolveChargeFromTemplate(template({ template_key: "x", effective_start: "2030-01-01" }), { today: TODAY }).reason).toBe("template_not_yet_effective");
    });

    it("usage/rate strategies preview without a resolvable amount unless provided", () => {
        const usage = resolveChargeFromTemplate(template({ template_key: "diapers", amount_strategy: "usage_derived", amount_cents: null }), { today: TODAY });
        expect(usage.amountCents).toBeNull();
        const usageWithQty = resolveChargeFromTemplate(template({ template_key: "diapers", amount_strategy: "usage_derived", amount_cents: null }), { today: TODAY, quantity: 5, unitAmountCents: 200 });
        expect(usageWithQty.amountCents).toBe(1000);
        const rate = resolveChargeFromTemplate(template({ template_key: "r", amount_strategy: "rate_derived", amount_cents: null }), { today: TODAY, resolvedAmountCents: 120000 });
        expect(rate.amountCents).toBe(120000);
    });

    it("review required when the template OR a policy requires it", () => {
        expect(resolveChargeFromTemplate(template({ template_key: "x", review_required: true }), { today: TODAY }).reviewRequired).toBe(true);
        expect(resolveChargeFromTemplate(template({ template_key: "x" }), { today: TODAY, reviewRequiredByPolicy: true }).reviewRequired).toBe(true);
    });
});
