/**
 * Progressive Create Lead section presentation — UI state helpers only.
 * Draft remains the single source of truth (BosCommandDraft).
 */

import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import type { BosCommandDraft } from "@/lib/bos/commandSession/types";
import { operationalSectionTitle } from "@/lib/bos/commandSession/createLeadUnderstandingPresentation";

export type CreateLeadSectionModel = {
    key: string;
    title: string;
    helper: string;
    fields: ActionWorkspaceGatherField[];
    requiredPayloadKeys: string[];
    missingRequiredKeys: string[];
    populatedCount: number;
    isRequiredSection: boolean;
    completion: "empty" | "partial" | "ready";
    summaryLines: string[];
    statusLabel: string;
};

const ADDITIONAL_INFO_KEYS = new Set(["source", "intake_notes"]);

const SECTION_HELPER: Record<string, string> = {
    person: "Required to create this lead",
    child: "Optional — add when you have child details",
    context: "Lead details",
    opportunity: "Lead details",
    additional: "Source and notes",
    household: "Household details",
};

/** Pair keys that may sit side-by-side when expanded (never when pinned). */
export const CREATE_LEAD_FIELD_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ["first_name", "last_name"],
    ["email", "phone"],
    ["child_first_name", "child_last_name"],
    ["child_date_of_birth", "child_start_date"],
];

export function isCreateLeadPairField(payloadKey: string): boolean {
    return CREATE_LEAD_FIELD_PAIRS.some(([a, b]) => a === payloadKey || b === payloadKey);
}

function draftValueMap(draft: BosCommandDraft): Map<string, string> {
    const map = new Map<string, string>();
    for (const entry of draft.values) {
        const display = String(entry.value ?? "").trim();
        if (display) map.set(entry.fieldKey, display);
    }
    return map;
}

function resolveDisplay(
    payloadKey: string,
    raw: string,
    optionLabels?: ReadonlyMap<string, string>
): string {
    return optionLabels?.get(`${payloadKey}:${raw}`) ?? optionLabels?.get(raw) ?? raw;
}

function formatPersonName(values: Map<string, string>): string | null {
    const name = [values.get("first_name"), values.get("last_name")].filter(Boolean).join(" ").trim();
    return name || null;
}

function needsContact(values: Map<string, string>): boolean {
    return !values.get("email") && !values.get("phone");
}

/**
 * Derive progressive section models from effective gather sections + shared draft.
 * Optional split: notes/source → Additional information when present alongside placement fields.
 */
export function buildCreateLeadSectionModels(input: {
    sections: Array<{ key: string; label: string; fields: ActionWorkspaceGatherField[] }>;
    draft: BosCommandDraft;
    requiredPayloadKeys: readonly string[];
    optionLabels?: ReadonlyMap<string, string>;
    /** Multi-person summary lines from commit selection (overrides flat summary). */
    parentSummaries?: string[];
    childSummaries?: string[];
    /** Explicit child row count — empty optional section vs incomplete added rows. */
    childRowCount?: number;
}): CreateLeadSectionModel[] {
    const values = draftValueMap(input.draft);
    const required = new Set(input.requiredPayloadKeys);
    const models: CreateLeadSectionModel[] = [];

    for (const section of input.sections) {
        if (section.key === "context") {
            const additionalFields = section.fields.filter((f) => ADDITIONAL_INFO_KEYS.has(f.payload_key));
            const placementFields = section.fields.filter((f) => !ADDITIONAL_INFO_KEYS.has(f.payload_key));
            if (additionalFields.length && placementFields.length) {
                models.push(
                    buildOneSection({
                        key: "context",
                        title: operationalSectionTitle("context", section.label || "Lead"),
                        helper: SECTION_HELPER.context!,
                        fields: placementFields,
                        values,
                        required,
                        optionLabels: input.optionLabels,
                    })
                );
                models.push(
                    buildOneSection({
                        key: "additional",
                        title: "Additional information",
                        helper: SECTION_HELPER.additional!,
                        fields: additionalFields,
                        values,
                        required,
                        optionLabels: input.optionLabels,
                    })
                );
                continue;
            }
        }

        const key =
            section.key === "context" &&
            section.fields.every((f) => ADDITIONAL_INFO_KEYS.has(f.payload_key))
                ? "additional"
                : section.key;
        const title =
            key === "additional"
                ? "Additional information"
                : operationalSectionTitle(section.key, section.label);

        models.push(
            buildOneSection({
                key,
                title,
                helper: SECTION_HELPER[key] ?? section.label,
                fields: section.fields,
                values,
                required,
                optionLabels: input.optionLabels,
                summaryOverride:
                    key === "person"
                        ? input.parentSummaries
                        : key === "child"
                          ? input.childSummaries
                          : undefined,
                childRowCount: key === "child" ? input.childRowCount : undefined,
            })
        );
    }

    return models;
}

function buildOneSection(input: {
    key: string;
    title: string;
    helper: string;
    fields: ActionWorkspaceGatherField[];
    values: Map<string, string>;
    required: Set<string>;
    optionLabels?: ReadonlyMap<string, string>;
    summaryOverride?: string[];
    childRowCount?: number;
}): CreateLeadSectionModel {
    const requiredPayloadKeys = input.fields
        .map((f) => f.payload_key)
        .filter((k) => input.required.has(k));
    const missingRequiredKeys = requiredPayloadKeys.filter((k) => !input.values.has(k));
    const namedSummaries =
        input.summaryOverride?.filter((line) => {
            return (
                !/^Parent \/ guardian$/.test(line) &&
                !/^Child$/.test(line) &&
                !/^Primary$/.test(line) &&
                !/^Additional$/.test(line)
            );
        }) ?? [];
    const populatedCount =
        input.key === "child" && (input.childRowCount ?? 0) > 0
            ? Math.max(namedSummaries.length, input.childRowCount ?? 0)
            : namedSummaries.length > 0
              ? namedSummaries.length
              : input.fields.filter((f) => input.values.has(f.payload_key)).length;
    const isRequiredSection =
        input.key === "person" ||
        (requiredPayloadKeys.length > 0 &&
            input.key !== "additional" &&
            input.key !== "child");
    const contactGap = input.key === "person" && needsContact(input.values);
    const incompleteChildRows =
        input.key === "child" && (input.childRowCount ?? 0) > 0 && namedSummaries.length < (input.childRowCount ?? 0);

    let completion: CreateLeadSectionModel["completion"] = "empty";
    if (missingRequiredKeys.length > 0 || contactGap || incompleteChildRows) {
        completion = "partial";
    } else if (populatedCount > 0) {
        completion = "ready";
    }

    const summaryLines =
        input.key === "child" && (input.childRowCount ?? 0) > 0
            ? namedSummaries.length > 0
                ? namedSummaries
                : [`${input.childRowCount} child${(input.childRowCount ?? 0) === 1 ? "" : "ren"} started`]
            : namedSummaries.length > 0
              ? namedSummaries
              : buildSummaryLines(input.key, input.values, input.optionLabels);

    let statusLabel: string;
    if (completion === "ready") {
        statusLabel = "Ready";
    } else if (incompleteChildRows) {
        statusLabel =
            (input.childRowCount ?? 0) === 1
                ? "1 detail still needed"
                : `${input.childRowCount} children need names`;
    } else if (isRequiredSection && missingRequiredKeys.length > 0 && populatedCount === 0) {
        if (missingRequiredKeys.includes("location_id") && missingRequiredKeys.length === 1) {
            statusLabel = "Location is required";
        } else {
            statusLabel =
                missingRequiredKeys.length === 1
                    ? "1 detail still needed"
                    : `${missingRequiredKeys.length} details still needed`;
        }
    } else if (contactGap && input.key === "person" && missingRequiredKeys.length === 0) {
        statusLabel = "Add a phone or email";
    } else if (missingRequiredKeys.length > 0) {
        const n = missingRequiredKeys.length + (contactGap ? 1 : 0);
        statusLabel = n === 1 ? "1 detail still needed" : `${n} details still needed`;
    } else if (!isRequiredSection && populatedCount === 0) {
        statusLabel = "Optional";
    } else {
        statusLabel = "In progress";
    }

    // Person empty: count name gaps + code-owned contact (email|phone) as one detail.
    // Matches the four visible required controls without treating email and phone as two.
    if (input.key === "person" && populatedCount === 0) {
        const gaps = missingRequiredKeys.length + (contactGap ? 1 : 0);
        if (gaps > 0) {
            statusLabel = gaps === 1 ? "1 detail still needed" : `${gaps} details still needed`;
        } else {
            statusLabel = "Required to create this lead";
        }
    }

    return {
        key: input.key,
        title: input.title,
        helper: input.helper,
        fields: input.fields,
        requiredPayloadKeys,
        missingRequiredKeys,
        populatedCount,
        isRequiredSection,
        completion,
        summaryLines,
        statusLabel,
    };
}

function buildSummaryLines(
    key: string,
    values: Map<string, string>,
    optionLabels?: ReadonlyMap<string, string>
): string[] {
    const lines: string[] = [];
    if (key === "person") {
        const name = formatPersonName(values);
        if (name) lines.push(name);
        const contact = [values.get("email"), values.get("phone")].filter(Boolean).join(" · ");
        if (contact) lines.push(contact);
        return lines;
    }
    if (key === "child") {
        const name = [values.get("child_first_name"), values.get("child_last_name")]
            .filter(Boolean)
            .join(" ")
            .trim();
        const dob = values.get("child_date_of_birth");
        const age = values.get("child_age");
        const head = [name, dob ? `Born ${dob}` : age ? `Age ${age}` : null].filter(Boolean).join(" · ");
        if (head) lines.push(head);
        const program = values.get("child_program");
        if (program) lines.push(resolveDisplay("child_program", program, optionLabels));
        const start = values.get("child_start_date");
        if (start) lines.push(`Desired start ${start}`);
        return lines;
    }
    if (key === "additional") {
        const source = values.get("source");
        if (source) lines.push(resolveDisplay("source", source, optionLabels));
        const notes = values.get("intake_notes");
        if (notes) lines.push(notes.length > 80 ? `${notes.slice(0, 77)}…` : notes);
        return lines;
    }
    const location = values.get("location_id");
    if (location) lines.push(resolveDisplay("location_id", location, optionLabels));
    const program = values.get("child_program");
    const room = values.get("child_program_room_cohort_key");
    const placement = [
        program ? resolveDisplay("child_program", program, optionLabels) : null,
        room ? resolveDisplay("child_program_room_cohort_key", room, optionLabels) : null,
    ]
        .filter(Boolean)
        .join(" · ");
    if (placement) lines.push(placement);
    const start = values.get("child_start_date");
    if (start) lines.push(`Desired start ${start}`);
    return lines;
}

/** Default open section: Parent when incomplete, else first incomplete required entity. */
export function defaultOpenSectionKeys(models: CreateLeadSectionModel[]): string[] {
    const family = models.find((m) => m.key === "person");
    if (family && family.completion !== "ready") return ["person"];
    const requiredIncomplete = models.find(
        (m) => m.isRequiredSection && m.completion !== "ready" && m.key !== "person"
    );
    if (requiredIncomplete) return [requiredIncomplete.key];
    return [];
}

export function sectionAffordanceLabel(model: CreateLeadSectionModel): string {
    if (model.completion === "ready" || model.populatedCount > 0) return "Edit";
    if (model.isRequiredSection) return "Open";
    return "Add details";
}
