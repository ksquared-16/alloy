import {
    defaultOperationalWorkDueLocal,
    operationalWorkIsoToDatetimeLocal,
} from "@/lib/admin/operationalWork/operationalWorkDateTimeLocal";
import { MANUAL_AD_HOC_WORK_DEFINITION_KEY } from "@/lib/admin/operationalWork/operationalWorkDedupe";
import { resolveEffectiveWorkDefinitions, resolveWorkDefinition } from "@/lib/admin/operationalWork/resolveWorkDefinition";
import { resolveAssigneeFromWorkDefinitionPolicy } from "@/lib/admin/operationalWork/workDefinitionAssigneeResolution";
import { resolveDueAtFromWorkDefinitionPolicy } from "@/lib/admin/operationalWork/workDefinitionDueResolution";
import type { EffectiveWorkDefinition, ResolveWorkDefinitionsParams } from "@/lib/admin/operationalWork/workDefinitionTypes";

export const CREATE_WORK_AD_HOC_OPTION_KEY = MANUAL_AD_HOC_WORK_DEFINITION_KEY;

export type CreateWorkModalDefinitionOption = {
    key: string;
    label: string;
    description: string;
};

export type CreateWorkModalDefinitionPrefill = {
    title: string;
    dueLocal: string;
    assignedToUserId: string | null;
};

/** Operator-facing work type options — ad hoc first, then stage-filtered catalog definitions. */
export function buildCreateWorkModalDefinitionOptions(params: {
    resolveParams?: ResolveWorkDefinitionsParams;
}): CreateWorkModalDefinitionOption[] {
    const adHoc: CreateWorkModalDefinitionOption = {
        key: CREATE_WORK_AD_HOC_OPTION_KEY,
        label: "Ad hoc",
        description: "Custom follow-up",
    };

    const catalog = resolveEffectiveWorkDefinitions({
        ...(params.resolveParams ?? {}),
        includeDisabled: false,
    }).filter((definition) => definition.key !== MANUAL_AD_HOC_WORK_DEFINITION_KEY);

    return [
        adHoc,
        ...catalog.map((definition) => ({
            key: definition.key,
            label: definition.display_name,
            description: definition.description,
        })),
    ];
}

export function resolveCreateWorkModalDefinition(params: {
    workDefinitionKey: string;
    resolveParams?: ResolveWorkDefinitionsParams;
}): EffectiveWorkDefinition | null {
    const key = params.workDefinitionKey.trim();
    if (!key || key === MANUAL_AD_HOC_WORK_DEFINITION_KEY) return null;
    return resolveWorkDefinition(key, params.resolveParams ?? {});
}

/** Prefill modal fields from a selected definition; ad hoc uses operator defaults. */
export function resolveCreateWorkModalDefinitionPrefill(params: {
    workDefinitionKey: string;
    userId: string;
    recordOwnerUserId?: string | null;
    resolveParams?: ResolveWorkDefinitionsParams;
    now?: Date;
}): CreateWorkModalDefinitionPrefill {
    const definition = resolveCreateWorkModalDefinition({
        workDefinitionKey: params.workDefinitionKey,
        resolveParams: params.resolveParams,
    });

    if (!definition) {
        return {
            title: "",
            dueLocal: defaultOperationalWorkDueLocal(),
            assignedToUserId: params.userId.trim() || null,
        };
    }

    const dueResolved = resolveDueAtFromWorkDefinitionPolicy({
        duePolicy: definition.due_policy,
        now: params.now,
    });
    const dueLocal = dueResolved.ok
        ? operationalWorkIsoToDatetimeLocal(dueResolved.dueAt)
        : defaultOperationalWorkDueLocal();

    return {
        title: definition.default_title.trim(),
        dueLocal,
        assignedToUserId: resolveAssigneeFromWorkDefinitionPolicy({
            assigneePolicy: definition.assignee_policy,
            userId: params.userId,
            recordOwnerUserId: params.recordOwnerUserId,
        }),
    };
}
