"use client";

import { useEffect, useState } from "react";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import { mergeLocationMetadataField } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import {
    ConfigurationDetailCard,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import ConfigurationAdvancedSection from "@/components/adminV2/settings/locations/ConfigurationAdvancedSection";

function metadataString(metadata: unknown, key: string): string {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return "";
    return String((metadata as Record<string, unknown>)[key] ?? "").trim();
}

export default function LocationSiteDetailPanel({
    site,
    capacitySummary,
    canMutate,
    onSave,
}: {
    site: LocationHierarchyRow | null;
    capacitySummary: number;
    canMutate: boolean;
    onSave: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
    const [label, setLabel] = useState("");
    const [address1, setAddress1] = useState("");
    const [city, setCity] = useState("");
    const [state, setState] = useState("");
    const [postalCode, setPostalCode] = useState("");
    const [phone, setPhone] = useState("");
    const [timezone, setTimezone] = useState("");
    const [active, setActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!site) return;
        setLabel((site.label ?? "").trim());
        setAddress1(site.address1?.trim() ?? "");
        setCity((site.city ?? "").trim());
        setState((site.state ?? "").trim());
        setPostalCode(site.postal_code?.trim() ?? "");
        setPhone(metadataString(site.metadata, "site_phone"));
        setTimezone(metadataString(site.metadata, "timezone"));
        setActive(site.is_active !== false);
        setError(null);
    }, [site]);

    if (!site) {
        return (
            <ConfigurationEmptyState
                testId="locations-site-workspace-empty"
                title="Select a location"
                description="Choose a campus or site to edit name, address, phone, and active status."
            />
        );
    }

    const title = label.trim() || "Untitled location";

    return (
        <ConfigurationDetailCard testId="locations-site-detail" title={title}>
            <div className="space-y-4">
                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Name</span>
                    <input
                        type="text"
                        value={label}
                        disabled={!canMutate}
                        onChange={(e) => setLabel(e.target.value)}
                        className="config-runtime-input"
                        data-testid="locations-site-name"
                    />
                </label>

                <div className="space-y-3">
                    <span className="config-typo-field-label">Address</span>
                    <input
                        type="text"
                        value={address1}
                        disabled={!canMutate}
                        onChange={(e) => setAddress1(e.target.value)}
                        placeholder="Street address"
                        className="config-runtime-input"
                        data-testid="locations-site-address1"
                    />
                    <div className="grid gap-2 sm:grid-cols-3">
                        <input
                            type="text"
                            value={city}
                            disabled={!canMutate}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="City"
                            className="config-runtime-input"
                        />
                        <input
                            type="text"
                            value={state}
                            disabled={!canMutate}
                            onChange={(e) => setState(e.target.value)}
                            placeholder="State"
                            className="config-runtime-input"
                        />
                        <input
                            type="text"
                            value={postalCode}
                            disabled={!canMutate}
                            onChange={(e) => setPostalCode(e.target.value)}
                            placeholder="Postal code"
                            className="config-runtime-input"
                        />
                    </div>
                </div>

                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Phone</span>
                    <input
                        type="text"
                        value={phone}
                        disabled={!canMutate}
                        onChange={(e) => setPhone(e.target.value)}
                        className="config-runtime-input"
                        data-testid="locations-site-phone"
                    />
                </label>

                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Timezone</span>
                    <input
                        type="text"
                        value={timezone}
                        disabled={!canMutate}
                        onChange={(e) => setTimezone(e.target.value)}
                        placeholder="e.g. America/Chicago"
                        className="config-runtime-input"
                        data-testid="locations-site-timezone"
                    />
                </label>

                <div>
                    <span className="config-typo-field-label">Capacity summary</span>
                    <p className="config-typo-sublabel mt-1">
                        {capacitySummary > 0 ?
                            `${capacitySummary} seats across active rooms`
                        :   "No room capacity configured yet"}
                    </p>
                </div>

                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={active}
                        disabled={!canMutate}
                        onChange={(e) => setActive(e.target.checked)}
                        className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                    />
                    <span className="config-typo-sublabel">Active</span>
                </label>

                {error ?
                    <p className="text-sm text-red-800" role="alert">
                        {error}
                    </p>
                :   null}

                {canMutate ?
                    <ConfigurationPrimaryButton
                        className="config-primary-btn--sm"
                        disabled={saving}
                        data-testid="locations-site-save"
                        onClick={() => {
                            void (async () => {
                                setSaving(true);
                                setError(null);
                                try {
                                    let metadata = mergeLocationMetadataField(site.metadata, "site_phone", phone.trim() || null);
                                    metadata = mergeLocationMetadataField(metadata, "timezone", timezone.trim() || null);
                                    await onSave(site.id, {
                                        label: label.trim() || null,
                                        address1: address1.trim() || null,
                                        city: city.trim() || null,
                                        state: state.trim() || null,
                                        postal_code: postalCode.trim() || null,
                                        is_active: active,
                                        metadata,
                                    });
                                } catch (e) {
                                    setError(e instanceof Error ? e.message : "Save failed");
                                } finally {
                                    setSaving(false);
                                }
                            })();
                        }}
                    >
                        {saving ? "Saving…" : "Save location"}
                    </ConfigurationPrimaryButton>
                :   null}

                <ConfigurationAdvancedSection testId="locations-site-advanced">
                    <div>
                        <span className="config-typo-field-label">Location ID</span>
                        <p className="config-typo-meta mt-1 font-mono text-[11px]">{site.id}</p>
                    </div>
                    <div>
                        <span className="config-typo-field-label">Location type</span>
                        <p className="config-typo-meta mt-1">{site.location_type ?? "site"}</p>
                    </div>
                </ConfigurationAdvancedSection>
            </div>
        </ConfigurationDetailCard>
    );
}
