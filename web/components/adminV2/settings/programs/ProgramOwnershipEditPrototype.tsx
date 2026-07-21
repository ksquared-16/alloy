"use client";

import { useMemo, useState } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigEditorSection,
    ConfigObjectHeader,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigOwnershipSourceBadge } from "@/components/adminV2/settings/configurationRuntime/workspace/ConfigOwnershipSourceBadge";
import {
    clearPrototypeLocalConfiguration,
    markPrototypeLocalConfiguration,
    PROGRAM_LOCATION_STATUS_LABEL,
    recordPrototypeOrganizationDefinitionEdit,
} from "@/lib/configRuntime/programLocationAvailabilityPrototypeModel";

type EditSurface = "choose" | "organization" | "location" | "org_saved" | "location_saved";

/**
 * Stage 1 ownership edit prototype — separate Org vs Location actions (no save-time scope quiz).
 */
export function ProgramOwnershipEditPrototype({
    programId,
    programLabel,
    locationId,
    locationLabel,
    hasLocalDescription,
    organizationDescription,
    onClose,
}: {
    programId: string;
    programLabel: string;
    locationId: string;
    locationLabel: string;
    hasLocalDescription: boolean;
    organizationDescription: string;
    onClose: () => void;
}) {
    const [surface, setSurface] = useState<EditSurface>("choose");
    const [orgDescription, setOrgDescription] = useState(organizationDescription);
    const [localDescription, setLocalDescription] = useState(
        hasLocalDescription ? "Local campus note (prototype)" : "",
    );
    const [offered, setOffered] = useState(true);
    const [orgImpact, setOrgImpact] = useState<{
        inheritingCount: number;
        locallyConfiguredCount: number;
    } | null>(null);

    const ownership = useMemo(() => {
        if (!offered) return "not_assigned" as const;
        if (localDescription.trim()) return "location_override" as const;
        return "inherited" as const;
    }, [offered, localDescription]);

    return (
        <div className="space-y-3" data-testid="program-ownership-edit-prototype">
            <ConfigObjectHeader
                size="hero"
                name={programLabel}
                status={{
                    label:
                        surface === "choose" ? "Choose edit surface"
                        : surface.startsWith("org") ? "Organization definition"
                        : "Location configuration",
                    tone: "attention",
                }}
                facts={[
                    PROGRAM_LOCATION_STATUS_LABEL.organizationDefinition,
                    locationLabel ? `Context · ${locationLabel}` : "",
                    "Prototype — no production mutation",
                ].filter(Boolean)}
                actions={
                    <ConfigurationSecondaryButton onClick={onClose} data-testid="ownership-edit-close">
                        Close
                    </ConfigurationSecondaryButton>
                }
                testId="ownership-edit-header"
            />

            {surface === "choose" ?
                <ConfigEditorSection
                    title="What do you want to edit?"
                    description="Ownership is chosen before editing — not at save time."
                    testId="ownership-edit-choose"
                >
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton
                            onClick={() => setSurface("organization")}
                            data-testid="ownership-edit-org"
                        >
                            Edit Organization definition
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton
                            onClick={() => setSurface("location")}
                            data-testid="ownership-edit-location"
                        >
                            Edit {locationLabel || "Location"} configuration
                        </ConfigurationSecondaryButton>
                    </div>
                </ConfigEditorSection>
            :   null}

            {surface === "organization" ?
                <div className="space-y-3" data-testid="ownership-edit-org-form">
                    <ConfigEditorSection
                        title="Edit Organization definition"
                        description="Only Organization-owned fields. Location offering and local description are not edited here."
                        testId="ownership-edit-org-fields"
                    >
                        <label className="block space-y-1">
                            <span className="config-typo-field-label">Name · Organization (locked identity key elsewhere)</span>
                            <input
                                type="text"
                                value={programLabel}
                                disabled
                                className="config-runtime-input"
                            />
                        </label>
                        <label className="mt-2 block space-y-1">
                            <span className="config-typo-field-label">Description · Organization</span>
                            <textarea
                                value={orgDescription}
                                onChange={(event) => setOrgDescription(event.target.value)}
                                className="config-runtime-input min-h-24"
                                data-testid="ownership-edit-org-description"
                            />
                        </label>
                        <div
                            className="mt-3 rounded-lg border border-alloy-forge/10 bg-white px-3 py-2 text-[11px] text-alloy-midnight/70"
                            data-testid="ownership-edit-org-impact"
                        >
                            <p className="font-semibold text-alloy-midnight">Impact before save</p>
                            <p className="mt-1">
                                This change affects 32 Locations inheriting the Organization definition.
                            </p>
                            <p className="mt-0.5">
                                3 Locations have local configuration and will remain unchanged.
                            </p>
                        </div>
                    </ConfigEditorSection>
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton
                            onClick={() => {
                                setOrgImpact(recordPrototypeOrganizationDefinitionEdit());
                                setSurface("org_saved");
                            }}
                            data-testid="ownership-edit-org-save"
                        >
                            Save Organization definition
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton onClick={() => setSurface("choose")}>
                            Back
                        </ConfigurationSecondaryButton>
                    </div>
                </div>
            :   null}

            {surface === "org_saved" && orgImpact ?
                <ConfigEditorSection
                    title="Organization definition updated (prototype)"
                    description={`${orgImpact.inheritingCount} Locations inherit this definition. ${orgImpact.locallyConfiguredCount} locally configured Locations unchanged.`}
                    testId="ownership-edit-org-saved"
                >
                    <ConfigurationPrimaryButton onClick={onClose}>Done</ConfigurationPrimaryButton>
                </ConfigEditorSection>
            :   null}

            {surface === "location" ?
                <div className="space-y-3" data-testid="ownership-edit-location-form">
                    <ConfigEditorSection
                        title={`Edit ${locationLabel} configuration`}
                        description="Only Location-owned or overrideable fields. Program identity stays Organization-locked."
                        testId="ownership-edit-location-fields"
                    >
                        <div className="mb-2">
                            <ConfigOwnershipSourceBadge
                                source={ownership}
                                locationLabel={locationLabel}
                                testId="ownership-edit-location-badge"
                            />
                        </div>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={offered}
                                onChange={(event) => setOffered(event.target.checked)}
                                className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                                data-testid="ownership-edit-offered"
                            />
                            <span className="text-sm text-alloy-midnight">
                                {PROGRAM_LOCATION_STATUS_LABEL.availableAtLocation}
                            </span>
                        </label>
                        <label className="mt-2 block space-y-1">
                            <span className="config-typo-field-label">Local description · may override</span>
                            <textarea
                                value={localDescription}
                                onChange={(event) => setLocalDescription(event.target.value)}
                                className="config-runtime-input min-h-20"
                                placeholder="Uses the Organization description"
                                data-testid="ownership-edit-local-description"
                            />
                        </label>
                        <p className="config-typo-sublabel mt-1">
                            Inherited source: Organization description
                            {organizationDescription ? ` — “${organizationDescription.slice(0, 80)}${organizationDescription.length > 80 ? "…" : ""}”` : ""}
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            Cannot locally override: name, category, eligibility, audience, resource type.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {localDescription.trim() ?
                                <ConfigurationSecondaryButton
                                    onClick={() => {
                                        setLocalDescription("");
                                        clearPrototypeLocalConfiguration(programId, locationId);
                                    }}
                                    data-testid="ownership-edit-restore"
                                >
                                    {PROGRAM_LOCATION_STATUS_LABEL.restoreOrganizationDefault}
                                </ConfigurationSecondaryButton>
                            :   null}
                        </div>
                    </ConfigEditorSection>
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton
                            onClick={() => {
                                if (localDescription.trim()) {
                                    markPrototypeLocalConfiguration(programId, locationId);
                                } else {
                                    clearPrototypeLocalConfiguration(programId, locationId);
                                }
                                setSurface("location_saved");
                            }}
                            data-testid="ownership-edit-location-save"
                        >
                            Save {locationLabel} configuration
                        </ConfigurationPrimaryButton>
                        <ConfigurationSecondaryButton onClick={() => setSurface("choose")}>
                            Back
                        </ConfigurationSecondaryButton>
                    </div>
                </div>
            :   null}

            {surface === "location_saved" ?
                <ConfigEditorSection
                    title={`${locationLabel} configuration updated (prototype)`}
                    description={
                        localDescription.trim()
                            ? PROGRAM_LOCATION_STATUS_LABEL.locallyConfigured
                            : PROGRAM_LOCATION_STATUS_LABEL.inheritsOrganization
                    }
                    testId="ownership-edit-location-saved"
                >
                    <ConfigurationPrimaryButton onClick={onClose}>Done</ConfigurationPrimaryButton>
                </ConfigEditorSection>
            :   null}
        </div>
    );
}
