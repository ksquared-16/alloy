import { describe, expect, it } from "vitest";

import {
    isConfigLayoutAssistLikeCommand,
    parseConfigLayoutAssistIntent,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistIntent";

describe("configLayoutAssistIntent", () => {
    it("detects create field commands", () => {
        expect(isConfigLayoutAssistLikeCommand("Create Preferred Start Date field")).toBe(true);
        const intent = parseConfigLayoutAssistIntent("Create Preferred Start Date field");
        expect(intent.kind).toBe("create_field");
        expect(intent.field_key).toBe("preferred_start_date");
    });

    it("detects expose field commands", () => {
        const intent = parseConfigLayoutAssistIntent("Expose subsidy tier in summary");
        expect(intent.kind).toBe("expose_field");
        expect(intent.field_key).toBe("subsidy_tier");
    });

    it("detects explain read-only commands", () => {
        const intent = parseConfigLayoutAssistIntent("Why is tour date read-only?");
        expect(intent.kind).toBe("explain_field");
        expect(intent.field_key).toBe("tour_date");
    });

    it("detects data quality scan", () => {
        const intent = parseConfigLayoutAssistIntent("Show layouts with inconsistencies");
        expect(intent.kind).toBe("data_quality_scan");
    });
});
