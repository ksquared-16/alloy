"use client";

import {
    ProgramLocationAvailabilityFlow,
} from "@/components/adminV2/settings/programs/ProgramLocationAvailabilityFlow";
import { isProgramLocationAvailabilityPrototype } from "@/lib/configRuntime/programLocationAvailabilityPrototypeModel";

/**
 * Location → Programs → Add Program entry.
 * Stage 1: shared non-mutating availability prototype.
 * Production mutation path remains in git history / Stage 3 restore via stage flag.
 */
export default function LocationAddProgramPanel({
    activeLocationId,
    activeLocationLabel,
    locations,
    associatedProgramIds,
    associatedProgramKeys,
    onCancel,
    onComplete,
}: {
    activeLocationId: string;
    activeLocationLabel: string;
    locations: readonly { id: string; label: string }[];
    associatedProgramIds: ReadonlySet<string>;
    associatedProgramKeys: ReadonlySet<string>;
    onCancel: () => void;
    onComplete: (result: { programId: string; targetLocationIds: string[] }) => Promise<void> | void;
}) {
    // Stage 1 always uses the prototype flow. Production mutations are deferred.
    void isProgramLocationAvailabilityPrototype;

    return (
        <ProgramLocationAvailabilityFlow
            entry={{
                direction: "location",
                activeLocationId,
                activeLocationLabel,
            }}
            locations={locations}
            alreadyAssociatedLocationIds={new Set()}
            associatedProgramIds={associatedProgramIds}
            associatedProgramKeys={associatedProgramKeys}
            onCancel={onCancel}
            onDone={(result) =>
                void onComplete({
                    programId: result.programId,
                    targetLocationIds: result.associatedLocationIds,
                })
            }
        />
    );
}
