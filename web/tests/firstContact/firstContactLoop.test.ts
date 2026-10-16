import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { isProcessingCaseUnworked, loadUnworkedFlags } from "@/lib/pos/processingCaseAttention";
import { buildRecordRenderContext } from "@/lib/communications/render/buildRecordRenderContext";
import { renderOutboundMessage } from "@/lib/communications/render/renderOutboundMessage";
import { orchestrateFamilySend } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";
import { earliestTourLocalDate, isTourStartAllowed } from "@/lib/tours/bookings/tourEarliestDate";
import { selectLastAction } from "@/lib/adminV2/runtime/focusPanel/businessProcess/adaptBusinessProcessEvidenceToProcessCard";
import { collapseTourActivityDuplicates } from "@/lib/admin/opportunityTourActivityEvents";
import { filterCommunicationTokens, getCommunicationTokenDef } from "@/lib/communications/v2/templateTokens";

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
    return {
        from(table: string) {
            const rows = tables[table] ?? [];
            const filters: Array<(r: Row) => boolean> = [];
            const b = {
                select: () => b,
                eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
                in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
                order: () => b,
                range: () => b,
                limit: () => b,
                maybeSingle: async () => ({ data: rows.filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
                then: (res: (x: { data: Row[]; error: null }) => unknown) => res({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
            };
            return b;
        },
    } as unknown as SupabaseClient;
}

describe("Processing NEW / UNWORKED", () => {
    it("is actionable and carries no operator decision — not age, not 'opened'", () => {
        expect(isProcessingCaseUnworked({ status: "needs_resolution", operatorWorked: false })).toBe(true);
        expect(isProcessingCaseUnworked({ status: "received", operatorWorked: false })).toBe(true);
        expect(isProcessingCaseUnworked({ status: "needs_resolution", operatorWorked: true })).toBe(false);
        expect(isProcessingCaseUnworked({ status: "completed", operatorWorked: false })).toBe(false);
        expect(isProcessingCaseUnworked({ status: "ready", operatorWorked: false })).toBe(false);
        expect(isProcessingCaseUnworked({ status: "received", operatorWorked: false, formDraftStarted: true })).toBe(false);
    });

    it("engine decisions at intake do not count as worked; an operator decision does", async () => {
        const db = fakeDb({
            processing_resolutions: [
                { org_id: "o", case_id: "c-engine", decided_by: "engine" },
                { org_id: "o", case_id: "c-worked", decided_by: "operator" },
            ],
        });
        const flags = await loadUnworkedFlags(db, "o", [
            { id: "c-engine", status: "needs_resolution" },
            { id: "c-worked", status: "needs_resolution" },
            { id: "c-done", status: "completed" },
            { id: "c-drafted", status: "received", formDraftSummary: { generatedFormId: "f1" } },
        ]);
        expect(flags).toEqual({ "c-engine": true });
    });
});

describe("a Template Library message resolves from the recipient's records", () => {
    const db = fakeDb({
        persons: [{ org_id: "o", id: "p1", first_name: "Ravi", last_name: "Smith", email: "r@x.test", phone: "+15550001" }],
        customers: [{ org_id: "o", id: "h1", name: "Smith Family" }],
        opportunities: [{ org_id: "o", id: "l1", name: "Smith Family", location_id: "loc1" }],
        locations: [{ org_id: "o", id: "loc1", label: "North Campus", address1: "123 Main Street", city: "Bend", state: "OR", postal_code: "97701" }],
        orgs: [{ id: "o", name: "Firefly Early Learning" }],
        opportunity_customer_members: [{ org_id: "o", opportunity_id: "l1", customer_member_id: "k1" }],
        customer_members: [{ org_id: "o", id: "k1", first_name: "Kai", last_name: "Ravi", display_name: "Kai Ravi" }],
    });

    it("fills parent, child, location and organization tokens — the message that used to be refused sends", async () => {
        const values = await buildRecordRenderContext(db, "o", { personId: "p1", customerId: "h1", opportunityId: "l1" });
        const body = "Hi {{contact.first_name}}, thanks for asking about {{person.first_name}} at {{location_name}} — {{org_name}}";
        const r = renderOutboundMessage({ body, context: { values, channel: "sms" } });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.output.text).toBe("Hi Ravi, thanks for asking about Kai at North Campus — Firefly Early Learning");
        // Before: no context at all → refused, nothing sent.
        expect(renderOutboundMessage({ body, context: { values: {}, channel: "sms" } }).ok).toBe(false);
    });

    it("never puts an internal id in a parent's message", async () => {
        const values = await buildRecordRenderContext(db, "o", { personId: "p1", customerId: "h1", opportunityId: "l1" });
        const r = renderOutboundMessage({ body: "Ref {{opportunity.id}}", context: { values, channel: "sms" } });
        expect(r.ok).toBe(false);
    });

    it("a child token is refused, not guessed, when the lead has more than one child", async () => {
        const two = fakeDb({
            persons: [{ org_id: "o", id: "p1", first_name: "Ravi" }],
            orgs: [{ id: "o", name: "Firefly" }],
            opportunities: [{ org_id: "o", id: "l1", name: "Smith Family", location_id: null }],
            opportunity_customer_members: [
                { org_id: "o", opportunity_id: "l1", customer_member_id: "k1" },
                { org_id: "o", opportunity_id: "l1", customer_member_id: "k2" },
            ],
        });
        const values = await buildRecordRenderContext(two, "o", { personId: "p1", opportunityId: "l1" });
        expect(renderOutboundMessage({ body: "About {{person.first_name}}", context: { values, channel: "sms" } }).ok).toBe(false);
    });
});

describe("family send — a refused render blocks at preflight and is never reported as sent", () => {
    const deps = (block: string | null) => ({
        getRecipient: () => ({ displayName: "Ravi Smith", channels: { sms: { available: true }, email: { available: true } } }) as never,
        checkConsent: async () => null,
        checkRender: async () => block,
        runSend: async () => ({ ok: true }),
    });

    it("preflight names the missing information instead of saying 'ready'", async () => {
        const r = await orchestrateFamilySend(deps("This message needs information that is missing: Parent first name"), {
            recipientPersonIds: ["p1"], channel: "sms", subject: null, body: "Hi {{contact.first_name}}", confirm: false,
        });
        expect(r.summary).toMatchObject({ ready: 0, blocked: 1 });
        expect(r.results[0]?.reason).toMatch(/Parent first name/);
    });

    it("a confirm that queued nothing reports sent = 0", async () => {
        const r = await orchestrateFamilySend(deps("missing"), {
            recipientPersonIds: ["p1"], channel: "sms", subject: null, body: "Hi {{contact.first_name}}", confirm: true,
        });
        expect(r.mode).toBe("sent");
        expect(r.summary.sent).toBe(0);
    });

    it("the confirmation dialog shows success only when something was sent", () => {
        const src = readFileSync(resolve(__dirname, "../../components/admin/communications/FamilySendConfirmationDialog.tsx"), "utf8");
        expect(src).toContain('const isSuccess = mode === "sent" && sentCount > 0;');
        expect(src).toContain('data-cc-send-not-sent="true"');
    });
});

describe("tour date guardrail — tomorrow or later, in the SITE's calendar", () => {
    const tz = "America/Los_Angeles";
    // 22:30 on Oct 15 in Bend is already Oct 16 in UTC.
    const lateEvening = new Date("2026-10-16T05:30:00Z");

    it("today is refused, tomorrow and later allowed", () => {
        expect(earliestTourLocalDate(tz, lateEvening)).toBe("2026-10-16");
        expect(isTourStartAllowed(new Date("2026-10-15T23:00:00Z"), tz, lateEvening)).toBe(false); // Oct 15, 4 PM local
        expect(isTourStartAllowed(new Date("2026-10-16T17:00:00Z"), tz, lateEvening)).toBe(true); // Oct 16, 10 AM local
        expect(isTourStartAllowed(new Date("2026-10-20T17:00:00Z"), tz, lateEvening)).toBe(true);
    });

    it("a UTC 'today' would have refused a valid tomorrow-morning tour; the site calendar does not", () => {
        // In UTC it is already Oct 16 — a naive UTC check would call an Oct 16 tour 'today'.
        expect(isTourStartAllowed(new Date("2026-10-16T16:00:00Z"), tz, lateEvening)).toBe(true);
    });

    it("is enforced at the booking service for create and reschedule, not only in pickers", () => {
        const src = readFileSync(resolve(__dirname, "../../lib/tours/bookings/tourBookingService.ts"), "utf8");
        expect(src.match(/isTourStartAllowed\(/g) ?? []).toHaveLength(2);
    });
});

describe("Last action — the newest meaningful row of the same timeline", () => {
    it("skips bookkeeping and preparatory rows", () => {
        expect(
            selectLastAction([
                { label: "Lead updated", when: "now", kind: "updated" },
                { label: "Tour invitation prepared", when: "now", kind: "communication" },
                { label: "SMS sent", detail: "SMS to Ravi Smith", when: "Oct 16, 10:42 AM", kind: "communication" },
                { label: "Lead created", when: "Oct 15", kind: "created" },
            ]),
        ).toEqual({ label: "SMS sent", detail: "SMS to Ravi Smith", when: "Oct 16, 10:42 AM" });
        expect(selectLastAction([{ label: "Lead created", when: "Oct 15", kind: "created" }])).toBeNull();
    });
});

describe("activity collapse is per send", () => {
    it("a tour invitation hides only its own delivery, and queued collapses into the same message's sent", () => {
        const rows = collapseTourActivityDuplicates([
            { id: "a", event_type: "message_sent", occurred_at: "2026-10-16T18:00:00Z", payload: { communication_message_id: "m2" } },
            { id: "b", event_type: "message_queued", occurred_at: "2026-10-16T17:59:59Z", payload: { communication_message_id: "m2" } },
            { id: "c", event_type: "tour_invitation_activated", occurred_at: "2026-10-15T12:00:30Z", payload: {} },
            { id: "d", event_type: "message_sent", occurred_at: "2026-10-15T12:00:10Z", payload: { communication_message_id: "m1" } },
        ] as never[]);
        expect((rows as Array<{ id: string }>).map((r) => r.id)).toEqual(["a", "c"]);
    });
});

describe("insert-token picker", () => {
    it("no longer offers internal ids or field-services paths, but they still resolve as known", () => {
        const offered = filterCommunicationTokens("").flatMap((g) => g.tokens.map((t) => t.path));
        for (const hidden of ["customer.id", "opportunity.id", "job.title", "schedule.start_at", "org.name"]) {
            expect(offered).not.toContain(hidden);
            expect(getCommunicationTokenDef(hidden)).not.toBeNull();
        }
        expect(offered).toEqual(expect.arrayContaining(["contact.first_name", "location_name", "org_name", "parent_name"]));
    });
});
