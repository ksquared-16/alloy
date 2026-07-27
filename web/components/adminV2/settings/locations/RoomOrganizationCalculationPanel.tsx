"use client";

import { useEffect, useState } from "react";

type RuntimeEval = {
    calculation: { id: string; name: string; key: string };
    version: { id: string; version_number: number };
    evaluation: { status: string; value: number | null };
    explanationLines: string[];
    effectiveAt: string;
};

/**
 * Room capacity consumer for exact-version Organization Calculations bound with
 * runtime_surface. Additive — does not replace platform capacity.
 */
export default function RoomOrganizationCalculationPanel({
    roomId,
    siteId,
}: {
    roomId: string;
    siteId?: string | null;
}) {
    const [results, setResults] = useState<RuntimeEval[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [effectiveAt, setEffectiveAt] = useState(() => new Date().toISOString().slice(0, 10));

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ roomId, effectiveAt });
        if (siteId) qs.set("siteId", siteId);

        void (async () => {
            try {
                const res = await fetch(`/api/admin/organization-calculations/runtime?${qs.toString()}`);
                const json = (await res.json()) as { results?: RuntimeEval[]; error?: string };
                if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
                if (!cancelled) setResults(json.results ?? []);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [roomId, siteId, effectiveAt]);

    if (loading) {
        return (
            <p className="config-typo-sublabel" data-testid="room-org-calc-loading">
                Loading organization calculations…
            </p>
        );
    }

    if (error) {
        return (
            <p className="text-sm text-red-800" role="alert" data-testid="room-org-calc-error">
                {error}
            </p>
        );
    }

    if (results.length === 0) {
        return null;
    }

    return (
        <div
            className="space-y-2 rounded-md border border-alloy-stone/30 bg-white/50 p-3"
            data-testid="room-org-calc-panel"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="config-typo-field-label">Organization-calculated capacity</p>
                <label className="flex items-center gap-1 text-[11px] text-alloy-midnight/55">
                    As of
                    <input
                        type="date"
                        className="config-runtime-input py-0.5 text-[11px]"
                        value={effectiveAt}
                        onChange={(e) => setEffectiveAt(e.target.value)}
                        data-testid="room-org-calc-effective-at"
                    />
                </label>
            </div>
            <p className="text-[11px] text-alloy-midnight/50">
                Separate from platform room capacity · exact published version binding
            </p>
            {results.map((row) => (
                <div key={row.calculation.id} className="space-y-1" data-testid={`room-org-calc-${row.calculation.id}`}>
                    <p className="text-sm text-alloy-midnight">
                        <span className="font-medium">{row.calculation.name}</span>
                        {": "}
                        {row.evaluation.value ?? "∅"} seats
                        <span className="ml-1 text-xs text-alloy-midnight/50">
                            (org calc v{row.version.version_number} · {row.evaluation.status})
                        </span>
                    </p>
                    {row.explanationLines.length > 0 ?
                        <ul className="list-disc pl-4 text-xs text-alloy-midnight/65" data-testid="room-org-calc-explanation">
                            {row.explanationLines.slice(-4).map((line) => (
                                <li key={line}>{line}</li>
                            ))}
                        </ul>
                    :   null}
                </div>
            ))}
        </div>
    );
}
