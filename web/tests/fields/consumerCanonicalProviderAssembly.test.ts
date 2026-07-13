import { describe, expect, it } from "vitest";
import {
    assembleFocusPanelNestedProviders,
    assembleFormsDocumentProviders,
    assembleQueueRowProviders,
    resolveCanonicalProviderForConsumer,
} from "@/lib/fields/consumerCanonicalProviderAssembly";

describe("consumerCanonicalProviderAssembly", () => {
    it("includes shared native child providers once per consumer assembly", () => {
        const forms = assembleFormsDocumentProviders();
        const queue = assembleQueueRowProviders();
        expect(forms.some((p) => p.refKey === "child.display_name")).toBe(true);
        expect(queue.some((p) => p.refKey === "child.display_name")).toBe(true);
        expect(new Set(forms.filter((p) => p.refKey === "child.display_name").map((p) => p.refKey)).size).toBe(1);
    });

    it("proves Forms assembly: field_definitions flow through canonical registry without Forms-local catalog", () => {
        const defs = [{
            entity_type: "customer_member",
            field_key: "allergy_notes",
            field_type: "text",
            is_system: false,
            is_active: true,
            label: "Allergy notes",
            config: null,
        }];
        const forms = assembleFormsDocumentProviders({ tenantFieldDefinitions: defs as never });
        expect(forms.some((p) => p.refKey === "child.allergy_notes")).toBe(true);
        const resolved = resolveCanonicalProviderForConsumer("child.allergy_notes", "forms", { tenantFieldDefinitions: defs as never });
        expect(resolved?.refKey).toBe("child.allergy_notes");
    });

    it("proves Queue assembly: tenant field_definitions appear in queue_row-filtered registry output", () => {
        const defs = [{
            entity_type: "customer_member",
            field_key: "allergy_notes",
            field_type: "text",
            is_system: false,
            is_active: true,
            label: "Allergy notes",
            config: null,
        }];
        const queue = assembleQueueRowProviders({ tenantFieldDefinitions: defs as never });
        expect(queue.some((p) => p.refKey === "child.allergy_notes")).toBe(true);
    });

    it("proves Focus Panel nested assembly: tenant field_definitions appear without Identity-local catalog", () => {
        const defs = [{
            entity_type: "customer_member",
            field_key: "allergy_notes",
            field_type: "text",
            is_system: false,
            is_active: true,
            label: "Allergy notes",
            config: null,
        }];
        const focusPanel = assembleFocusPanelNestedProviders({ tenantFieldDefinitions: defs as never });
        expect(focusPanel.some((p) => p.refKey === "child.allergy_notes")).toBe(true);
        const resolved = resolveCanonicalProviderForConsumer("child.allergy_notes", "focus_panel", {
            tenantFieldDefinitions: defs as never,
        });
        expect(resolved?.refKey).toBe("child.allergy_notes");
    });

    it("merges Settings platform native fields such as child.first_name into focus_panel assembly", () => {
        const focusPanel = assembleFocusPanelNestedProviders();
        const firstName = focusPanel.find((provider) => provider.refKey === "child.first_name");
        expect(firstName?.label).toBe("First name");
        expect(firstName?.categoryKey).toBe("child_profile");
    });
});
