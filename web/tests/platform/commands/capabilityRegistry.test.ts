import { describe, expect, it } from "vitest";

import { listRegisteredActionKeys } from "@/lib/adminV2/actions/actionRegistry";
import { partitionConfiguredActionKeys } from "@/lib/adminV2/actions/configValidation";
import { filterSettingsActionCatalogDefinitions } from "@/lib/admin/actions/actionDefinitionRegistry";
import {
    REGISTERED_ACTION_CAPABILITY_KEYS,
    assertKnownPlatformCapability,
    canonicalCapabilityKeyForAlias,
    executionOwnerForCapability,
    getPlatformCapability,
    isExecutablePlatformCapability,
    isNonRunnableCatalogCapability,
    isOrganizationCatalogCapability,
    isProcessingIdentityCapabilityKey,
    isUnavailableCapability,
    listPlatformCapabilities,
    processingCapabilityKey,
    resolvePlatformCapability,
    tryResolvePlatformCapability,
} from "@/lib/platform/commands/capabilityRegistry";
import { isCommandRuntimeFacadeExecutionSupported } from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";

describe("capabilityRegistry spine (P0.S1)", () => {
    it("keeps REGISTERED_ACTION_CAPABILITY_KEYS in sync with RegisteredAction handlers", () => {
        expect([...REGISTERED_ACTION_CAPABILITY_KEYS].sort()).toEqual(listRegisteredActionKeys().sort());
    });

    it("gives every RegisteredAction an executable registered_action capability", () => {
        for (const key of listRegisteredActionKeys()) {
            const cap = assertKnownPlatformCapability(key);
            expect(cap.maturity).toBe("executable");
            expect(cap.executionOwner).toBe("registered_action");
            expect(isExecutablePlatformCapability(key)).toBe(true);
        }
    });

    it("rejects registered_action ownership claims without a RegisteredAction (integrity)", () => {
        // Spine load already asserts; spot-check known executables.
        expect(executionOwnerForCapability("create_lead")).toBe("registered_action");
        expect(executionOwnerForCapability("confirm_tour")).toBe("registered_action");
    });

    it("classifies Mutation Runtime keys as adapted — not RegisteredAction", () => {
        for (const key of [
            "update_lead_status",
            "close_lead",
            "update_child_enrollment_status",
            "waitlist_child",
            "enroll_child",
        ]) {
            const cap = assertKnownPlatformCapability(key);
            expect(cap.maturity).toBe("adapted");
            expect(cap.executionOwner).toBe("mutation_runtime");
            expect(isExecutablePlatformCapability(key)).toBe(false);
        }
    });

    it("classifies Relationship Runtime keys as adapted", () => {
        for (const key of [
            "add_emergency_contact",
            "add_authorized_pickup",
            "add_billing_contact",
            "add_parent_guardian",
            "add_child",
            "link_existing_person",
            "link_existing_child",
        ]) {
            const cap = assertKnownPlatformCapability(key);
            expect(cap.maturity).toBe("adapted");
            expect(cap.executionOwner).toBe("relationship_runtime");
        }
    });

    it("classifies make_primary_contact as admin_action replacement (P4.S2 facade allowlisted)", () => {
        const cap = assertKnownPlatformCapability("make_primary_contact");
        expect(cap.maturity).toBe("adapted");
        expect(cap.executionOwner).toBe("admin_action");
        expect(cap.confirmationPolicy).toBe("strong_confirm");
        expect(cap.destructiveKind).toBe("replace");
        expect(cap.supportsPreview).toBe(true);
        expect(cap.reason).toMatch(/P4/i);
        expect(isCommandRuntimeFacadeExecutionSupported("make_primary_contact")).toBe(true);
    });

    it("classifies Tour keys with tour_domain ownership (except confirm_tour registered dual-path)", () => {
        expect(executionOwnerForCapability("schedule_tour")).toBe("tour_domain");
        expect(executionOwnerForCapability("reschedule_tour")).toBe("tour_domain");
        expect(executionOwnerForCapability("cancel_tour")).toBe("tour_domain");
        expect(executionOwnerForCapability("complete_tour")).toBe("tour_domain");
        expect(executionOwnerForCapability("no_show_tour")).toBe("tour_domain");
        expect(executionOwnerForCapability("confirm_tour")).toBe("registered_action");
        expect(getPlatformCapability("reopen_tour")?.maturity).toBe("unavailable");
        expect(isUnavailableCapability("reopen_tour")).toBe(true);
    });

    it("resolves aliases deterministically to one canonical capability", () => {
        expect(canonicalCapabilityKeyForAlias("mark_lost")).toBe("close_lead");
        expect(canonicalCapabilityKeyForAlias("approve_enrollment")).toBe("enroll_child");
        expect(canonicalCapabilityKeyForAlias("move_to_waitlist")).toBe("waitlist_child");
        expect(canonicalCapabilityKeyForAlias("add_related_person")).toBe("add_family_member");
        expect(canonicalCapabilityKeyForAlias("mark_tour_no_show")).toBe("no_show_tour");
        expect(tryResolvePlatformCapability("mark_lost").status).toBe("known");
    });

    it("marks placeholders unavailable and not organization-catalog runnable", () => {
        expect(isUnavailableCapability("send_message_placeholder")).toBe(true);
        expect(isOrganizationCatalogCapability("send_message_placeholder")).toBe(false);
        expect(isNonRunnableCatalogCapability("send_message_placeholder")).toBe(true);
        expect(getPlatformCapability("send_message_placeholder")?.catalogVisibility).toBe("hidden");
    });

    it("throws in development/test for unknown capability keys", () => {
        expect(() => resolvePlatformCapability("totally_unknown_capability_xyz")).toThrow(/Unknown capability/);
    });

    it("partitions unknown and non-runnable keys as disabled without treating adapted as disabled", () => {
        const { renderable, disabled } = partitionConfiguredActionKeys([
            "create_lead",
            "close_lead",
            "schedule_tour",
            "send_message_placeholder",
            "reopen_tour",
            "totally_made_up",
        ]);
        expect(renderable.sort()).toEqual(["close_lead", "create_lead", "schedule_tour"].sort());
        expect(disabled.sort()).toEqual(
            ["reopen_tour", "send_message_placeholder", "totally_made_up"].sort()
        );
    });

    it("forbids organization_command_catalog visibility on placeholder/unavailable (integrity)", () => {
        for (const cap of listPlatformCapabilities()) {
            if (cap.maturity === "placeholder" || cap.maturity === "unavailable") {
                expect(cap.catalogVisibility).not.toBe("organization_command_catalog");
            }
        }
    });

    it("namespaces Processing Identity create_lead away from operator create_lead", () => {
        const operator = assertKnownPlatformCapability("create_lead");
        expect(operator.maturity).toBe("executable");
        expect(operator.executionOwner).toBe("registered_action");

        const processingKey = processingCapabilityKey("create_lead");
        expect(processingKey).toBe("processing.create_lead");
        expect(isProcessingIdentityCapabilityKey(processingKey)).toBe(true);
        const processing = assertKnownPlatformCapability(processingKey);
        expect(processing.maturity).toBe("processing_only");
        expect(processing.executionOwner).toBe("processing_identity");
        expect(isOrganizationCatalogCapability(processingKey)).toBe(false);
    });

    it("treats navigation-only entries as non-mutation executors", () => {
        expect(assertKnownPlatformCapability("open_record").maturity).toBe("navigation_only");
        expect(assertKnownPlatformCapability("ask_bos").maturity).toBe("navigation_only");
        expect(isExecutablePlatformCapability("open_record")).toBe(false);
        expect(executionOwnerForCapability("open_record")).toBe("navigation");
    });

    it("excludes configuration-maintenance from organization operational catalog", () => {
        const cap = assertKnownPlatformCapability("configuration.maintenance");
        expect(cap.maturity).toBe("configuration_maintenance");
        expect(isOrganizationCatalogCapability("configuration.maintenance")).toBe(false);
        expect(isNonRunnableCatalogCapability("configuration.maintenance")).toBe(true);
    });

    it("hides placeholders and unavailable keys from Settings catalog add list", () => {
        const filtered = filterSettingsActionCatalogDefinitions([
            {
                id: "1",
                key: "schedule_tour",
                label: "Schedule",
                action_type: "open_form",
                entity_type: "opportunity",
                org_id: null,
            },
            {
                id: "2",
                key: "send_message_placeholder",
                label: "Message",
                action_type: "ui_intent",
                entity_type: "opportunity",
                org_id: null,
            },
            {
                id: "3",
                key: "reopen_tour",
                label: "Reopen",
                action_type: "ui_intent",
                entity_type: "opportunity",
                org_id: null,
            },
            {
                id: "4",
                key: "update_status",
                label: "Update status",
                action_type: "update_status",
                entity_type: "opportunity",
                org_id: null,
            },
        ]);
        expect(filtered.map((d) => d.key)).toEqual(["schedule_tour"]);
    });

    it("does not claim false RegisteredAction ownership for family hub / tours", () => {
        expect(executionOwnerForCapability("add_family_member")).toBe("admin_action");
        expect(executionOwnerForCapability("add_sibling")).toBe("admin_action");
        expect(isExecutablePlatformCapability("schedule_tour")).toBe(false);
    });
});
