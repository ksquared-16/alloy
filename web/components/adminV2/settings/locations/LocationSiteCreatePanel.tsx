"use client";

import { useState } from "react";
import {
    ConfigurationDetailCard,
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

export type LocationSiteCreateInput = {
    label: string;
    address1: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string;
    timezone: string;
    is_active: boolean;
};

export default function LocationSiteCreatePanel({
    canMutate,
    onCreate,
    onCancel,
}: {
    canMutate: boolean;
    onCreate: (input: LocationSiteCreateInput) => Promise<string>;
    onCancel: () => void;
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

    return (
        <ConfigurationDetailCard testId="locations-site-create" title="Add location">
            <div className="space-y-4">
                <p className="config-typo-sublabel">
                    Create a campus or site in Configuration. Rooms and programs are configured after the site is saved.
                </p>

                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Name</span>
                    <input
                        type="text"
                        value={label}
                        disabled={!canMutate || saving}
                        onChange={(e) => setLabel(e.target.value)}
                        className="config-runtime-input"
                        data-testid="locations-site-create-name"
                        autoFocus
                    />
                </label>

                <div className="space-y-3">
                    <span className="config-typo-field-label">Address</span>
                    <input
                        type="text"
                        value={address1}
                        disabled={!canMutate || saving}
                        onChange={(e) => setAddress1(e.target.value)}
                        placeholder="Street address"
                        className="config-runtime-input"
                        data-testid="locations-site-create-address1"
                    />
                    <div className="grid gap-2 sm:grid-cols-3">
                        <input
                            type="text"
                            value={city}
                            disabled={!canMutate || saving}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="City"
                            className="config-runtime-input"
                        />
                        <input
                            type="text"
                            value={state}
                            disabled={!canMutate || saving}
                            onChange={(e) => setState(e.target.value)}
                            placeholder="State"
                            className="config-runtime-input"
                        />
                        <input
                            type="text"
                            value={postalCode}
                            disabled={!canMutate || saving}
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
                        disabled={!canMutate || saving}
                        onChange={(e) => setPhone(e.target.value)}
                        className="config-runtime-input"
                        data-testid="locations-site-create-phone"
                    />
                </label>

                <label className="block space-y-1.5">
                    <span className="config-typo-field-label">Timezone</span>
                    <input
                        type="text"
                        value={timezone}
                        disabled={!canMutate || saving}
                        onChange={(e) => setTimezone(e.target.value)}
                        placeholder="e.g. America/Chicago"
                        className="config-runtime-input"
                        data-testid="locations-site-create-timezone"
                    />
                </label>

                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={active}
                        disabled={!canMutate || saving}
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
                    <div className="flex flex-wrap gap-2">
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            disabled={saving || !label.trim()}
                            data-testid="locations-site-create-submit"
                            onClick={() => {
                                void (async () => {
                                    setSaving(true);
                                    setError(null);
                                    try {
                                        await onCreate({
                                            label: label.trim(),
                                            address1: address1.trim(),
                                            city: city.trim(),
                                            state: state.trim(),
                                            postal_code: postalCode.trim(),
                                            phone: phone.trim(),
                                            timezone: timezone.trim(),
                                            is_active: active,
                                        });
                                    } catch (e) {
                                        setError(e instanceof Error ? e.message : "Create failed");
                                    } finally {
                                        setSaving(false);
                                    }
                                })();
                            }}
                        >
                            {saving ? "Creating..." : "Create location"}
                        </ConfigurationPrimaryButton>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={onCancel}
                            className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10 disabled:opacity-50"
                            data-testid="locations-site-create-cancel"
                        >
                            Cancel
                        </button>
                    </div>
                :   null}
            </div>
        </ConfigurationDetailCard>
    );
}
