import { describe, expect, it } from "vitest";
import { buildAssistantPayload } from "@/lib/admin/agentLab/buildAssistantStructuredOverride";
import { parseAssistantCommand } from "@/lib/admin/agentLab/parseAssistantCommand";
import { runOverviewLayoutSemanticPreview } from "@/lib/admin/agentLab/overviewLayoutSemanticAssistant";
import { getDefaultOverviewLayoutConfig } from "@/lib/rrs/overview/overviewLayoutV0";

function storedOverview(version: number) {
    const layout = getDefaultOverviewLayoutConfig();
    return {
        version,
        header_keys: layout.header_keys,
        bands: layout.bands.map((b) => ({
            band_key: b.band_key,
            enabled: b.enabled,
            items: b.items.map((it) => ({ kind: it.kind, key: it.key })),
        })),
    };
}

describe("Agent Lab — semantic overview assistant", () => {
    it("parse: legacy exact phrase stays overview_financial", () => {
        const r = parseAssistantCommand("hide financial band on job overview");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.parsed.kind).toBe("overview_financial");
    });

    it("parse: richer hide financial utterance uses overview_layout_semantic", () => {
        const r = parseAssistantCommand("Hide the financial band");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.parsed.kind).toBe("overview_layout_semantic");
    });

    it("parse: field commands win over semantic", () => {
        const r = parseAssistantCommand("hide field Display name from table");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.parsed.kind).toBe("field_table");
    });

    it("runOverviewLayoutSemanticPreview builds v1 structured_override envelope", () => {
        const raw = storedOverview(2);
        const prev = runOverviewLayoutSemanticPreview("customer-focused layout", raw);
        expect(prev.ok).toBe(true);
        if (!prev.ok) return;
        expect(prev.structured_override.intent_type).toBe("update_record_layout");
        const slots = prev.structured_override.slots as Record<string, unknown>;
        expect(slots.target_kind).toBe("record_overview_layout");
        expect(slots.entity_type).toBe("job");
        expect(slots.surface).toBe("overview");
        expect(slots.expected_config_version).toBe(2);
        expect(typeof slots.config).toBe("object");
        expect(prev.planner.ok).toBe(true);
    });

    it("buildAssistantPayload semantic path matches planner + envelope", () => {
        const raw = storedOverview(1);
        const parsed = parseAssistantCommand("Show address and next service date");
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.parsed.kind).toBe("overview_layout_semantic");
        const built = buildAssistantPayload(parsed.parsed, {
            fieldDefinitionId: "",
            expectedUpdatedAt: "",
            overviewConfigRaw: raw,
        });
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.payload.route).toBe("v1");
        const semanticPlanner =
            "semanticPlanner" in built.payload ? built.payload.semanticPlanner ?? null : null;
        expect(semanticPlanner?.ok).toBe(true);
        const o = built.payload.structured_override;
        expect(o.intent_type).toBe("update_record_layout");
    });

    it("unsupported request: parse fails before planner", () => {
        const r = parseAssistantCommand("deploy kubernetes to production");
        expect(r.ok).toBe(false);
    });

    it("preview failure: ambiguity returns structured failure from buildAssistantPayload", () => {
        const raw = storedOverview(1);
        const parsed = parseAssistantCommand("Hide the financial band but turn financial on");
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const built = buildAssistantPayload(parsed.parsed, {
            fieldDefinitionId: "",
            expectedUpdatedAt: "",
            overviewConfigRaw: raw,
        });
        expect(built.ok).toBe(false);
        if (built.ok) return;
        expect(built.semanticPlannerFailure?.ok).toBe(false);
        expect(built.semanticPlannerFailure?.ambiguity?.length).toBeGreaterThan(0);
    });

    it("runOverviewLayoutSemanticPreview surfaces unsupported planner result", () => {
        const r = runOverviewLayoutSemanticPreview("hello world", storedOverview(0));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.planner.ok).toBe(false);
        expect(r.error).toMatch(/No supported/i);
    });
});
