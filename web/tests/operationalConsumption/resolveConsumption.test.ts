import { describe, expect, it } from "vitest";
import {
    deriveConsumptionIdempotencyKey,
    resolveConsumption,
} from "@/lib/operationalConsumption/resolveConsumption";
import type { ChargeIntent } from "@/lib/financials/chargeLifecycle/resolveChargeFromTemplate";
import type { ConsumptionEventTypeRow, OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";

const TODAY = "2026-06-29";
const AGREEMENT = "agr-1";

function fact(over: Partial<OperationalFactDto> = {}): OperationalFactDto {
    return {
        eventKey: "enrollment.registration",
        sourceFamily: "agreement",
        sourceEntityType: "child_enrollment_agreements",
        sourceEntityId: AGREEMENT,
        subjectType: "customer_member",
        subjectId: "member-1",
        ...over,
    };
}

function eventType(over: Partial<ConsumptionEventTypeRow> = {}): ConsumptionEventTypeRow {
    return {
        id: "cet-1",
        org_id: null,
        event_key: "enrollment.registration",
        label: "Enrollment Registration",
        source_family: "agreement",
        description: null,
        charge_template_key: "registration_fee",
        default_responsibility_key: "household",
        is_active: true,
        effective_start: "2000-01-01",
        effective_end: null,
        metadata: {},
        ...over,
    };
}

function chargeIntent(over: Partial<ChargeIntent> = {}): ChargeIntent {
    return {
        eligible: true,
        reason: null,
        templateId: "tpl-1",
        templateKey: "registration_fee",
        serviceId: "svc-1",
        chargeCategory: "fee",
        amountStrategy: "fixed",
        amountCents: 15000,
        currencyCode: "USD",
        occursOn: TODAY,
        billableOn: TODAY,
        glMappingKey: "fee_revenue",
        responsibilityKey: null,
        reviewRequired: false,
        lifecycleStatus: "draft",
        wouldCreateDraft: true,
        resolutionKey: `tpl:registration_fee:${TODAY}:${AGREEMENT}`,
        ...over,
    };
}

describe("resolveConsumption — operational fact → consumption event", () => {
    it("builds a consumption event from the fact, defaulting occurs_on to today", () => {
        const r = resolveConsumption(fact(), eventType(), chargeIntent(), TODAY);
        expect(r.event).toMatchObject({
            eventTypeId: "cet-1",
            sourceFamily: "agreement",
            eventKey: "enrollment.registration",
            sourceEntityType: "child_enrollment_agreements",
            sourceEntityId: AGREEMENT,
            occursOn: TODAY,
            status: "resolved",
        });
        expect(r.event.idempotencyKey).toBe(`cev:enrollment.registration:child_enrollment_agreements:${AGREEMENT}:${TODAY}`);
    });

    it("respects an explicit occurs_on and a provided idempotency key", () => {
        const r = resolveConsumption(fact({ occursOn: "2026-07-01", idempotencyKey: "fixed-key" }), eventType(), chargeIntent({ occursOn: "2026-07-01", billableOn: "2026-07-01" }), TODAY);
        expect(r.event.occursOn).toBe("2026-07-01");
        expect(r.event.idempotencyKey).toBe("fixed-key");
    });
});

describe("resolveConsumption — consumption event → resolved obligation", () => {
    it("maps a chargeable intent to exactly one resolved obligation", () => {
        const r = resolveConsumption(fact(), eventType(), chargeIntent(), TODAY);
        expect(r.obligations).toHaveLength(1);
        expect(r.obligations[0]).toMatchObject({
            chargeTemplateId: "tpl-1",
            serviceId: "svc-1",
            amountCents: 15000,
            currencyCode: "USD",
            occursOn: TODAY,
            billableOn: TODAY,
            reviewRequired: false,
            status: "previewed",
            resolutionKey: `tpl:registration_fee:${TODAY}:${AGREEMENT}`,
        });
    });

    it("falls back to the event type's default responsibility when the charge carries none", () => {
        const r = resolveConsumption(fact(), eventType(), chargeIntent({ responsibilityKey: null }), TODAY);
        expect(r.obligations[0].responsibilityKey).toBe("household");
    });

    it("produces NO obligation when there is no matching charge template (null intent)", () => {
        const r = resolveConsumption(fact(), eventType({ charge_template_key: null }), null, TODAY);
        expect(r.obligations).toHaveLength(0);
        expect(r.event.status).toBe("no_obligation");
    });

    it("produces NO obligation when the charge intent is ineligible", () => {
        const r = resolveConsumption(fact(), eventType(), chargeIntent({ eligible: false, reason: "template_retired", wouldCreateDraft: false }), TODAY);
        expect(r.obligations).toHaveLength(0);
        expect(r.event.status).toBe("no_obligation");
        expect(r.explanation.charge_ineligible_reason).toBe("template_retired");
    });
});

describe("deriveConsumptionIdempotencyKey", () => {
    it("is stable for the same fact + occurs_on", () => {
        const f = fact();
        expect(deriveConsumptionIdempotencyKey(f, TODAY)).toBe(deriveConsumptionIdempotencyKey(f, TODAY));
    });
});
