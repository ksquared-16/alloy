/**
 * Per-candidate cohort resolution for queue projection (Card 4.6).
 * Repairs combined opportunity-level cohort keys stored on placement_candidates rows.
 */

import {
    approximateAgeMonthsFromDobIso,
    programLabelAndAgeGroupFromAgeMonths,
} from "@/lib/childcare/childCareProgramFromDob";
import { normalizePlacementWaitlistCohort } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";
import {
    resolveProgramRoomCohort,
    type ResolveProgramRoomCohortResult,
} from "@/lib/orchestration/placement/resolveProgramRoomCohort";

export function looksLikeCombinedProgramRoomCohort(
    key?: string | null,
    label?: string | null
): boolean {
    const l = label?.trim() ?? "";
    const k = key?.trim() ?? "";
    if (/\s·\s/.test(l) || l.includes(" · ")) return true;
    if (k.split("_years_").length > 2) return true;
    if (
        /preschool.*pre_k|pre_k.*preschool|preschool.*young_toddler|young_toddler.*preschool|pre_k.*young_toddler|young_toddler.*pre_k/.test(
            k
        )
    ) {
        return true;
    }
    return false;
}

function safeMeta(raw: unknown): Record<string, unknown> {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {};
}

function resolveFromMemberSources(input: {
    ocmMetadata?: Record<string, unknown> | null;
    candidateMetadata?: Record<string, unknown> | null;
    desiredProgramType?: string | null;
    dateOfBirth?: string | null;
}): ResolveProgramRoomCohortResult | null {
    const ocmMd = safeMeta(input.ocmMetadata);
    const candMd = safeMeta(input.candidateMetadata);
    const memberMeta = Object.keys(ocmMd).length ? ocmMd : candMd;

    const tryDob = (): ResolveProgramRoomCohortResult | null => {
        const dob = input.dateOfBirth?.trim();
        if (!dob) return null;
        const months = approximateAgeMonthsFromDobIso(dob);
        if (months == null) return null;
        const { program_label } = programLabelAndAgeGroupFromAgeMonths(months);
        const fromDob = resolveProgramRoomCohort({
            program_label,
            program_room_group: program_label,
        });
        if (
            looksLikeCombinedProgramRoomCohort(
                fromDob.program_room_cohort_key,
                fromDob.program_room_group_label
            )
        ) {
            return null;
        }
        return fromDob;
    };

    if (!Object.keys(memberMeta).length && !input.desiredProgramType?.trim()) {
        return tryDob();
    }

    const fromMember = resolveProgramRoomCohort({
        metadata: memberMeta,
        program_label:
            (typeof memberMeta.program_label === "string" ? memberMeta.program_label : null) ??
            (typeof memberMeta.demo_program_label === "string" ? memberMeta.demo_program_label : null),
        program_room_group:
            (typeof memberMeta.program_room_group === "string" ? memberMeta.program_room_group : null) ??
            (typeof input.desiredProgramType === "string" ? input.desiredProgramType : null),
        desired_program_type: input.desiredProgramType ?? null,
        program_room_cohort_key:
            typeof memberMeta.program_room_cohort_key === "string" ? memberMeta.program_room_cohort_key : null,
        program_room_group_label:
            typeof memberMeta.program_room_group_label === "string" ? memberMeta.program_room_group_label : null,
    });

    if (
        !looksLikeCombinedProgramRoomCohort(
            fromMember.program_room_cohort_key,
            fromMember.program_room_group_label
        ) &&
        fromMember.program_room_cohort_key !== "unknown_program_room"
    ) {
        return fromMember;
    }

    return tryDob();
}

export function resolvePlacementCandidateCohortFromMember(input: {
    ocmMetadata?: Record<string, unknown> | null;
    candidateMetadata?: Record<string, unknown> | null;
    desiredProgramType?: string | null;
    dateOfBirth?: string | null;
}): ResolveProgramRoomCohortResult {
    return (
        resolveFromMemberSources(input) ??
        resolveProgramRoomCohort({
            metadata: safeMeta(input.ocmMetadata),
            desired_program_type: input.desiredProgramType ?? null,
        })
    );
}

export function resolvePlacementCandidateCohortForQueue(input: {
    storedKey: string;
    storedLabel: string;
    candidateMetadata?: Record<string, unknown> | null;
    ocmMetadata?: Record<string, unknown> | null;
    desiredProgramType?: string | null;
    dateOfBirth?: string | null;
}): { program_room_cohort_key: string; program_room_group_label: string } {
    const storedKey = input.storedKey.trim();
    const storedLabel = input.storedLabel.trim();

    const toStored = (key: string, label: string) => {
        const n = normalizePlacementWaitlistCohort(key, label);
        return { program_room_cohort_key: n.cohortKey, program_room_group_label: n.cohortLabel };
    };

    if (!looksLikeCombinedProgramRoomCohort(storedKey, storedLabel)) {
        return toStored(storedKey, storedLabel);
    }

    const repaired = resolveFromMemberSources(input);
    if (repaired) {
        return toStored(repaired.program_room_cohort_key, repaired.program_room_group_label);
    }

    return toStored(storedKey, storedLabel);
}
