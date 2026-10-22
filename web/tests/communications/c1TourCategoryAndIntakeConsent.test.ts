/**
 * C1-C tour classification + intake marketing consent handoff.
 */
import { describe, expect, it } from "vitest";

import {
    TOUR_COMMS_PURPOSE,
    messageCategoryForTourEvent,
} from "@/lib/tours/comms/tourCommsMessageCategory";
import { TOUR_COMMS_EVENT_KEYS } from "@/lib/tours/comms/tourCommsConfig";
import { commitMarketingConsentFromIntakeCapture } from "@/lib/communications/preferences/intakeMarketingConsent";

describe("messageCategoryForTourEvent", () => {
    it("classifies invitation as operational and lifecycle as transactional", () => {
        expect(messageCategoryForTourEvent("tour_invitation")).toBe("operational");
        expect(messageCategoryForTourEvent("tour_confirmation")).toBe("transactional");
        expect(messageCategoryForTourEvent("tour_reminder")).toBe("transactional");
        expect(messageCategoryForTourEvent("tour_cancel")).toBe("transactional");
        expect(TOUR_COMMS_PURPOSE).toBe("tour_coordination");
        for (const key of TOUR_COMMS_EVENT_KEYS) {
            expect(["transactional", "operational"]).toContain(messageCategoryForTourEvent(key));
        }
    });
});

function fakeSupabase(prefs: Array<{ category: string; state: string }>) {
    const store = [...prefs];
    const events: unknown[] = [];
    return {
        events,
        from(table: string) {
            if (table === "communication_preferences") {
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    eq() {
                                        return {
                                            eq(_k: string, category: string) {
                                                return {
                                                    async maybeSingle() {
                                                        const row = store.find((r) => r.category === category);
                                                        return { data: row ?? null, error: null };
                                                    },
                                                };
                                            },
                                        };
                                    },
                                };
                            },
                        };
                    },
                    upsert(row: { category: string; state: string }) {
                        const idx = store.findIndex((r) => r.category === row.category);
                        if (idx >= 0) store[idx] = { category: row.category, state: row.state };
                        else store.push({ category: row.category, state: row.state });
                        return Promise.resolve({ error: null });
                    },
                };
            }
            if (table === "communication_preference_events") {
                return {
                    insert(event: unknown) {
                        events.push(event);
                        return Promise.resolve({ error: null });
                    },
                };
            }
            throw new Error(`unexpected table ${table}`);
        },
    };
}

describe("commitMarketingConsentFromIntakeCapture", () => {
    it("writes email marketing opt-in with provenance", async () => {
        const sb = fakeSupabase([]);
        const result = await commitMarketingConsentFromIntakeCapture(sb as never, {
            orgId: "o",
            personId: "p",
            capture: {
                channel: "email",
                optedIn: true,
                capturedAt: "2026-10-22T00:00:00.000Z",
                source: "public_intake",
                method: "form_checkbox",
            },
        });
        expect(result).toEqual({
            ok: true,
            channel: "email",
            category: "email_marketing",
            outcome: "opted_in",
        });
        expect(sb.events).toHaveLength(1);
    });

    it("preserves prior email marketing opt-out on repeat inquiry", async () => {
        const sb = fakeSupabase([{ category: "email_marketing", state: "opted_out" }]);
        const result = await commitMarketingConsentFromIntakeCapture(sb as never, {
            orgId: "o",
            personId: "p",
            capture: {
                channel: "email",
                optedIn: true,
                capturedAt: "2026-10-22T00:00:00.000Z",
                source: "public_intake",
            },
        });
        expect(result).toMatchObject({ ok: true, outcome: "preserved_opt_out" });
    });

    it("does not invent consent when checkbox unchecked", async () => {
        const sb = fakeSupabase([]);
        const result = await commitMarketingConsentFromIntakeCapture(sb as never, {
            orgId: "o",
            personId: "p",
            capture: {
                channel: "sms",
                optedIn: false,
                capturedAt: "2026-10-22T00:00:00.000Z",
                source: "public_intake",
            },
        });
        expect(result).toMatchObject({ ok: true, outcome: "skipped_unset", category: "sms_marketing" });
        expect(sb.events).toHaveLength(0);
    });

    it("keeps email and SMS consent independent", async () => {
        const sb = fakeSupabase([{ category: "email_marketing", state: "opted_in" }]);
        const sms = await commitMarketingConsentFromIntakeCapture(sb as never, {
            orgId: "o",
            personId: "p",
            capture: {
                channel: "sms",
                optedIn: true,
                capturedAt: "2026-10-22T00:00:00.000Z",
                source: "public_intake",
            },
        });
        expect(sms).toMatchObject({ ok: true, category: "sms_marketing", outcome: "opted_in" });
    });
});
