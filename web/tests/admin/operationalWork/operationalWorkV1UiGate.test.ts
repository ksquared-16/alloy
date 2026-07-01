import { describe, expect, it } from "vitest";

import { isOperationalWorkV1Enabled } from "@/lib/admin/operationalWork/operationalWorkV1UiGate";

describe("isOperationalWorkV1Enabled", () => {
    it("defaults to enabled when env unset", () => {
        const prev = process.env.NEXT_PUBLIC_OPERATIONAL_WORK_V1_ENABLED;
        delete process.env.NEXT_PUBLIC_OPERATIONAL_WORK_V1_ENABLED;
        expect(isOperationalWorkV1Enabled()).toBe(true);
        if (prev === undefined) delete process.env.NEXT_PUBLIC_OPERATIONAL_WORK_V1_ENABLED;
        else process.env.NEXT_PUBLIC_OPERATIONAL_WORK_V1_ENABLED = prev;
    });

    it("respects explicit false", () => {
        const prev = process.env.NEXT_PUBLIC_OPERATIONAL_WORK_V1_ENABLED;
        process.env.NEXT_PUBLIC_OPERATIONAL_WORK_V1_ENABLED = "false";
        expect(isOperationalWorkV1Enabled()).toBe(false);
        if (prev === undefined) delete process.env.NEXT_PUBLIC_OPERATIONAL_WORK_V1_ENABLED;
        else process.env.NEXT_PUBLIC_OPERATIONAL_WORK_V1_ENABLED = prev;
    });
});
