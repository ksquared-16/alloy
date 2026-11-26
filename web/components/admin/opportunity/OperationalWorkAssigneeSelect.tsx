"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * W14-F1 (disclosure half): this picker names colleagues; it does not disclose their addresses.
 *
 * It previously fetched the full roster — every member's address — and rendered the raw address as
 * the option text, so any staffer who could assign work could read the organisation's entire email
 * list out of a dropdown. The label is now computed by the route, which withholds the address from
 * callers without `settings.users_roles`. `email` is deliberately absent from this option type: a
 * field this component does not need is a field it should not carry.
 */
export type OperationalWorkOrgUserOption = {
    user_id: string;
    label: string;
};

type AdminUsersResponse = {
    users?: Array<{ user_id: string; label?: string | null; email?: string | null }>;
};

export async function fetchOperationalWorkOrgUsers(): Promise<OperationalWorkOrgUserOption[]> {
    const res = await fetch("/api/admin/users", { credentials: "include" });
    const json = (await res.json().catch(() => ({}))) as AdminUsersResponse;
    if (!res.ok || !Array.isArray(json.users)) return [];
    return json.users
        .map((u) => ({
            user_id: u.user_id,
            label: u.label?.trim() || u.user_id.slice(0, 8),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

export type OperationalWorkAssigneeSelectProps = {
    id: string;
    value: string | null;
    currentUserId?: string | null;
    disabled?: boolean;
    onChange: (userId: string | null) => void;
};

export default function OperationalWorkAssigneeSelect({
    id,
    value,
    currentUserId = null,
    disabled = false,
    onChange,
}: OperationalWorkAssigneeSelectProps) {
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

    const selectValue = value?.trim() || "";

    const optionNodes = useMemo(() => {
        const nodes: { value: string; label: string }[] = [{ value: "", label: "Unassigned" }];
        const me = currentUserId?.trim();
        if (me) {
            const meRow = options.find((o) => o.user_id === me);
            nodes.push({ value: me, label: meRow ? `Mine (${meRow.label})` : "Mine" });
        }
        for (const row of options) {
            if (me && row.user_id === me) continue;
            nodes.push({
                value: row.user_id,
                label: row.label,
            });
        }
        return nodes;
    }, [currentUserId, options]);

    return (
        <select
            id={id}
            value={selectValue}
            disabled={disabled || loading}
            onChange={(e) => onChange(e.target.value.trim() || null)}
            className="w-full rounded-lg border border-alloy-stone/25 bg-white px-2.5 py-2 text-[13px]"
            data-operational-work-assignee-select="true"
        >
            {optionNodes.map((opt) => (
                <option key={opt.value || "__unassigned"} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}
