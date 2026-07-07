"use client";

/**
 * Contact drill-in preview — the same edit surface operators see when editing a contact.
 */

import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { resolveContactEditFieldPolicy } from "@/lib/adminV2/runtime/focusPanel/household/householdContactFieldPolicy";

type Props = {
    config: NestedSurfaceConfig;
    selectedGroupKey?: string | null;
    onSelectGroup?: (groupKey: string) => void;
};

const PREVIEW_VALUES: Record<string, string> = {
    "person.first_name": "Jordan",
    "person.last_name": "Johnson",
    "person.phone": "(541) 555-0100",
    "person.email": "jordan@example.com",
    "person.date_of_birth": "Mar 15, 1988",
    "person.address": "123 Oak St, Portland OR",
};

export default function HouseholdContactEditPreview({ config, selectedGroupKey, onSelectGroup }: Props) {
    const rows = resolveContactEditFieldPolicy(config);

    return (
        <div
            className="process-config-setup-card space-y-3 p-4"
            data-household-contact-edit-preview="true"
            onClick={() => onSelectGroup?.("contact_fields")}
        >
            <div className="border-b border-alloy-stone/10 pb-2">
                <h3 className="text-sm font-semibold text-alloy-midnight">Edit Contact</h3>
                <p className="text-xs text-alloy-midnight/50">Jordan Johnson · Primary</p>
            </div>
            <div
                className="space-y-3"
                data-nested-group="contact_fields"
                data-nested-group-selected={selectedGroupKey === "contact_fields" ? "true" : undefined}
            >
                {rows.map((row) => {
                    if (!row.displayed) return null;
                    const editable = row.editable;
                    return (
                        <label key={row.configKey} className="block space-y-1">
                            <span className="text-[11px] font-medium text-alloy-midnight/55">
                                {row.label}
                                {!editable ?
                                    <span className="ml-1 text-alloy-midnight/35">(read-only)</span>
                                :   null}
                            </span>
                            <div
                                className={[
                                    "rounded-lg border px-3 py-2 text-sm",
                                    editable
                                        ? "border-alloy-stone/20 bg-white text-alloy-midnight/80"
                                        : "border-alloy-stone/10 bg-alloy-stone/5 text-alloy-midnight/45",
                                ].join(" ")}
                                data-contact-field={row.configKey}
                                data-contact-field-editable={editable ? "true" : "false"}
                            >
                                {PREVIEW_VALUES[row.configKey] ?? "—"}
                            </div>
                        </label>
                    );
                })}
            </div>
            <div className="flex gap-2 border-t border-alloy-stone/10 pt-3">
                <span className="rounded-lg border border-alloy-stone/20 px-3 py-1.5 text-xs text-alloy-midnight/45">Cancel</span>
                <span className="rounded-lg bg-alloy-pine/90 px-3 py-1.5 text-xs font-medium text-white">Save</span>
            </div>
        </div>
    );
}
