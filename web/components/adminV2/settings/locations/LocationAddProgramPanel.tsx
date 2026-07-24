"use client";

import { ProgramLocationAvailabilityFlow } from "@/components/adminV2/settings/programs/ProgramLocationAvailabilityFlow";

/**
 * Location → Programs → Add Program entry.
 * Production: shared Make Available workflow (preview_make_available / make_available).
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
    return (
        <ProgramLocationAvailabilityFlow
            entry={{
                direction: "location",
                activeLocationId,
                activeLocationLabel,
            }}
            locations={locations}
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
