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
    programKey?: string | null;
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

    if (!Object.keys(memberMeta).length && !input.programKey?.trim()) {
        return tryDob();
    }

    const fromMember = resolveProgramRoomCohort({
        metadata: memberMeta,
        program_label:
            (typeof memberMeta.program_label === "string" ? memberMeta.program_label : null) ??
            (typeof memberMeta.demo_program_label === "string" ? memberMeta.demo_program_label : null),
        program_room_group:
            (typeof memberMeta.program_room_group === "string" ? memberMeta.program_room_group : null) ??
            (typeof input.programKey === "string" ? input.programKey : null),
        program_key: input.programKey ?? null,
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
    programKey?: string | null;
    programRoomCohortKey?: string | null;
    dateOfBirth?: string | null;
}): ResolveProgramRoomCohortResult {
    const explicitCohort = (input.programRoomCohortKey ?? "").trim();
    if (explicitCohort) {
        const label =
            (typeof safeMeta(input.ocmMetadata).program_room_group_label === "string" ?
                String(safeMeta(input.ocmMetadata).program_room_group_label).trim()
            :   "") || explicitCohort;
        return {
            program_room_cohort_key: explicitCohort,
            program_room_group_label: label,
            label_source: "ocm.program_room_cohort_key",
            key_source: "ocm.program_room_cohort_key",
        };
    }
    return (
        resolveFromMemberSources(input) ??
        resolveProgramRoomCohort({
            metadata: safeMeta(input.ocmMetadata),
            program_key: input.programKey ?? null,
        })
    );
}

export function resolvePlacementCandidateCohortForQueue(input: {
    storedKey: string;
    storedLabel: string;
    /** Authoritative OCM child placement scope when linked. */
    ocmProgramRoomCohortKey?: string | null;
    candidateMetadata?: Record<string, unknown> | null;
    ocmMetadata?: Record<string, unknown> | null;
    programKey?: string | null;
    dateOfBirth?: string | null;
}): { program_room_cohort_key: string; program_room_group_label: string } {
    const storedKey = input.storedKey.trim();
    const storedLabel = input.storedLabel.trim();
    const ocmKey = (input.ocmProgramRoomCohortKey ?? "").trim();
    const programKey = (input.programKey ?? "").trim();

    const toStored = (key: string, label: string) => {
        const n = normalizePlacementWaitlistCohort(key, label);
        return { program_room_cohort_key: n.cohortKey, program_room_group_label: n.cohortLabel };
    };

    // Inquiry drawer canonical program key — align queue sections/labels with the OCM program category key.
    if (programKey) {
        const fromProgram =
            resolveFromMemberSources({
                ocmMetadata: input.ocmMetadata,
                candidateMetadata: input.candidateMetadata,
                programKey,
                dateOfBirth: input.dateOfBirth,
            }) ??
            resolveProgramRoomCohort({
                metadata: safeMeta(input.ocmMetadata),
                program_key: programKey,
            });
        if (
            fromProgram.program_room_cohort_key &&
            fromProgram.program_room_cohort_key !== "unknown_program_room" &&
            !looksLikeCombinedProgramRoomCohort(
                fromProgram.program_room_cohort_key,
                fromProgram.program_room_group_label
            )
        ) {
            const programCohortKey = fromProgram.program_room_cohort_key.trim();
            if (!storedKey || storedKey !== programCohortKey || (ocmKey && ocmKey !== programCohortKey)) {
                return toStored(fromProgram.program_room_cohort_key, fromProgram.program_room_group_label);
            }
        }
    }

    if (ocmKey) {
        const storedIsCombined = looksLikeCombinedProgramRoomCohort(storedKey, storedLabel);
        const storedDiffers = Boolean(storedKey && storedKey !== ocmKey);
        if (!storedKey || storedIsCombined || storedDiffers) {
            const fromOcm = resolvePlacementCandidateCohortFromMember({
                ocmMetadata: input.ocmMetadata,
                candidateMetadata: input.candidateMetadata,
                programKey: input.programKey,
                programRoomCohortKey: ocmKey,
                dateOfBirth: input.dateOfBirth,
            });
            return toStored(fromOcm.program_room_cohort_key, fromOcm.program_room_group_label);
        }
    }

    if (!looksLikeCombinedProgramRoomCohort(storedKey, storedLabel)) {
        return toStored(storedKey, storedLabel);
    }

    const repaired = resolveFromMemberSources(input);
    if (repaired) {
        return toStored(repaired.program_room_cohort_key, repaired.program_room_group_label);
    }

    return toStored(storedKey, storedLabel);
}
