import { describe, expect, it, vi } from "vitest";
import {
    DEFAULT_TOUR_COMMS_CONFIG,
    mergeTourCommsConfig,
    parseTourCommsConfigFragment,
} from "@/lib/tours/comms/tourCommsConfig";
import { resolveTourCommsConfig } from "@/lib/tours/comms/resolveTourCommsConfig";

describe("parseTourCommsConfigFragment", () => {
    it("returns empty object for non-object input", () => {
        expect(parseTourCommsConfigFragment(null)).toEqual({});
        expect(parseTourCommsConfigFragment("x")).toEqual({});
    });

    it("sanitizes reminder offsets and drops invalid rows", () => {
        const f = parseTourCommsConfigFragment({
            enabled: true,
            reminder_offsets: [
                { reminder_key: "ok", offset_minutes: 60, channels: ["email"] },
                { reminder_key: "", offset_minutes: 10, channels: ["email"] },
                { reminder_key: "bad", offset_minutes: -1, channels: ["email"] },
            ],
        });
        expect(f.enabled).toBe(true);
        expect(f.reminder_offsets).toHaveLength(1);
        expect(f.reminder_offsets![0]!.reminder_key).toBe("ok");
    });

    it("normalizes quiet hours HH:mm", () => {
        const f = parseTourCommsConfigFragment({
            quiet_hours: { start: "25:99", end: "08:00", enabled: true },
        });
        expect(f.quiet_hours?.start).toBe(DEFAULT_TOUR_COMMS_CONFIG.quiet_hours.start);
        expect(f.quiet_hours?.end).toBe("08:00");
    });
});

describe("mergeTourCommsConfig", () => {
    it("location overrides org enabled flag", () => {
        const cfg = mergeTourCommsConfig({ enabled: false }, { enabled: true });
        expect(cfg.enabled).toBe(true);
    });

    it("location merges quiet_hours over org", () => {
        const org = parseTourCommsConfigFragment({ quiet_hours: { start: "20:00" } });
        const loc = parseTourCommsConfigFragment({ quiet_hours: { end: "09:00" } });
        const cfg = mergeTourCommsConfig(org, loc);
        expect(cfg.quiet_hours.start).toBe("20:00");
        expect(cfg.quiet_hours.end).toBe("09:00");
    });
});

describe("resolveTourCommsConfig", () => {
    it("returns defaults when metadata missing", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "org_settings") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null }),
                            })),
                        })),
                    };
                }
                throw new Error(`unexpected ${table}`);
            }),
        } as never;

        const { config, sources } = await resolveTourCommsConfig(supabase, { orgId: "org-1" });
        expect(config.enabled).toBe(true);
        expect(config.reminder_offsets).toHaveLength(1);
        expect(config.reminder_offsets[0].offset_minutes).toBe(24 * 60);
        expect(sources.org).toBe(false);
        expect(sources.location).toBe(false);
    });

    it("merges org_settings.metadata.tour_comms", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "org_settings") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: {
                                        metadata: {
                                            tour_comms: { enabled: true, channels: { email: true, sms: true } },
                                        },
                                    },
                                    error: null,
                                }),
                            })),
                        })),
                    };
                }
                throw new Error(`unexpected ${table}`);
            }),
        } as never;

        const { config, sources } = await resolveTourCommsConfig(supabase, { orgId: "org-1" });
        expect(config.enabled).toBe(true);
        expect(config.channels.sms).toBe(true);
        expect(sources.org).toBe(true);
    });

    it("throws when orgId missing", async () => {
        await expect(resolveTourCommsConfig({} as never, { orgId: "" })).rejects.toThrow(/orgId is required/);
    });
});
