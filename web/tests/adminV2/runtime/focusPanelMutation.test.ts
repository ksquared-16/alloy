// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import {
    buildOpportunityFocusPanelMutation,
    mergePersonContactIntoFocusPanelTruth,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

const BASE_TRUTH: Record<string, unknown> = {
    id: "opp-1",
    _identity: { primary_person: { id: "p-1", label: "Jordan Johnson" } },
    "person.primary_contact_name": "Jordan Johnson",
    "person.primary_email": "jordan@example.com",
    "person.primary_phone": "(555) 012-3456",
};

type FakeRes = { ok: boolean; status: number; json: () => Promise<unknown> };
function fakeFetch(res: FakeRes): typeof fetch {
    return (async () => res) as unknown as typeof fetch;
}

const SAVED_PERSON = {
    id: "p-1",
    first_name: "Jordan",
    last_name: "Smith",
    full_name: "Jordan Smith",
    email: "new@example.com",
    phone: "(555) 999-0000",
};

function captureRecordPatch(): { events: CustomEvent[]; stop: () => void } {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH, handler);
    return { events, stop: () => window.removeEventListener(ADMINV2_OPPORTUNITY_DRAWER_RECORD_PATCH, handler) };
}

describe("mergePersonContactIntoFocusPanelTruth", () => {
    it("updates the keys the Household card reads, immutably", () => {
        const merged = mergePersonContactIntoFocusPanelTruth(BASE_TRUTH, SAVED_PERSON);
        expect(merged["person.primary_contact_name"]).toBe("Jordan Smith");
        expect(merged["person.primary_email"]).toBe("new@example.com");
        expect(merged["person.primary_phone"]).toBe("(555) 999-0000");
        expect((merged._identity as { primary_person: { label: string } }).primary_person.label).toBe("Jordan Smith");
        // original untouched (pure)
        expect(BASE_TRUTH["person.primary_email"]).toBe("jordan@example.com");
    });
});

describe("buildOpportunityFocusPanelmutation.savePersonContact", () => {
    afterEach(() => {
        /* listeners removed per-test via stop() */
    });

    it("mirrors canMutate onto canEdit", () => {
        expect(buildOpportunityFocusPanelMutation({ canMutate: false, opportunityId: "opp-1", truth: BASE_TRUTH }).canEdit).toBe(false);
        expect(buildOpportunityFocusPanelMutation({ canMutate: true, opportunityId: "opp-1", truth: BASE_TRUTH }).canEdit).toBe(true);
    });

    it("on success returns ok and dispatches the record-patch with merged truth", async () => {
        const cap = captureRecordPatch();
        const mutation = buildOpportunityFocusPanelMutation({
            canMutate: true,
            opportunityId: "opp-1",
            truth: BASE_TRUTH,
            fetchFn: fakeFetch({ ok: true, status: 200, json: async () => SAVED_PERSON }),
        });
        const res = await mutation.savePersonContact("p-1", { last_name: "Smith", email: "new@example.com", phone: "(555) 999-0000" });
        expect(res).toEqual({ ok: true });
        expect(cap.events).toHaveLength(1);
        const detail = cap.events[0]!.detail as { opportunity_id: string; record: Record<string, unknown> };
        expect(detail.opportunity_id).toBe("opp-1");
        expect(detail.record["person.primary_email"]).toBe("new@example.com");
        expect(detail.record["person.primary_contact_name"]).toBe("Jordan Smith");
        cap.stop();
    });

    it("on failure returns the error and dispatches nothing", async () => {
        const cap = captureRecordPatch();
        const mutation = buildOpportunityFocusPanelMutation({
            canMutate: true,
            opportunityId: "opp-1",
            truth: BASE_TRUTH,
            fetchFn: fakeFetch({ ok: false, status: 403, json: async () => ({ error: "Forbidden" }) }),
        });
        const res = await mutation.savePersonContact("p-1", { email: "x@y.com" });
        expect(res).toEqual({ ok: false, status: 403, error: "Forbidden" });
        expect(cap.events).toHaveLength(0);
        cap.stop();
    });

    it("rejects an empty person id without calling the route", async () => {
        const cap = captureRecordPatch();
        let called = false;
        const mutation = buildOpportunityFocusPanelMutation({
            canMutate: true,
            opportunityId: "opp-1",
            truth: BASE_TRUTH,
            fetchFn: (() => {
                called = true;
                return Promise.reject(new Error("should not be called"));
            }) as unknown as typeof fetch,
        });
        const res = await mutation.savePersonContact("  ", { email: "x@y.com" });
        expect(res.ok).toBe(false);
        expect(called).toBe(false);
        expect(cap.events).toHaveLength(0);
        cap.stop();
    });
});
