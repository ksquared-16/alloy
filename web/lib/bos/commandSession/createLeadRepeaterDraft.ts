/**
 * Bridge Create Lead Form repeaters ↔ shared BosCommandDraft.
 * Multi-member truth lives in draft.household as CreateLeadCommitSelection (version 1)
 * or IntakeHouseholdCandidate from Conversation parse (converted on read).
 */

import {
    buildCreateLeadCommitSelection,
    createEmptyCreateLeadCommitSelection,
    isCreateLeadCommitSelection,
    parseCreateLeadCommitSelection,
    patchCreateLeadCommitRecord,
    syncCreateLeadValuesFromCommitSelection,
    type CreateLeadCommitRecord,
    type CreateLeadCommitSelection,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { mapCreateLeadCommitSelectionToExecutePayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import { upsertBosDraftValue } from "@/lib/bos/commandSession/draftValues";
import {
    applyFormValuesToDraft,
    formValuesFromDraft,
} from "@/lib/bos/commandSession/draftEdits";
import {
    bosDraftToEligiblePayload,
} from "@/lib/bos/commandSession/draftValues";
import type { BosCommandDraft } from "@/lib/bos/commandSession/types";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";
import {
    householdFromCommitSelection,
    householdFromFlatCreateLeadMerged,
} from "@/lib/pos/processingIdentity/sources/householdFromCommitSelection";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";

function isIntakeHouseholdCandidate(value: unknown): value is IntakeHouseholdCandidate {
    if (!value || typeof value !== "object") return false;
    if (isCreateLeadCommitSelection(value)) return false;
    const obj = value as Record<string, unknown>;
    return Array.isArray(obj.children) || Array.isArray(obj.parents_guardians) || Array.isArray(obj.parents);
}

function personNameKey(record: Pick<CreateLeadCommitRecord, "first_name" | "last_name">): string {
    return `${record.first_name.trim().toLowerCase()}|${record.last_name.trim().toLowerCase()}`;
}

function isBlankAdult(record: CreateLeadCommitRecord): boolean {
    return !record.first_name.trim() && !record.last_name.trim() && !record.email.trim() && !record.phone.trim();
}

/** Incoming fills empty keys only — never clobber operator-entered extras. */
function mergeExtraPayloadValues(
    existing: Record<string, string> | null | undefined,
    incoming: Record<string, string> | null | undefined,
): Record<string, string> {
    const out: Record<string, string> = { ...(existing ?? {}) };
    for (const [key, raw] of Object.entries(incoming ?? {})) {
        const value = typeof raw === "string" ? raw.trim() : "";
        if (!value) continue;
        if ((out[key] ?? "").trim()) continue;
        out[key] = value;
    }
    return out;
}

function enrichRecordFromIncoming(
    existing: CreateLeadCommitRecord,
    incoming: CreateLeadCommitRecord
): CreateLeadCommitRecord {
    return {
        ...existing,
        first_name: existing.first_name.trim() || incoming.first_name,
        last_name: existing.last_name.trim() || incoming.last_name,
        email: existing.email.trim() || incoming.email,
        phone: existing.phone.trim() || incoming.phone,
        dob: existing.dob || incoming.dob,
        program_interest: existing.program_interest || incoming.program_interest,
        start_date: existing.start_date || incoming.start_date,
        program_room_cohort_key: existing.program_room_cohort_key || incoming.program_room_cohort_key,
        schedule_type: existing.schedule_type || incoming.schedule_type,
        extra_payload_values: mergeExtraPayloadValues(
            existing.extra_payload_values,
            incoming.extra_payload_values,
        ),
        source_fact_ids: [
            ...new Set([...(existing.source_fact_ids ?? []), ...(incoming.source_fact_ids ?? [])]),
        ],
    };
}

/**
 * Merge Conversation-parsed household into an existing Form/Conversation selection.
 * Preserves stable candidate IDs and primary adult; appends distinct named adults/children.
 */
export function mergeCreateLeadCommitSelections(
    existing: CreateLeadCommitSelection,
    incoming: CreateLeadCommitSelection
): CreateLeadCommitSelection {
    let next = existing;

    const primary = next.parents.find((p) => p.primary) ?? next.parents[0];
    const incomingPrimary = incoming.parents.find((p) => p.primary) ?? incoming.parents[0];
    if (primary && incomingPrimary && isBlankAdult(primary) && !isBlankAdult(incomingPrimary)) {
        next = patchCreateLeadCommitRecord(next, primary.candidate_id, {
            first_name: incomingPrimary.first_name,
            last_name: incomingPrimary.last_name,
            email: incomingPrimary.email,
            phone: incomingPrimary.phone,
        });
    }

    for (const inc of incoming.parents) {
        const key = personNameKey(inc);
        if (!key || key === "|") continue;
        const match = next.parents.find((p) => personNameKey(p) === key);
        if (match) {
            const enriched = enrichRecordFromIncoming(match, inc);
            next = patchCreateLeadCommitRecord(next, match.candidate_id, {
                first_name: enriched.first_name,
                last_name: enriched.last_name,
                email: enriched.email,
                phone: enriched.phone,
                extra_payload_values: enriched.extra_payload_values,
            });
            continue;
        }
        const before = next.parents.length;
        next = {
            ...next,
            parents: [
                ...next.parents,
                {
                    ...inc,
                    primary: false,
                    candidate_id: `parent:merged:${before}:${inc.candidate_id}`,
                },
            ],
        };
    }

    for (const inc of incoming.children) {
        const key = personNameKey(inc);
        if (!key || key === "|") {
            // Skip blank parsed children — never auto-create empty invalid child rows.
            continue;
        }
        const match = next.children.find((c) => personNameKey(c) === key);
        if (match) {
            const enriched = enrichRecordFromIncoming(match, inc);
            next = patchCreateLeadCommitRecord(next, match.candidate_id, {
                first_name: enriched.first_name,
                last_name: enriched.last_name,
                dob: enriched.dob,
                program_interest: enriched.program_interest,
                start_date: enriched.start_date,
                program_room_cohort_key: enriched.program_room_cohort_key,
                schedule_type: enriched.schedule_type,
                extra_payload_values: enriched.extra_payload_values,
            });
            continue;
        }
        const before = next.children.length;
        next = {
            ...next,
            children: [
                ...next.children,
                {
                    ...inc,
                    primary: before === 0,
                    candidate_id: `child:merged:${before}:${inc.candidate_id}`,
                },
            ],
        };
    }

    return next;
}

/** Convert parsed household payload into selection and merge into the shared draft.
 * Does not rewrite flat draft values — callers apply parsed field upserts separately,
 * then may sync empty primary flats via `syncEmptyPrimaryFlatFromSelection`.
 */
export function applyParsedHouseholdToDraft(
    draft: BosCommandDraft,
    parsedHousehold: unknown
): BosCommandDraft {
    if (parsedHousehold == null) return draft;

    let incoming: CreateLeadCommitSelection | null = null;
    if (isCreateLeadCommitSelection(parsedHousehold)) {
        incoming = parsedHousehold;
    } else if (isIntakeHouseholdCandidate(parsedHousehold)) {
        incoming = buildCreateLeadCommitSelection(parsedHousehold);
    }
    if (!incoming) {
        return { ...draft, household: parsedHousehold };
    }

    const existing = resolveCreateLeadCommitSelectionFromDraft(draft);
    const existingIsBlank =
        existing.parents.length <= 1 &&
        existing.parents.every(isBlankAdult) &&
        existing.children.length === 0;

    if (existingIsBlank) {
        const seeded =
            incoming.parents.length > 0
                ? incoming
                : createEmptyCreateLeadCommitSelection();
        return { ...draft, household: seeded };
    }

    return {
        ...draft,
        household: mergeCreateLeadCommitSelections(existing, incoming),
    };
}

/** Fill empty primary flat keys from selection without clobbering operator/parsed values. */
export function syncEmptyPrimaryFlatFromSelection(
    draft: BosCommandDraft,
    options?: {
        state?: "parsed_from_source" | "inferred" | "operator_entered";
        now?: string;
    }
): BosCommandDraft {
    const selection = resolveCreateLeadCommitSelectionFromDraft(draft);
    const primary = selection.parents.find((p) => p.primary) ?? selection.parents[0];
    if (!primary) return draft;
    const now = options?.now ?? new Date().toISOString();
    const state = options?.state ?? "parsed_from_source";
    const pairs: Array<[string, string]> = [
        ["first_name", primary.first_name],
        ["last_name", primary.last_name],
        ["email", primary.email],
        ["phone", primary.phone],
    ];
    let next = draft;
    for (const [fieldKey, value] of pairs) {
        const trimmed = value.trim();
        if (!trimmed) continue;
        const existing = next.values.find((v) => v.fieldKey === fieldKey);
        if (existing && String(existing.value ?? "").trim()) continue;
        next = upsertBosDraftValue(next, {
            fieldKey,
            value: trimmed,
            state,
            optionResolved: false,
            evidence: [
                {
                    kind: "system_default",
                    note: "From household understanding",
                    at: now,
                },
            ],
        });
    }
    return next;
}

/** Resolve repeater selection from the shared draft (parse household or prior Form edits). */
export function resolveCreateLeadCommitSelectionFromDraft(
    draft: BosCommandDraft,
): CreateLeadCommitSelection {
    const fromStored = parseCreateLeadCommitSelection(draft.household);
    if (fromStored) {
        if (fromStored.parents.length === 0) {
            return { ...fromStored, parents: createEmptyCreateLeadCommitSelection().parents };
        }
        return fromStored;
    }
    if (isIntakeHouseholdCandidate(draft.household)) {
        const built = buildCreateLeadCommitSelection(draft.household);
        if (built.parents.length === 0) {
            return createEmptyCreateLeadCommitSelection();
        }
        return built;
    }
    const flat = formValuesFromDraft(draft);
    const fromFlat = householdFromFlatCreateLeadMerged(flat);
    if (fromFlat) return buildCreateLeadCommitSelection(fromFlat);
    return createEmptyCreateLeadCommitSelection();
}

/**
 * Apply Form repeater edits into the shared draft.
 * Stores selection on household; syncs primary flat values for eligibility/Conversation.
 */
export function applyCreateLeadCommitSelectionToDraft(
    draft: BosCommandDraft,
    selection: CreateLeadCommitSelection,
): BosCommandDraft {
    const flat = formValuesFromDraft(draft);
    const synced = syncCreateLeadValuesFromCommitSelection(flat, selection);
    // Preserve context fields that are not member-scoped.
    for (const key of [
        "location_id",
        "child_program",
        "child_program_room_cohort_key",
        "child_schedule_type",
        "child_start_date",
        "source",
        "intake_notes",
    ] as const) {
        if (flat[key] != null) synced[key] = flat[key]!;
    }
    let next = applyFormValuesToDraft(draft, synced);
    next = {
        ...next,
        household: selection,
    };
    return next;
}

/** Eligible execute payload with household_commit_v1 when repeaters exist. */
export function bosDraftToCreateLeadExecutePayload(draft: BosCommandDraft): Record<string, unknown> {
    const base = bosDraftToEligiblePayload(draft);
    const selection = resolveCreateLeadCommitSelectionFromDraft(draft);
    const hasMulti =
        selection.parents.length > 1 ||
        selection.children.length > 0 ||
        isCreateLeadCommitSelection(draft.household) ||
        isIntakeHouseholdCandidate(draft.household);
    if (!hasMulti && selection.parents.length <= 1 && selection.children.length === 0) {
        // Still emit selection when Form stored an empty-child selection with one parent —
        // keep flat path unless household was set.
        if (draft.household == null) return base;
    }
    const flatStrings: Record<string, string> = {};
    for (const [k, v] of Object.entries(base)) {
        if (typeof v === "string") flatStrings[k] = v;
    }
    const mapped = mapCreateLeadCommitSelectionToExecutePayload({
        values: { ...formValuesFromDraft(draft), ...flatStrings },
        selection,
    });
    return {
        ...base,
        ...mapped,
        household_commit: selection,
    };
}

export function summarizeCommitParents(selection: CreateLeadCommitSelection): string[] {
    return selection.parents.map((p) => {
        const emptyLabel = p.primary ? "Primary" : "Additional";
        const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || emptyLabel;
        const contact = [p.email, p.phone].filter(Boolean).join(" · ");
        return contact ? `${name} · ${contact}` : name;
    });
}

function formatCreateLeadSummaryDate(isoOrDisplay: string): string {
    const trimmed = isoOrDisplay.trim();
    if (!trimmed) return "";
    return formatDisplayDate(trimmed) || trimmed;
}

export function summarizeCommitChildren(selection: CreateLeadCommitSelection): string[] {
    return selection.children.map((c, index) => {
        const emptyLabel = index === 0 ? "Child" : "Additional";
        const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || emptyLabel;
        const bits = [
            name,
            c.program_interest ? c.program_interest : null,
            c.start_date ? `Start ${formatCreateLeadSummaryDate(c.start_date)}` : null,
            c.dob ? `Born ${formatCreateLeadSummaryDate(c.dob)}` : null,
        ].filter(Boolean);
        return bits.join(" · ");
    });
}

/** Rebuild intake household from selection for Conversation understanding compatibility. */
export function intakeHouseholdFromDraftSelection(draft: BosCommandDraft): IntakeHouseholdCandidate | null {
    const selection = resolveCreateLeadCommitSelectionFromDraft(draft);
    if (selection.parents.every((p) => !p.first_name && !p.last_name) && selection.children.length === 0) {
        return null;
    }
    const locationId = formValuesFromDraft(draft).location_id?.trim() || null;
    return householdFromCommitSelection(selection, { locationId });
}
