/**
 * P6.S1 — Business Process command_set_v1 authority.
 */

import { describe, expect, it } from "vitest";

import {
    buildEnrollmentLeadProofProcess,
    enrollmentLeadProofActionCatalog,
    ENROLLMENT_LEAD_PROOF_COMMAND_KEYS,
    proveEnrollmentLeadCommandSetEquivalence,
    resolveEnrollmentLeadEffectiveProof,
} from "@/lib/lifecycle/enrollmentLeadProcessCommandAuthority";
import { migrateLegacyProcessCommands } from "@/lib/lifecycle/migrateLegacyProcessCommands";
import { parseLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    emptyProcessCommandSetV1,
    parseProcessCommandSetV1,
} from "@/lib/lifecycle/processCommandSetV1";
import { resolveBusinessProcessCommandSelection } from "@/lib/lifecycle/resolveBusinessProcessCommandSelection";
import { resolveEffectiveBusinessProcessCommands } from "@/lib/lifecycle/resolveEffectiveBusinessProcessCommands";

describe("P6.S1 command_set_v1 contract", () => {
    it("parses a valid command_set_v1", () => {
        const parsed = parseProcessCommandSetV1({
            version: 1,
            commands: [
                { capability_key: "create_lead", enabled: true },
                {
                    capabilityKey: "reschedule_tour",
                    enabled: true,
                    variantKey: "evening",
                    processPolicy: { recommended: true },
                },
            ],
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.commands).toHaveLength(2);
        expect(parsed.value.commands[1]?.variant_key).toBe("evening");
        expect(parsed.value.commands[1]?.process_policy?.recommended).toBe(true);
    });

    it("rejects unsupported version", () => {
        const parsed = parseProcessCommandSetV1({ version: 2, commands: [] });
        expect(parsed.ok).toBe(false);
        expect(parsed.issues.some((i) => i.code === "unsupported_version")).toBe(true);
    });

    it("normalizes duplicate keys to first entry", () => {
        const parsed = parseProcessCommandSetV1({
            version: 1,
            commands: [
                { capability_key: "close_lead", enabled: true },
                { capability_key: "close_lead", enabled: false },
            ],
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.commands).toHaveLength(1);
        expect(parsed.value.commands[0]?.enabled).toBe(true);
        expect(parsed.issues.some((i) => i.code === "duplicate_canonical")).toBe(true);
    });

    it("diagnoses rejected executor/mutation fields without accepting them", () => {
        const parsed = parseProcessCommandSetV1({
            version: 1,
            commands: [
                {
                    capability_key: "create_lead",
                    enabled: true,
                    executor: "custom",
                    mutation_payload: { x: 1 },
                },
            ],
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.commands[0]).toEqual({
            capability_key: "create_lead",
            enabled: true,
        });
        expect(parsed.issues.filter((i) => i.code === "rejected_field").length).toBeGreaterThan(0);
    });

    it("round-trips through lifecycle builder parse", () => {
        const raw = {
            version: 1,
            active_process_id: "p1",
            processes: [
                {
                    id: "p1",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    command_set_v1: {
                        version: 1,
                        commands: [{ capability_key: "schedule_tour", enabled: true }],
                    },
                    stages: [],
                },
            ],
        };
        const parsed = parseLifecycleBuilderV1(raw);
        expect(parsed?.processes[0]?.command_set_v1?.commands[0]?.capability_key).toBe(
            "schedule_tour"
        );
    });
});

describe("P6.S1 selection authority", () => {
    it("uses command_set_v1 when present — including empty", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: emptyProcessCommandSetV1(),
        });
        const result = resolveBusinessProcessCommandSelection({ process });
        expect(result.authority).toBe("command_set_v1");
        expect(result.commands.commands).toHaveLength(0);
        expect(result.diagnostics.some((d) => d.code === "empty_selection")).toBe(true);
    });

    it("falls back to legacy only when V1 is absent", () => {
        const process = buildEnrollmentLeadProofProcess();
        const result = resolveBusinessProcessCommandSelection({ process });
        expect(result.authority).toBe("legacy_compatibility");
        expect(result.legacySources).toContain("stage_action_catalog_v1");
        expect(result.commands.commands.map((c) => c.capability_key)).toEqual(
            expect.arrayContaining([...ENROLLMENT_LEAD_PROOF_COMMAND_KEYS, "confirm_tour"])
        );
    });

    it("does not union V1 with legacy lists", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "quick_message", enabled: true }],
            },
        });
        const result = resolveBusinessProcessCommandSelection({ process });
        expect(result.authority).toBe("command_set_v1");
        expect(result.commands.commands.map((c) => c.capability_key)).toEqual(["quick_message"]);
        expect(result.commands.commands.map((c) => c.capability_key)).not.toContain("schedule_tour");
    });
});

describe("P6.S1 effective resolution", () => {
    it("resolves aliases to canonical identity", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "mark_lost", enabled: true }],
            },
        });
        const effective = resolveEffectiveBusinessProcessCommands({ process });
        expect(effective.commands[0]?.canonicalCapabilityKey).toBe("close_lead");
        expect(effective.commands[0]?.requestedKey).toBe("mark_lost");
    });

    it("marks unknown capabilities selected but not runnable", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "totally_unknown_command_xyz", enabled: true }],
            },
        });
        const effective = resolveEffectiveBusinessProcessCommands({ process });
        expect(effective.commands[0]?.capabilityStatus).toBe("unknown");
        expect(effective.commands[0]?.invocationReadiness).toBe("not_executable");
        expect(effective.diagnostics.some((d) => d.code === "unknown_capability")).toBe(true);
    });

    it("marks unavailable capabilities not runnable", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "archive_lead", enabled: true }],
            },
        });
        const effective = resolveEffectiveBusinessProcessCommands({ process });
        const row = effective.commands[0];
        expect(row?.capabilityStatus === "unavailable" || row?.capabilityStatus === "placeholder").toBe(
            true
        );
        expect(row?.invocationReadiness).toBe("not_executable");
    });

    it("does not treat organization-disabled Commands as runnable", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "schedule_tour", enabled: true }],
            },
        });
        const effective = resolveEffectiveBusinessProcessCommands({
            process,
            organizationCommandCatalog: {
                isEnabled: (key) => (key === "schedule_tour" ? false : true),
            },
        });
        expect(effective.commands[0]?.availabilityStatus).toBe("unavailable");
        expect(effective.commands[0]?.invocationReadiness).toBe("not_executable");
        expect(effective.commands[0]?.reasons).toContain("authorization_deferred_to_invocation");
    });

    it("reports context mismatch without claiming authorization", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [
                    {
                        capability_key: "schedule_tour",
                        enabled: true,
                        availability: { contexts: ["focus_panel"] },
                    },
                ],
            },
        });
        const effective = resolveEffectiveBusinessProcessCommands({
            process,
            operationalContext: "record_header",
            organizationCommandCatalog: { isEnabled: () => true },
        });
        expect(effective.commands[0]?.availabilityStatus).toBe("context_mismatch");
        expect(effective.commands[0]?.invocationReadiness).toBe("not_executable");
    });

    it("stage reference cannot create process selection", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "quick_message", enabled: true }],
            },
        });
        const effective = resolveEffectiveBusinessProcessCommands({
            process,
            stageKey: "lead",
            stageActionCatalog: enrollmentLeadProofActionCatalog(),
        });
        expect(effective.commands).toHaveLength(1);
        expect(effective.stageOrphans.length).toBeGreaterThan(0);
        expect(effective.stageOrphans.every((o) => !o.processSelected)).toBe(true);
        expect(effective.stageOrphans.every((o) => o.invocationReadiness === "not_executable")).toBe(
            true
        );
        expect(effective.diagnostics.some((d) => d.code === "stage_reference_unselected")).toBe(true);
    });

    it("disabled process Command cannot be re-enabled by stage recommendation", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "quick_message", enabled: false }],
            },
        });
        const effective = resolveEffectiveBusinessProcessCommands({
            process,
            stageKey: "lead",
        });
        expect(effective.commands[0]?.processEnabled).toBe(false);
        expect(effective.commands[0]?.stageRecommended).toBe(true);
        expect(effective.commands[0]?.invocationReadiness).toBe("not_executable");
    });

    it("diagnoses missing variants honestly", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [
                    {
                        capability_key: "schedule_tour",
                        enabled: true,
                        variant_key: "missing_variant",
                    },
                ],
            },
        });
        const effective = resolveEffectiveBusinessProcessCommands({
            process,
            organizationCommandCatalog: {
                isEnabled: () => true,
                hasVariant: () => false,
            },
        });
        expect(effective.diagnostics.some((d) => d.code === "missing_variant")).toBe(true);
        expect(effective.commands[0]?.variantKey).toBe("missing_variant");
    });

    it("keeps authorization unresolved on runnable Commands", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "create_lead", enabled: true }],
            },
        });
        const effective = resolveEffectiveBusinessProcessCommands({
            process,
            organizationCommandCatalog: { isEnabled: () => true },
        });
        expect(effective.commands[0]?.invocationReadiness).toBe("runnable");
        expect(effective.commands[0]?.reasons).toContain("authorization_deferred_to_invocation");
    });
});

describe("P6.S1 enrollment Lead proof", () => {
    it("preserves equivalent selection between legacy and derived V1", () => {
        const proof = proveEnrollmentLeadCommandSetEquivalence();
        expect(proof.authorityWithoutV1).toBe("legacy_compatibility");
        expect(proof.authorityWithV1).toBe("command_set_v1");
        expect(proof.equivalent).toBe(true);
        expect(proof.v1Keys).toEqual(
            expect.arrayContaining([...ENROLLMENT_LEAD_PROOF_COMMAND_KEYS])
        );
    });

    it("resolves Lead stage recommendations for selected Commands", () => {
        const effective = resolveEnrollmentLeadEffectiveProof();
        expect(effective.authority).toBe("command_set_v1");
        const quick = effective.commands.find((c) => c.canonicalCapabilityKey === "quick_message");
        expect(quick?.stageRecommended).toBe(true);
        expect(quick?.processSelected).toBe(true);
        const tourConfirm = effective.commands.find(
            (c) => c.canonicalCapabilityKey === "confirm_tour"
        );
        expect(tourConfirm?.stageRecommended).toBe(false);
    });

    it("legacy migrate is deterministic and single-sourced for stage catalogs", () => {
        const process = buildEnrollmentLeadProofProcess();
        const migrated = migrateLegacyProcessCommands({ process });
        expect(migrated.sources).toEqual(["stage_action_catalog_v1"]);
        expect(migrated.commands.version).toBe(1);
    });
});
