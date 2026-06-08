import { describe, expect, it } from "vitest";
import {
    UTC_FALLBACK_IANA,
    fetchOperationalTimezoneForOrg,
    resolveOrgTimezoneFromMetadata,
    isValidIanaTimeZone,
} from "@/lib/admin/timezoneContract";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("timezoneContract", () => {
    it("resolveOrgTimezoneFromMetadata: primary timezone key wins", () => {
        const r = resolveOrgTimezoneFromMetadata({ timezone: "America/Chicago", time_zone: "Europe/London" });
        expect(r.iana).toBe("America/Chicago");
        expect(r.source).toBe("org_metadata");
    });

    it("resolveOrgTimezoneFromMetadata: falls back to time_zone", () => {
        const r = resolveOrgTimezoneFromMetadata({ time_zone: "Europe/Berlin" });
        expect(r.iana).toBe("Europe/Berlin");
        expect(r.source).toBe("org_metadata_time_zone");
    });

    it("resolveOrgTimezoneFromMetadata: invalid IANA → UTC + utc_fallback", () => {
        const r = resolveOrgTimezoneFromMetadata({ timezone: "Not/AZone" });
        expect(r.iana).toBe(UTC_FALLBACK_IANA);
        expect(r.source).toBe("utc_fallback");
    });

    it("resolveOrgTimezoneFromMetadata: empty → UTC", () => {
        const r = resolveOrgTimezoneFromMetadata({});
        expect(r.iana).toBe(UTC_FALLBACK_IANA);
        expect(r.source).toBe("utc_fallback");
    });

    it("isValidIanaTimeZone rejects blank", () => {
        expect(isValidIanaTimeZone("")).toBe(false);
        expect(isValidIanaTimeZone("   ")).toBe(false);
    });

    it("fetchOperationalTimezoneForOrg uses org_settings row", async () => {
        const calls: { table: string; select: string }[] = [];
        const supabase = {
            from(table: string) {
                return {
                    select(sel: string) {
                        calls.push({ table, select: sel });
                        return {
                            eq(_col: string, _val: string) {
                                return {
                                    maybeSingle: async () => ({
                                        data: { metadata: { timezone: "Pacific/Honolulu" } },
                                        error: null,
                                    }),
                                };
                            },
                        };
                    },
                };
            },
        } as unknown as SupabaseClient;
        const r = await fetchOperationalTimezoneForOrg(supabase, "00000000-0000-0000-0000-000000000001");
        expect(r.iana).toBe("Pacific/Honolulu");
        expect(r.source).toBe("org_metadata");
        expect(calls[0]?.table).toBe("org_settings");
    });
});
