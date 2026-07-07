/**
 * Canonical field resolver registry.
 *
 * Single source for "can this surface resolve this field?" — derived from
 * existing runtime modules, not hand-maintained parallel lists.
 *
 * Stack: Registry → Resolver → Renderer → Builder → Publish → Available
 *
 * @see docs/sprints/07_2026/field-runtime-unification.md
 */

import { canonicalRefToRuleId, resolveRuleIdForCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";
import { isChildcareOperatorPickerVisible } from "@/lib/fields/childcareFieldCatalogDoctrine";
import { FORM_PICKER_ENTITY_TYPES } from "@/lib/fields/formFieldRegistryPicker";
import { platformFieldByRefKey } from "@/lib/fields/platformFieldCatalog";
import {
    buildTenantLayoutCatalogFields,
    type TenantFieldDefinitionRow,
} from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import {
    isValidatorAllowedQueueRecordFieldRefKey,
    validatorAllowedQueueRecordFieldRefKeys,
} from "@/lib/layout/queueRecordValidatorAllowList";
import {
    isBlockedLayoutPickerRefKey,
    manifestEntryForRefKey,
    type PlatformFieldRuntimePhase,
} from "@/lib/layout/platformFieldResolutionManifest";
import type { FieldAvailabilityContext } from "@/lib/fields/fieldAvailabilityContext";
import {
    contextSupportsChildProfileFields,
    contextSupportsFamilyFields,
    contextSupportsLeadFields,
    contextSupportsLocationFields,
    contextSupportsPersonFields,
} from "@/lib/fields/fieldAvailabilityContext";
import { isCustomerMemberProfileResolutionField } from "@/lib/fields/childProfileFieldResolution";
import {
    COMPUTED_FIELD_CATALOG,
    computedFieldByRefKey,
    isComputedFieldRefKey,
    type ComputedFieldDefinition,
} from "@/lib/fields/computedFieldCatalog";
import type { FieldConsumerSurface } from "@/lib/fields/fieldSurfaceAvailability";

export type FieldResolverModule =
    | "layout_runtime"
    | "queue_record_scoped"
    | "child_profile"
    | "lifecycle_binding"
    | "forms_registry"
    | "table_visibility"
    | "focus_panel_composition"
    | "computed_projection";

export type SurfaceResolverOwnership = {
    surface: FieldConsumerSurface;
    module: FieldResolverModule;
    owner: string;
};

/** Which runtime module owns resolution per surface. */
export const SURFACE_RESOLVER_OWNERSHIP: readonly SurfaceResolverOwnership[] = [
    { surface: "drawer", module: "layout_runtime", owner: "web/lib/layout/runtime/resolveLayoutRuntimeFieldControl.ts" },
    { surface: "forms", module: "forms_registry", owner: "web/lib/fields/formFieldRegistryPicker.ts" },
    { surface: "table", module: "table_visibility", owner: "field_definitions.is_visible_in_table" },
    { surface: "queue_row", module: "queue_record_scoped", owner: "web/lib/layout/runtime/queueRecordScopedResolve.ts" },
    { surface: "focus_panel", module: "focus_panel_composition", owner: "web/lib/adminV2/settings/surfaces/compositionFieldAdapter.ts" },
    { surface: "business_process", module: "lifecycle_binding", owner: "web/lib/lifecycle/lifecycleFieldRuleBindings.ts" },
    { surface: "documents", module: "forms_registry", owner: "web/lib/fields/formFieldRegistryPicker.ts (documents seam)" },
] as const;

/** Computed projection resolver — applies across surfaces via alias checks. */
export const COMPUTED_PROJECTION_RESOLVER_OWNER =
    "web/lib/fields/computedFieldCatalog.ts + web/lib/fields/fieldResolverRegistry.ts";

export type FieldResolverInput = {
    entity_type: string;
    field_key: string;
    refKey?: string;
    field_type?: string;
    label?: string | null;
    is_system?: boolean;
    is_active?: boolean;
    is_visible_in_form?: boolean;
    is_visible_in_drawer?: boolean;
    is_visible_in_table?: boolean;
    config?: Record<string, unknown> | null;
    /** Platform native column (not field_definitions row). */
    is_platform_native?: boolean;
    /** Runtime projection from computed field catalog. */
    is_computed?: boolean;
    /** Context for context-aware surfaces (focus panel, business process). */
    availability_context?: FieldAvailabilityContext;
};

function refKeyForInput(input: FieldResolverInput): string {
    if (input.refKey?.trim()) return input.refKey.trim();
    const et = input.entity_type.trim().toLowerCase();
    const fk = input.field_key.trim();
    if (et === "customer_member") return `child.${fk === "dob" ? "date_of_birth" : fk}`;
    return `${et}.${fk}`;
}

function runtimePhaseReady(phase: PlatformFieldRuntimePhase | undefined): boolean {
    return phase == null || phase === "now";
}

function tenantRowFromInput(input: FieldResolverInput): TenantFieldDefinitionRow {
    return {
        field_key: input.field_key,
        label: input.label ?? null,
        entity_type: input.entity_type,
        field_type: input.field_type ?? "text",
        config: input.config ?? null,
        is_system: input.is_system ?? input.is_platform_native ?? false,
        is_active: input.is_active !== false,
        is_visible_in_drawer: input.is_visible_in_drawer !== false,
    };
}

export type SurfaceResolverResult = {
    supported: boolean;
    module: FieldResolverModule;
    reason: string;
};

function resolverAliasesForRefKey(refKey: string, input: FieldResolverInput): readonly string[] {
    if (input.is_computed || isComputedFieldRefKey(refKey)) {
        const entry = computedFieldByRefKey(refKey);
        if (entry?.resolver_ref_keys.length) return entry.resolver_ref_keys;
    }
    return [refKey];
}

function aliasOnQueueValidator(refKey: string): boolean {
    return (
        isValidatorAllowedQueueRecordFieldRefKey(refKey, false) ||
        isValidatorAllowedQueueRecordFieldRefKey(refKey, true)
    );
}

function aliasOnDrawerManifest(refKey: string): boolean {
    if (isBlockedLayoutPickerRefKey(refKey)) return false;
    const manifest = manifestEntryForRefKey(refKey);
    return Boolean(manifest && runtimePhaseReady(manifest.runtimePhase));
}

function computedCatalogEntry(input: FieldResolverInput, refKey: string): ComputedFieldDefinition | undefined {
    if (input.is_computed) return computedFieldByRefKey(refKey);
    return computedFieldByRefKey(refKey);
}

function resolveComputedProjection(
    surface: FieldConsumerSurface,
    input: FieldResolverInput,
    refKey: string,
): SurfaceResolverResult {
    const module: FieldResolverModule = "computed_projection";
    const entry = computedCatalogEntry(input, refKey);
    if (!entry) {
        return { supported: false, module, reason: "Not in computed field catalog" };
    }
    if (entry.resolver_status !== "now") {
        return {
            supported: false,
            module,
            reason: entry.unavailable_reason ?? "Computed resolver not implemented yet",
        };
    }
    if (surface === "forms") {
        return {
            supported: false,
            module,
            reason: "Not available in Forms because this value is calculated at runtime.",
        };
    }
    if (surface === "table") {
        return { supported: false, module, reason: "Computed projections are not table columns by default." };
    }
    if (surface === "business_process") {
        return {
            supported: false,
            module,
            reason: "Computed field is not registered in lifecycle requirements.",
        };
    }
    const aliases = resolverAliasesForRefKey(refKey, input);
    if (surface === "queue_row" || surface === "focus_panel") {
        const hit = aliases.some((alias) => aliasOnQueueValidator(alias));
        if (hit) {
            return {
                supported: true,
                module,
                reason:
                    surface === "focus_panel"
                        ? "Available in Focus Panel because this value resolves from current work runtime."
                        : "Queue hydration includes this computed projection alias.",
            };
        }
        return {
            supported: false,
            module,
            reason: "Not available in Queue Rows because this projection is not included in queue hydration.",
        };
    }
    if (surface === "drawer" || surface === "documents") {
        if (refKey === "child.age" || aliases.includes("child.date_of_birth")) {
            return {
                supported: true,
                module,
                reason: "Computed at runtime from child.date_of_birth via age derivation.",
            };
        }
        const manifestHit = aliases.some((alias) => aliasOnDrawerManifest(alias));
        if (manifestHit) {
            return { supported: true, module, reason: "Drawer layout runtime resolves computed projection alias." };
        }
        const queueHit = aliases.some((alias) => aliasOnQueueValidator(alias));
        if (queueHit) {
            return { supported: true, module, reason: "Drawer can display queue-resolvable computed projection." };
        }
        return { supported: false, module, reason: "No drawer resolver for this computed projection." };
    }
    return { supported: false, module, reason: "Surface not supported for computed projection." };
}

function resolveDrawer(input: FieldResolverInput, refKey: string): SurfaceResolverResult {
    if (input.is_computed || isComputedFieldRefKey(refKey)) {
        return resolveComputedProjection("drawer", input, refKey);
    }
    const module: FieldResolverModule = "layout_runtime";
    if (isBlockedLayoutPickerRefKey(refKey)) {
        return { supported: false, module, reason: "Blocked layout refKey" };
    }
    const platform = platformFieldByRefKey(refKey);
    if (input.is_platform_native || platform) {
        if (platform?.ownership === "computed") {
            return { supported: true, module, reason: "Computed platform field — drawer projection" };
        }
        return { supported: true, module, reason: "Native column — layout runtime drawer resolver" };
    }
    const manifest = manifestEntryForRefKey(refKey);
    if (manifest && !runtimePhaseReady(manifest.runtimePhase)) {
        return { supported: false, module, reason: `Drawer resolver phase ${manifest.runtimePhase}` };
    }
    const row = tenantRowFromInput(input);
    const surfaces = ["child_drawer", "opportunity_drawer", "person_drawer"] as const;
    const onDrawer = surfaces.some((s) =>
        buildTenantLayoutCatalogFields([row], s).some((f) => f.refKey === refKey),
    );
    if (input.is_visible_in_drawer === false && !onDrawer) {
        return { supported: false, module, reason: "Drawer visibility off in registry" };
    }
    if (onDrawer || manifest?.pickerEligible) {
        return { supported: true, module, reason: "Layout runtime + tenant drawer catalog" };
    }
    return { supported: false, module, reason: "No drawer resolver for this grain" };
}

function resolveForms(input: FieldResolverInput): SurfaceResolverResult {
    const module: FieldResolverModule = "forms_registry";
    const refKey = refKeyForInput(input);
    if (input.is_computed || isComputedFieldRefKey(refKey)) {
        return resolveComputedProjection("forms", input, refKey);
    }
    const et = input.entity_type.trim().toLowerCase();
    const allowed = new Set<string>([...FORM_PICKER_ENTITY_TYPES, "customer_member"]);
    if (!allowed.has(et)) {
        return { supported: false, module, reason: "Entity not in Forms picker grain" };
    }
    if (input.is_platform_native) {
        const nativeFormsKeys = new Set([
            "first_name",
            "last_name",
            "email",
            "phone",
            "date_of_birth",
            "dob",
            "name",
        ]);
        if (nativeFormsKeys.has(input.field_key)) {
            return { supported: true, module, reason: "Platform native — Forms system field binding" };
        }
        if (input.field_key === "status_key") {
            return { supported: false, module, reason: "Status managed by lifecycle control" };
        }
    }
    if (input.is_active === false) return { supported: false, module, reason: "Inactive in registry" };
    if (!isChildcareOperatorPickerVisible(et, input.field_key, { is_system: input.is_system, config: input.config })) {
        return { supported: false, module, reason: "Hidden from operator Forms picker" };
    }
    if (input.is_visible_in_form === false && !input.is_platform_native) {
        return { supported: false, module, reason: "Form visibility off in registry" };
    }
    return { supported: true, module, reason: "Forms registry picker" };
}

function resolveTable(input: FieldResolverInput): SurfaceResolverResult {
    const module: FieldResolverModule = "table_visibility";
    const refKey = refKeyForInput(input);
    if (input.is_computed || isComputedFieldRefKey(refKey)) {
        return resolveComputedProjection("table", input, refKey);
    }
    if (
        input.is_platform_native &&
        ["created_at", "updated_at", "status_key", "customer_number", "name"].includes(input.field_key)
    ) {
        return { supported: true, module, reason: "Platform native — table column" };
    }
    if (input.is_visible_in_table === false) {
        return { supported: false, module, reason: "Table visibility off in registry" };
    }
    return { supported: true, module, reason: "field_definitions table visibility" };
}

function resolveQueueRow(input: FieldResolverInput, refKey: string): SurfaceResolverResult {
    if (input.is_computed || isComputedFieldRefKey(refKey)) {
        return resolveComputedProjection("queue_row", input, refKey);
    }
    const module: FieldResolverModule = "queue_record_scoped";
    const pipeline = isValidatorAllowedQueueRecordFieldRefKey(refKey, false);
    const waitlist = isValidatorAllowedQueueRecordFieldRefKey(refKey, true);
    if (pipeline || waitlist) {
        return {
            supported: true,
            module,
            reason: pipeline && waitlist ? "Queue validator allow-list" : pipeline ? "Pipeline queue only" : "Waitlist queue only",
        };
    }
    return { supported: false, module, reason: "Not on queue row validator allow-list" };
}

function entityReachableInContext(input: FieldResolverInput, context: FieldAvailabilityContext | undefined): boolean {
    if (!context) return true;
    const et = input.entity_type.trim().toLowerCase();
    if (et === "customer_member" || et === "inquiry_child") {
        return contextSupportsChildProfileFields(context);
    }
    if (et === "person") return contextSupportsPersonFields(context);
    if (et === "customer") return contextSupportsFamilyFields(context);
    if (et === "opportunity") return contextSupportsLeadFields(context);
    if (et === "location") return contextSupportsLocationFields(context);
    return true;
}

function resolveFocusPanel(input: FieldResolverInput, refKey: string): SurfaceResolverResult {
    if (input.is_computed || isComputedFieldRefKey(refKey)) {
        return resolveComputedProjection("focus_panel", input, refKey);
    }
    const module: FieldResolverModule = "focus_panel_composition";
    const context = input.availability_context;

    if (
        input.entity_type.trim().toLowerCase() === "customer_member" &&
        isCustomerMemberProfileResolutionField(input.field_key) &&
        entityReachableInContext(input, context)
    ) {
        return {
            supported: true,
            module: "child_profile",
            reason: "Available in Focus Panel when child context is present on the work record.",
        };
    }

    if (input.is_platform_native && input.entity_type === "customer_member") {
        return { supported: false, module, reason: "Child profile native — not focus panel evidence grain" };
    }
    const queue = resolveQueueRow(input, refKey);
    if (queue.supported) {
        return { supported: true, module, reason: "Focus panel shares queue-resolvable evidence refs" };
    }
    const manifest = manifestEntryForRefKey(refKey);
    if (manifest && runtimePhaseReady(manifest.runtimePhase) && entityReachableInContext(input, context)) {
        return { supported: true, module, reason: "Focus panel household/children cards" };
    }
    if (!entityReachableInContext(input, context)) {
        return {
            supported: false,
            module,
            reason: "Not reachable from the current focus panel context.",
        };
    }
    return { supported: false, module, reason: "Not on focus panel evidence groups" };
}

function resolveBusinessProcess(input: FieldResolverInput): SurfaceResolverResult {
    const module: FieldResolverModule = "lifecycle_binding";
    const refKey = refKeyForInput(input);
    if (input.is_computed || isComputedFieldRefKey(refKey)) {
        return resolveComputedProjection("business_process", input, refKey);
    }
    if (input.is_active === false) {
        return { supported: false, module, reason: "Inactive in registry" };
    }
    if (canonicalRefToRuleId({ entity_type: input.entity_type, field_key: input.field_key })) {
        return { supported: true, module, reason: "Lifecycle field rule binding" };
    }
    if (input.is_platform_native) {
        const bpNatives = new Set(["first_name", "last_name", "email", "phone", "dob", "date_of_birth", "name", "status_key"]);
        if (bpNatives.has(input.field_key)) {
            return { supported: true, module, reason: "Platform native — lifecycle profile binding" };
        }
    }
    const context = input.availability_context;
    if (!entityReachableInContext(input, context)) {
        return {
            supported: false,
            module,
            reason: "Not reachable from the current business process context.",
        };
    }
    if (!input.is_platform_native) {
        const ruleId = resolveRuleIdForCanonicalRef({
            entity_type: input.entity_type,
            field_key: input.field_key,
        });
        if (ruleId && !ruleId.startsWith("custom:unknown:")) {
            return {
                supported: true,
                module,
                reason: "Configured field available for Business Process requirements via canonical rule mapping.",
            };
        }
    }
    return { supported: false, module, reason: "Not registered in lifecycle requirements" };
}

function resolveDocuments(input: FieldResolverInput): SurfaceResolverResult {
    const refKey = refKeyForInput(input);
    if (input.is_computed || isComputedFieldRefKey(refKey)) {
        return resolveComputedProjection("documents", input, refKey);
    }
    const forms = resolveForms(input);
    return { ...forms, module: "forms_registry" as const };
}

const SURFACE_RESOLVERS: Record<
    FieldConsumerSurface,
    (input: FieldResolverInput, refKey: string) => SurfaceResolverResult
> = {
    drawer: resolveDrawer,
    forms: (input) => resolveForms(input),
    table: (input) => resolveTable(input),
    queue_row: (input, refKey) => resolveQueueRow(input, refKey),
    focus_panel: (input, refKey) => resolveFocusPanel(input, refKey),
    business_process: (input) => resolveBusinessProcess(input),
    documents: (input) => resolveDocuments(input),
};

/** Can the runtime resolver for this surface resolve the field? */
export function canSurfaceResolveField(
    surface: FieldConsumerSurface,
    input: FieldResolverInput,
): SurfaceResolverResult {
    const refKey = refKeyForInput(input);
    return SURFACE_RESOLVERS[surface](input, refKey);
}

/** All surfaces the resolver registry supports for a field. */
export function supportedSurfacesForField(input: FieldResolverInput): FieldConsumerSurface[] {
    const surfaces: FieldConsumerSurface[] = [
        "drawer",
        "forms",
        "table",
        "queue_row",
        "focus_panel",
        "business_process",
        "documents",
    ];
    return surfaces.filter((s) => canSurfaceResolveField(s, input).supported);
}

/** RefKeys the queue_row resolver module can resolve. */
export function queueResolverBackedRefKeys(isWaitlist = false): readonly string[] {
    return validatorAllowedQueueRecordFieldRefKeys(isWaitlist);
}

export function resolverInputFromComputedField(row: ComputedFieldDefinition): FieldResolverInput {
    const fieldKey = row.refKey.includes(".") ? row.refKey.slice(row.refKey.indexOf(".") + 1) : row.refKey;
    return {
        entity_type: row.entity_type,
        field_key: fieldKey,
        refKey: row.refKey,
        field_type: row.field_type,
        label: row.label,
        is_system: true,
        is_active: true,
        is_visible_in_form: false,
        is_visible_in_drawer: true,
        is_visible_in_table: false,
        is_computed: true,
    };
}

/** Builder library entry for a queue refKey — label from manifest/platform/computed catalog. */
export function builderFieldEntryForRefKey(
    refKey: string,
): { key: string; label: string; namespace: string; isSystemField: boolean } | null {
    const trimmed = refKey.trim();
    const computed = computedFieldByRefKey(trimmed);
    if (computed && computed.resolver_status === "now") {
        const dot = trimmed.indexOf(".");
        const namespace = dot >= 0 ? trimmed.slice(0, dot) : computed.entity_type;
        return { key: trimmed, label: computed.label, namespace, isSystemField: true };
    }
    if (!isValidatorAllowedQueueRecordFieldRefKey(trimmed, false) && !isValidatorAllowedQueueRecordFieldRefKey(trimmed, true)) {
        return null;
    }
    const manifest = manifestEntryForRefKey(trimmed);
    const platform = platformFieldByRefKey(trimmed);
    const dot = trimmed.indexOf(".");
    const namespace = dot >= 0 ? trimmed.slice(0, dot) : "opportunity";
    const label =
        manifest?.label ??
        platform?.label ??
        (dot >= 0 ? trimmed.slice(dot + 1) : trimmed).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { key: trimmed, label, namespace, isSystemField: true };
}

/** Canonical builder library fields for queue/focus surfaces — derived from validator allow-list + computed catalog. */
export function buildCanonicalQueueBuilderFields(isWaitlist = false): Array<{
    key: string;
    label: string;
    namespace: string;
    isSystemField: boolean;
}> {
    const keys = queueResolverBackedRefKeys(isWaitlist);
    const out: Array<{ key: string; label: string; namespace: string; isSystemField: boolean }> = [];
    const seen = new Set<string>();
    for (const key of keys) {
        if (seen.has(key)) continue;
        const entry = builderFieldEntryForRefKey(key);
        if (!entry) continue;
        seen.add(key);
        out.push(entry);
    }
    for (const computed of COMPUTED_FIELD_CATALOG) {
        if (computed.resolver_status !== "now") continue;
        if (seen.has(computed.refKey)) continue;
        const input = resolverInputFromComputedField(computed);
        const queueCap = canSurfaceResolveField("queue_row", input);
        const focusCap = canSurfaceResolveField("focus_panel", input);
        if (!queueCap.supported && !focusCap.supported) continue;
        seen.add(computed.refKey);
        const dot = computed.refKey.indexOf(".");
        out.push({
            key: computed.refKey,
            label: computed.label,
            namespace: dot >= 0 ? computed.refKey.slice(0, dot) : computed.entity_type,
            isSystemField: true,
        });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
}
