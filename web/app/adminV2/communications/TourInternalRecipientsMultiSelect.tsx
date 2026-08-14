"use client";

import { useEffect, useMemo, useState } from "react";

import {
    COMMS_FIELD_LABEL_CLASS,
    COMMS_SELECT_CLASS,
} from "@/app/adminV2/communications/commsWorkspaceUi";
import { fetchOperationalWorkOrgUsers, type OperationalWorkOrgUserOption } from "@/components/admin/opportunity/OperationalWorkAssigneeSelect";

type Props = {
    id: string;
    selectedUserIds: string[];
    disabled?: boolean;
    onChange: (userIds: string[]) => void;
};

export default function TourInternalRecipientsMultiSelect({
    id,
    selectedUserIds,
    disabled = false,
    onChange,
}: Props) {
    const [options, setOptions] = useState<OperationalWorkOrgUserOption[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void fetchOperationalWorkOrgUsers()
            .then((rows) => {
                if (!cancelled) setOptions(rows);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const selected = useMemo(
        () => selectedUserIds.filter((id, i, arr) => id.trim() && arr.indexOf(id) === i),
        [selectedUserIds],
    );

    const optionNodes = useMemo(
        () =>
            options.map((row) => ({
                id: row.user_id,
                label: row.email?.trim() || row.label,
            })),
        [options],
    );

    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={id} className={COMMS_FIELD_LABEL_CLASS}>
                Internal recipients
            </label>
            {loading ? (
                <span className="text-[10px] text-alloy-midnight/45">Loading staff…</span>
            ) : optionNodes.length === 0 ? (
                <span className="text-[10px] text-alloy-midnight/45">No staff users available.</span>
            ) : (
                <select
                    id={id}
                    multiple
                    data-tour-internal-recipients="true"
                    value={selected}
                    disabled={disabled}
                    onChange={(e) => {
                        const next = Array.from(e.target.selectedOptions).map((o) => o.value);
                        onChange(next);
                    }}
                    className={`${COMMS_SELECT_CLASS} min-h-[4.5rem]`}
                    size={Math.min(Math.max(optionNodes.length, 3), 5)}
                >
                    {optionNodes.map((o) => (
                        <option key={o.id} value={o.id}>
                            {o.label}
                        </option>
                    ))}
                </select>
            )}
            {selected.length > 0 ? (
                <span className="text-[9px] text-alloy-midnight/45">
                    {selected.length} selected · Cmd/Ctrl+click to multi-select
                </span>
            ) : (
                <span className="text-[9px] text-alloy-midnight/45">Optional — leave empty for no internal notifications.</span>
            )}
        </div>
    );
}
