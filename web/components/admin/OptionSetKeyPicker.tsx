"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type OptionSetSummary = { set_key: string; label: string };

type OptionSetKeyPickerProps = {
    value: string;
    onChange: (setKey: string) => void;
    disabled?: boolean;
    id?: string;
    /** Admin surface for managing option sets (e.g. Settings vs legacy System). */
    manageOptionSetsHref?: string;
};

/** Loads org option sets for field_definitions.config.option_set_key. */
export default function OptionSetKeyPicker({
    value,
    onChange,
    disabled,
    id,
    manageOptionSetsHref = "/admin/system/option-sets",
}: OptionSetKeyPickerProps) {
    const [sets, setSets] = useState<OptionSetSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/option-sets");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSets([]);
                return;
            }
            const raw = (json as { option_sets?: { set_key: string; label: string }[] }).option_sets ?? [];
            setSets(
                raw.map((r) => ({
                    set_key: String(r.set_key),
                    label: String(r.label),
                }))
            );
        } catch {
            setSets([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
                <select
                    id={id}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled || loading}
                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:opacity-60"
                >
                    <option value="">{loading ? "Loading…" : "— None (use catalog or inline options) —"}</option>
                    {sets.map((s) => (
                        <option key={s.set_key} value={s.set_key}>
                            {s.label} ({s.set_key})
                        </option>
                    ))}
                </select>
            </div>
            <p className="text-xs text-[#59678b]">
                Manage lists in{" "}
                <Link href={manageOptionSetsHref} className="text-alloy-pine hover:underline font-medium">
                    Option sets
                </Link>
                . Select/multiselect fields need option_set_key, catalog_key, or inline options.
            </p>
        </div>
    );
}
