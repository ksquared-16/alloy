/**
 * Resolve the Enrollment participation definition from published config — the seam that makes the
 * Process Builder the engine's source of truth. Reads `participation_v1` from the department's
 * lifecycle_builder_v1 (what the Participation section publishes); falls back to the default seed
 * when nothing is published. The engine consumes the ProcessParticipationContract this returns, so
 * changing the definition in the Process Builder changes what the engine reads — no engine edit.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    participationContractFromConfig,
    type ParticipationConfigV1,
} from "@/lib/process/participationConfig";
import type { ProcessParticipationContract } from "@/lib/process/engine";
import { DEFAULT_ENROLLMENT_PARTICIPATION_CONFIG } from "./enrollmentContract";

/** The published Enrollment participation config from department metadata, else the default seed. */
export function resolveEnrollmentParticipationConfig(departmentMetadata: unknown): ParticipationConfigV1 {
    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const proc =
        builder.processes.find((p) => p.key === ENROLLMENT_PROCESS_KEY && p.is_active) ??
        builder.processes.find((p) => p.key === ENROLLMENT_PROCESS_KEY);
    return proc?.participation_v1 ?? DEFAULT_ENROLLMENT_PARTICIPATION_CONFIG;
}

/** The engine contract the runtime reads — sourced from the published config, defaulting to the seed. */
export function resolveEnrollmentParticipationContract(
    departmentMetadata: unknown,
): ProcessParticipationContract {
    return participationContractFromConfig(
        ENROLLMENT_PROCESS_KEY,
        resolveEnrollmentParticipationConfig(departmentMetadata),
    );
}
