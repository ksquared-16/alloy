/**
 * Capacity projection adapter — maps capacity.room_binding result fields to
 * ApprovedInputRef scalars. Does not redefine capacity math.
 */

import { CAPACITY_ROOM_BINDING } from "@/lib/operationalCalculations/families/resourceRequirementsAndCapacity";
import { resolveCalculation } from "@/lib/operationalCalculations/runtime";
import type { CapacityConfig } from "@/lib/childcareOperational/capacity/resolveOperationalCapacity";
import type { OperationalCapacityRequest } from "@/lib/childcareOperational/capacity/capacityContractTypes";
import type { CalculationResolutionStatus } from "@/lib/operationalCalculations/resultContract";
import type { ApprovedInputRef } from "@/lib/organizationCalculations/catalog";
import type { InputResolution } from "@/lib/organizationCalculations/evaluate";
import { CATALOG_INPUTS } from "@/lib/organizationCalculations/catalog";

export type CapacityProjectionBundle = {
    status: CalculationResolutionStatus;
    projections: Record<ApprovedInputRef, InputResolution>;
    /** Platform binding scalar for parity checks. */
    binding: number | null;
    physical: number | null;
    licensed: number | null;
    operational: number | null;
    ratioLimited: number | null;
};

/**
 * Resolve platform capacity.room_binding once and project catalog inputs.
 */
export function projectCapacityRoomBindingInputs(args: {
    config: CapacityConfig;
    params: OperationalCapacityRequest;
    clock?: () => Date;
}): CapacityProjectionBundle {
    const result = resolveCalculation(CAPACITY_ROOM_BINDING, {
        config: args.config,
        params: args.params,
    }, {
        clock: args.clock ?? (() => new Date(args.params.effectiveAt)),
    });

    const value = result.value;
    const byProjection = {
        physical: value.physical,
        licensed: value.licensed,
        operational: value.operational,
        ratioLimited: value.ratioLimited,
        binding: value.binding,
    } as const;

    const projections = {} as Record<ApprovedInputRef, InputResolution>;
    for (const input of CATALOG_INPUTS) {
        const scalar = byProjection[input.projection];
        projections[input.ref] = {
            value: scalar,
            upstreamStatus: result.status,
            note: scalar == null ? `${input.label} unknown from capacity.room_binding` : undefined,
        };
    }

    return {
        status: result.status,
        projections,
        binding: value.binding,
        physical: value.physical,
        licensed: value.licensed,
        operational: value.operational,
        ratioLimited: value.ratioLimited,
    };
}

export function resolveInputFromCapacityProjection(
    bundle: CapacityProjectionBundle,
    ref: ApprovedInputRef,
): InputResolution {
    return (
        bundle.projections[ref] ?? {
            value: null,
            upstreamStatus: "incomplete",
            note: `Unknown catalog ref: ${ref}`,
        }
    );
}
