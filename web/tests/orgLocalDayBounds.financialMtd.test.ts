import { describe, expect, it } from "vitest";
import { resolveOrgOperationalMonthToDateForFinancialMtd } from "@/lib/admin/orgLocalDayBounds";

describe("resolveOrgOperationalMonthToDateForFinancialMtd", () => {
    it("uses org-local calendar day for MTD end (America/New_York)", () => {
        const refUtc = new Date("2026-05-02T03:00:00.000Z"); // May 1, 11:00 PM Eastern (EDT)
        const r = resolveOrgOperationalMonthToDateForFinancialMtd("America/New_York", refUtc);
        expect(r.mtd_end_local_date).toBe("2026-05-01");
        expect(r.mtd_start_local_date).toBe("2026-05-01");
    });

    it("rolls MTD to new month boundary in org TZ", () => {
        const refUtc = new Date("2026-05-02T07:00:00.000Z"); // May 2, 3:00 AM Eastern
        const r = resolveOrgOperationalMonthToDateForFinancialMtd("America/New_York", refUtc);
        expect(r.mtd_end_local_date).toBe("2026-05-02");
        expect(r.mtd_start_local_date).toBe("2026-05-01");
    });

    it("returns UTC instants for month start and exclusive month end", () => {
        const refUtc = new Date("2026-05-15T12:00:00.000Z");
        const r = resolveOrgOperationalMonthToDateForFinancialMtd("UTC", refUtc);
        expect(r.mtd_start_local_date).toBe("2026-05-01");
        expect(r.mtd_end_local_date).toBe("2026-05-15");
        expect(r.mtd_start_utc).toBe("2026-05-01T00:00:00.000Z");
        expect(r.mtd_end_exclusive_utc).toBe("2026-05-16T00:00:00.000Z");
    });
});
