"use client";

import { useState } from "react";

type Props = {
    jobId: string;
    disabled?: boolean;
    onCreated: () => void;
};

export function JobManualChargeForm({ jobId, disabled, onCreated }: Props) {
    const [amountDollars, setAmountDollars] = useState("");
    const [chargeType, setChargeType] = useState<"adjustment" | "fee">("adjustment");
    const [description, setDescription] = useState("");
    const [serviceDate, setServiceDate] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const submit = async () => {
        setError(null);
        setSuccess(null);
        const t = amountDollars.trim();
        if (!t) {
            setError("Enter an amount.");
            return;
        }
        const n = Number.parseFloat(t);
        if (!Number.isFinite(n) || n === 0) {
            setError("Amount must be a non-zero number (negative allowed for credits).");
            return;
        }
        const amountCents = Math.round(n * 100);
        if (amountCents === 0) {
            setError("Amount rounds to zero.");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/jobs/${jobId}/charges`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    charge_type: chargeType,
                    amount_cents: amountCents,
                    description: description.trim() || null,
                    service_date: serviceDate.trim() || null,
                    due_date: dueDate.trim() || null,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
            if (!res.ok) {
                setError(json.error ?? `Failed (${res.status})`);
                return;
            }
            setSuccess("Charge added.");
            setAmountDollars("");
            setDescription("");
            setServiceDate("");
            setDueDate("");
            window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "jobs", id: jobId } }));
            window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "payments", id: "*" } }));
            onCreated();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-md border border-alloy-stone/30 bg-white px-3 py-3 space-y-3 mb-4">
            <div>
                <h4 className="text-sm font-semibold text-alloy-midnight">Add manual charge</h4>
                <p className="text-[11px] text-alloy-midnight/55 mt-1 leading-snug max-w-xl">
                    Creates a posted receivable row on this job (adjustment or fee). Negative amounts are allowed for credit-style
                    adjustments. Does not run Stripe — use Add payment to collect.
                </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                    <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Amount (USD)</label>
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 25.00 or -10.00"
                        value={amountDollars}
                        onChange={(e) => setAmountDollars(e.target.value)}
                        disabled={disabled || saving}
                        className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Type</label>
                    <select
                        value={chargeType}
                        onChange={(e) => setChargeType(e.target.value as "adjustment" | "fee")}
                        disabled={disabled || saving}
                        className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                    >
                        <option value="adjustment">Adjustment (pricing / credit)</option>
                        <option value="fee">Fee (add-on)</option>
                    </select>
                </div>
                <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Description (optional)</label>
                    <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={disabled || saving}
                        className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                        placeholder="e.g. Extra materials, price correction"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Service date (optional)</label>
                    <input
                        type="date"
                        value={serviceDate}
                        onChange={(e) => setServiceDate(e.target.value)}
                        disabled={disabled || saving}
                        className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Due date (optional)</label>
                    <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        disabled={disabled || saving}
                        className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                    />
                </div>
            </div>
            {error ? <p className="text-sm text-alloy-ember">{error}</p> : null}
            {success ? <p className="text-sm text-alloy-juniper">{success}</p> : null}
            <button
                type="button"
                onClick={() => void submit()}
                disabled={disabled || saving}
                className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90 disabled:opacity-50"
            >
                {saving ? "Saving…" : "Create charge"}
            </button>
        </div>
    );
}
