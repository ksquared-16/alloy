"use client";

import type { PersonPreferenceProfile } from "@/lib/communications/v2/familyWorkspace/types";
import {
    PREFERENCE_FIELD_DEFS,
    operatorStatusLabel,
    type PreferenceFieldKey,
} from "@/lib/communications/v2/communicationPreferenceLabels";

type Props = {
    profile: PersonPreferenceProfile;
    canEdit?: boolean;
    saving?: boolean;
    onChange?: (field: PreferenceFieldKey, status: "Allowed" | "Blocked") => void;
    compact?: boolean;
};

export default function CommunicationPreferencesEditor({ profile, canEdit = false, saving = false, onChange, compact = false }: Props) {
    return (
        <div data-cc-preferences-editor className={compact ? "space-y-1.5" : "space-y-2"}>
            <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
                {PREFERENCE_FIELD_DEFS.map(({ key, label }) => {
                    const status = operatorStatusLabel(profile[key]);
                    return (
                        <div key={key} className="rounded-md border border-alloy-stone/12 bg-white px-2 py-1.5">
                            <div className="text-[10px] text-alloy-midnight/45">{label}</div>
                            {canEdit && onChange && status === "Unknown" ? (
                                <div className="mt-1 flex flex-wrap gap-1">
                                    <button type="button" disabled={saving} onClick={() => onChange(key, "Allowed")} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-alloy-juniper ring-1 ring-alloy-juniper/50 hover:bg-alloy-juniper/10">Allow</button>
                                    <button type="button" disabled={saving} onClick={() => onChange(key, "Blocked")} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50">Block</button>
                                </div>
                            ) : canEdit && onChange ? (
                                <select
                                    aria-label={label}
                                    disabled={saving}
                                    value={status}
                                    onChange={(e) => onChange(key, e.target.value as "Allowed" | "Blocked")}
                                    className="mt-1 w-full rounded border border-alloy-stone/20 bg-white px-1 py-0.5 text-[11px] font-semibold text-alloy-midnight"
                                >
                                    <option value="Allowed">Allowed</option>
                                    <option value="Blocked">Blocked</option>
                                </select>
                            ) : (
                                <div className={`text-[11px] font-semibold ${status === "Allowed" ? "text-alloy-juniper" : status === "Blocked" ? "text-red-600" : "text-alloy-midnight/55"}`}>{status}</div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
