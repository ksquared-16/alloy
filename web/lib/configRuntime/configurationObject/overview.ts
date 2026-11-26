/**
 * Read-first Overview region projection (Checkpoint C.5).
 */

import {
    CONFIGURATION_OBJECT_OVERVIEW_REGION_ORDER,
    type ConfigurationObjectOverviewRegion,
    type ConfigurationObjectOverviewRegionKey,
} from "@/lib/configRuntime/configurationObject/types";

export function projectConfigurationObjectOverviewRegions(
    present: Partial<Record<ConfigurationObjectOverviewRegionKey, boolean>>,
): ConfigurationObjectOverviewRegion[] {
    return CONFIGURATION_OBJECT_OVERVIEW_REGION_ORDER.map((key) => ({
        key,
        present: present[key] === true,
    })).filter((region) => region.present);
}

/** Human-readable Overview question each region answers. */
export const CONFIGURATION_OBJECT_OVERVIEW_REGION_PURPOSE: Record<
    ConfigurationObjectOverviewRegionKey,
    string
> = {
    identity_and_state: "What is this object and what state is it in?",
    summary: "What does it currently mean operationally?",
    key_relationships: "Where is it used / related?",
    usage: "Where is it used?",
    lifecycle: "What lifecycle / publication posture applies?",
    recent_changes: "What changed recently?",
    attention: "What needs attention?",
    primary_action: "What can the operator do next?",
};
