"use client";

import {
    ConfigurationCommandRailActions,
    type ConfigurationRailAction,
    type ConfigurationRailActionGroup,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationCommandRailActions";

export type LocationsRailActionGroup = ConfigurationRailActionGroup;
export type LocationsRailAction = ConfigurationRailAction;

/**
 * Locations adapter for the platform-owned Configuration command rail.
 * Keeps the frozen Location action model while sharing Fix now → Do next →
 * Manage → More actions and actionsPlacementSurface="company" behavior.
 */
export function LocationsCommandRailActions({ actions }: { actions: LocationsRailAction[] }) {
    return (
        <ConfigurationCommandRailActions
            actions={actions}
            testIdPrefix="locations-rail"
            bodyTestId="locations-command-rail-actions"
        />
    );
}
