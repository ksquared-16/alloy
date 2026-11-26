/**
 * THE SMELL TEST — adding a configured relationship is ONE definition row and nothing else.
 *
 * Kelly's acceptance criterion for the relationship layer: if someone introduces Physician, Attorney,
 * Case Worker, Transportation Contact, Therapist, Foster Parent or Sponsor, they add one relationship
 * definition and write NO provider code, NO Forms change, NO Configuration Discovery change and NO
 * relationship execution change.
 *
 * This test injects a hypothetical `case_workers` definition by mocking the canonical registry, then
 * asserts that every consumer picks it up with no other edit. It is the guard that keeps the layering
 * honest — if someone reintroduces a per-role allowlist anywhere in the chain, this test fails.
 *
 * It used to inject `physicians`. Physician is now a REAL definition — a real enrollment packet asked
 * for a child's doctor — so the hypothetical moved to another role the criterion names. That the real
 * one arrived as a single row, colliding with nothing but this fixture's capability key, IS the
 * criterion being met.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const CASE_WORKER = {
    definition_key: "case_workers",
    operational_role_key: "case_worker",
    source_entity_type: "customer",
    target_entity_type: "person",
    direction: "anchor_to_target" as const,
    cardinality: "many" as const,
    label: "Case workers",
    help_text: "Assigned case workers.",
    collectable: true,
    scopes: ["this_child", "all_children_in_household"],
    nested_field_keys: ["full_name", "phone"],
    create_link_policy: "create_or_link" as const,
    apply_command_key: "add_case_worker",
    responsibility_default: "either_guardian",
    native: false as const,
    provider_ref: "person.contact_role.case_workers",
    collection_ref: "case_workers",
    item_entity_type: "person",
    provider_role_key: "case_worker",
    required_context_keys: ["customer_id"],
    active_only: false,
    ordering_policy: "display_name" as const,
    iteration_alias: "case_worker",
    detection_patterns: ["case\\s*worker", "caseworker"],
    detection_priority: 15,
    detection_word_suffix: true,
    relationship_scope: "child" as const,
    executor_kind: "child_scoped_contact" as const,
    write_targets: ["contacts", "customer_persons"] as const,
    persists_to: "person_child_relationships" as const,
    role_key_candidates: ["case_worker", "caseworker"],
};

// Inject the new row as if an operator had configured it — every other module is untouched.
vi.mock("@/lib/fields/relationship/relationshipDefinitions", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/fields/relationship/relationshipDefinitions")>();
    const rows = [...actual.RELATIONSHIP_DEFINITIONS, CASE_WORKER];
    const byRole = new Map(rows.map((d) => [d.operational_role_key, d]));
    const byRef = new Map(rows.map((d) => [d.provider_ref, d]));
    const byCommand = new Map(rows.map((d) => [d.apply_command_key, d]));
    const re = (d: typeof CASE_WORKER) =>
        new RegExp(`\\b(${d.detection_patterns.join("|")})${d.detection_word_suffix ? "\\b" : ""}`, "i");
    return {
        ...actual,
        RELATIONSHIP_DEFINITIONS: rows,
        relationshipDefinitionForRole: (r: string) =>
            r === "parent" || r === "guardian" ? byRole.get("guardian") : byRole.get(r.trim()),
        relationshipDefinitionForRef: (r: string) => byRef.get(r.trim()),
        relationshipDefinitionForCommandKey: (k: string) => byCommand.get(k.trim()),
        relationshipDefinitionCommandKeys: () => rows.map((d) => d.apply_command_key),
        collectableRelationshipDefinitions: () => rows.filter((d) => d.collectable),
        relationshipDefinitionsByDetectionPriority: () =>
            [...rows].sort((a, b) => a.detection_priority - b.detection_priority),
        detectRelationshipDefinitionForTitle: (title: string) =>
            [...rows]
                .sort((a, b) => a.detection_priority - b.detection_priority)
                .find((d) => re(d as typeof CASE_WORKER).test(title.toLowerCase())),
        relationshipDetectionPattern: () =>
            new RegExp(`\\b(${rows.flatMap((d) => d.detection_patterns).join("|")})`, "i"),
    };
});

beforeEach(() => {
    vi.resetModules();
});

describe("SMELL TEST — a new configured relationship needs ONE definition row", () => {
    it("ZERO provider code: the collection projection produces a working provider", async () => {
        const { findCanonicalCollectionProvider, classifyCollectionProvider } = await import(
            "@/lib/fields/collection/canonicalCollectionProviderRegistry"
        );
        const provider = findCanonicalCollectionProvider("person.contact_role.case_workers");
        expect(provider, "case_worker has no collection provider").toBeDefined();
        expect(provider!.providerKind).toBe("relationship_role");
        expect(provider!.label).toBe("Case workers");
        expect(provider!.relationshipRoleKey).toBe("case_worker");
        expect(classifyCollectionProvider("person.contact_role.case_workers")).toBe("configured_relationship");
    });

    it("ZERO Forms changes: bindable, authorable, and correctly aliased", async () => {
        const { findFormsCollectionBindingProvider, buildFormsAuthorableCollectionBindingSeeds } = await import(
            "@/lib/fields/canonicalFormsRelationshipProviderDerivation"
        );
        const { collectionBindingAuthoringEnabledForProvider } = await import(
            "@/lib/fields/formsRelationshipOperationalSupport"
        );
        const { collectionBindingFromProvider } = await import("@/lib/fields/formsCollectionRepeatBinding");

        const provider = findFormsCollectionBindingProvider("person.contact_role.case_workers");
        expect(provider, "case_worker not bindable in Forms").toBeDefined();
        expect(collectionBindingAuthoringEnabledForProvider("person.contact_role.case_workers")).toBe(true);
        expect(buildFormsAuthorableCollectionBindingSeeds().map((p) => p.refKey)).toContain(
            "person.contact_role.case_workers",
        );
        const binding = collectionBindingFromProvider(provider!);
        expect(binding.iteration_entity_type).toBe("person");
        expect(binding.iteration_alias).toBe("case_worker");
    });

    it("ZERO Configuration Discovery changes: the section is detected and classified", async () => {
        const { detectRelationshipDefinitionForTitle, relationshipDetectionPattern } = await import(
            "@/lib/fields/relationship/relationshipDefinitions"
        );
        expect(relationshipDetectionPattern().test("Case worker Information")).toBe(true);
        expect(detectRelationshipDefinitionForTitle("case worker information")?.operational_role_key).toBe("case_worker");
        // precedence still honours the more specific role
        expect(detectRelationshipDefinitionForTitle("emergency contact")?.operational_role_key).toBe(
            "emergency_contact",
        );
    });

    it("ZERO execution changes: command, capability, gate and role resolution all derive", async () => {
        const { relationshipActionRegistryEntry } = await import(
            "@/lib/admin/relationship/relationshipActionRegistry"
        );
        const { isRelationshipRuntimeFacadeSupported } = await import(
            "@/lib/platform/commands/runtime/commandRuntimeExecutionGate"
        );
        const { tryResolvePlatformCapability } = await import("@/lib/platform/commands/capabilityRegistry");
        const { resolveRelationshipRoleKeyForAction } = await import(
            "@/lib/admin/relationship/relationshipActionRoleResolution"
        );
        const { shouldWriteChildScopedRelationshipsToPcr } = await import(
            "@/lib/admin/actions/childScopedContactRoleMapping"
        );

        const entry = relationshipActionRegistryEntry("add_case_worker");
        expect(entry, "no registry entry for add_case_worker").not.toBeNull();
        expect(entry!.defaultRoleKey).toBe("case_worker");
        expect(entry!.executorKind).toBe("child_scoped_contact");
        expect(entry!.allowedScopes).toEqual(["this_child", "all_children_in_household"]);
        expect(entry!.label).toBe("Add Case workers");

        expect(isRelationshipRuntimeFacadeSupported("add_case_worker")).toBe(true);

        const cap = tryResolvePlatformCapability("add_case_worker");
        expect(cap.status, "no platform capability for add_case_worker").toBe("known");
        expect(cap.status === "known" && cap.capability.executionOwner).toBe("relationship_runtime");
        expect(cap.status === "known" && cap.capability.operatorLabel).toBe("Add Case workers");

        expect(
            resolveRelationshipRoleKeyForAction({
                actionKey: "add_case_worker",
                activeRoleKeys: new Set(["case_worker", "guardian"]),
            }),
        ).toBe("case_worker");

        expect(
            shouldWriteChildScopedRelationshipsToPcr({
                executorKind: "child_scoped_contact",
                roleKey: "case_worker",
                actionKey: "add_case_worker",
            }),
        ).toBe(true);
    });

    it("the three shipped roles are UNCHANGED by the new row", async () => {
        const { relationshipActionRegistryEntry } = await import(
            "@/lib/admin/relationship/relationshipActionRegistry"
        );
        const { shouldWriteChildScopedRelationshipsToPcr } = await import(
            "@/lib/admin/actions/childScopedContactRoleMapping"
        );

        const guardian = relationshipActionRegistryEntry("add_parent_guardian")!;
        expect(guardian.defaultRoleKey).toBe("guardian");
        expect(guardian.executorKind).toBe("guardian");
        expect(guardian.label).toBe("Add Parent / Guardian");
        expect(guardian.writeTargets).toEqual(["contacts", "customer_persons", "customer_member_contacts"]);
        // Guardian still lands on the LEGACY table — the behaviour that a naive derivation would flip.
        expect(
            shouldWriteChildScopedRelationshipsToPcr({
                executorKind: "guardian",
                roleKey: "guardian",
                actionKey: "add_parent_guardian",
            }),
        ).toBe(false);

        const emergency = relationshipActionRegistryEntry("add_emergency_contact")!;
        expect(emergency.defaultRoleKey).toBe("emergency_contact");
        expect(emergency.writeTargets).toEqual(["contacts", "customer_persons"]);
        expect(
            shouldWriteChildScopedRelationshipsToPcr({
                executorKind: "child_scoped_contact",
                roleKey: "emergency_contact",
                actionKey: "add_emergency_contact",
            }),
        ).toBe(true);

        const pickup = relationshipActionRegistryEntry("add_authorized_pickup")!;
        expect(pickup.defaultRoleKey).toBe("authorized_pickup");
        expect(pickup.writeTargets).toEqual(["contacts"]);

        // billing has NO definition row and must keep its own executor untouched
        const billing = relationshipActionRegistryEntry("add_billing_contact")!;
        expect(billing.executorKind).toBe("billing");
        expect(
            shouldWriteChildScopedRelationshipsToPcr({
                executorKind: "billing",
                roleKey: "billing_contact",
                actionKey: "add_billing_contact",
            }),
        ).toBe(false);
    });
});
