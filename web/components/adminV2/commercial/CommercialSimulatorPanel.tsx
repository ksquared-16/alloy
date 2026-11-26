"use client";

import { useEffect, useState } from "react";
import type { CommercialExecutionPreview } from "@/lib/commercial/execution/preview/buildPreview";
import type { Money, ResolvedCommercialLine } from "@/lib/commercial/execution/executionTypes";

/**
 * Commercial Simulator — operator-facing pricing validation. Runs the Commercial
 * Execution preview (read-only; creates no financial truth) and answers
 * "what will this customer pay?" in Commercial terms. NO Billing objects, no draft
 * charges, no obligations, no database terminology.
 */

type ProgramLite = { key: string; label: string };
type CadenceLite = { item_key: string; label: string };
type OfferingLite = { id: string; label: string };
type VariantLite = { id: string; label: string };

const KIND_LABELS: Record<string, string> = {
    tuition: "Tuition", fee: "Fee", addon: "Add-on", deposit: "Deposit",
    proration: "Proration", proration_credit: "Proration credit", discount: "Discount", credit: "Credit",
};
const RECOGNITION_LABELS: Record<string, string> = { immediate: "When paid", deferred: "Over the period", liability: "Held (deposit)" };
const PAYERS = [{ v: "private_pay", l: "Private pay" }, { v: "subsidy", l: "Subsidy" }, { v: "corporate", l: "Corporate" }];

const inputCls = "mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1.5 text-sm text-alloy-midnight focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/20";
const labelCls = "text-xs font-medium text-alloy-midnight/70";

function money(m: Money | undefined): string {
    if (!m) return "—";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: m.currency || "USD" }).format(m.amountCents / 100);
}

function todayYmd(): string {
    // Server-safe default; the operator can change it.
    return new Date().toISOString().slice(0, 10);
}

export default function CommercialSimulatorPanel({
    programs,
    cadences,
    focusProgramKey,
    embedded = false,
}: {
    programs: ProgramLite[];
    cadences: CadenceLite[];
    focusProgramKey?: string;
    embedded?: boolean;
}) {
    const [programKey, setProgramKey] = useState(focusProgramKey ?? "");
    const [offerings, setOfferings] = useState<OfferingLite[]>([]);
    const [variants, setVariants] = useState<VariantLite[]>([]);
    const [offeringId, setOfferingId] = useState("");
    const [variantId, setVariantId] = useState("");
    const [cadenceKey, setCadenceKey] = useState("monthly");
    const [payer, setPayer] = useState("private_pay");
    const [asOf, setAsOf] = useState(todayYmd());
    const [running, setRunning] = useState(false);
    const [preview, setPreview] = useState<CommercialExecutionPreview | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (focusProgramKey) setProgramKey(focusProgramKey);
    }, [focusProgramKey]);

    useEffect(() => {
        if (!programKey) { setOfferings([]); setOfferingId(""); return; }
        void fetch(`/api/admin/programs/offerings?program_key=${encodeURIComponent(programKey)}`)
            .then((r) => r.json() as Promise<{ offerings?: OfferingLite[] }>)
            .then((j) => setOfferings(j.offerings ?? []))
            .catch(() => setOfferings([]));
    }, [programKey]);

    useEffect(() => {
        if (!offeringId) { setVariants([]); setVariantId(""); return; }
        void fetch(`/api/admin/programs/offerings/${offeringId}/variants`)
            .then((r) => r.json() as Promise<{ variants?: VariantLite[] }>)
            .then((j) => setVariants(j.variants ?? []))
            .catch(() => setVariants([]));
    }, [offeringId]);

    async function run() {
        setRunning(true); setError(null);
        try {
            const horizonEnd = (() => { const d = new Date(asOf); d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10); })();
            const res = await fetch("/api/admin/commercial/execution/preview", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    program_key: programKey, offering_id: offeringId || undefined, variant_id: variantId || undefined,
                    cadence_key: cadenceKey, payer_intent: payer, as_of: asOf, period_start: asOf, mode: "hypothetical",
                    subject_type: "prospect", horizon: { start: asOf, end: horizonEnd },
                }),
            });
            const json = (await res.json()) as CommercialExecutionPreview & { error?: string };
            if (!res.ok) { setError(json.error ?? "Preview failed"); setPreview(null); return; }
            setPreview(json);
        } catch (e) { setError(String(e)); }
        finally { setRunning(false); }
    }

    const canRun = programKey && variantId && asOf;

    return (
        <div
            className="flex min-h-0 flex-1 overflow-auto"
            data-testid={embedded ? "program-pricing-preview" : "commercial-simulator-panel"}
        >
            {/* Inputs */}
            <div className="w-80 shrink-0 border-r border-alloy-stone/20 bg-white/70 p-5 overflow-auto">
                <h2 className="text-base font-semibold text-alloy-midnight">Simulator</h2>
                <p className="mt-0.5 text-sm text-alloy-midnight/55">See exactly what a family will pay, using your current configuration.</p>

                <div className="mt-4 space-y-3">
                    {focusProgramKey ?
                        <div>
                            <label className={labelCls}>Program</label>
                            <p className="mt-1 text-sm font-semibold text-alloy-midnight">
                                {programs.find((program) => program.key === focusProgramKey)?.label ?? "Selected Program"}
                            </p>
                        </div>
                    :   <div><label className={labelCls}>Program</label>
                            <select value={programKey} onChange={(e) => setProgramKey(e.target.value)} className={inputCls}>
                                <option value="">Select a program…</option>
                                {programs.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                            </select>
                        </div>
                    }
                    <div><label className={labelCls}>Offering</label>
                        <select data-testid="commercial-simulator-offering" value={offeringId} onChange={(e) => setOfferingId(e.target.value)} disabled={!programKey} className={inputCls}>
                            <option value="">{programKey ? "Select an offering…" : "Select a program first"}</option>
                            {offerings.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                    </div>
                    <div><label className={labelCls}>Schedule</label>
                        <select data-testid="commercial-simulator-variant" value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={!offeringId} className={inputCls}>
                            <option value="">{offeringId ? "Select a schedule…" : "Select an offering first"}</option>
                            {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                    </div>
                    <div><label className={labelCls}>Billing frequency</label>
                        <select value={cadenceKey} onChange={(e) => setCadenceKey(e.target.value)} className={inputCls}>
                            {cadences.length === 0 && <option value="monthly">Monthly</option>}
                            {cadences.map((c) => <option key={c.item_key} value={c.item_key}>{c.label}</option>)}
                        </select>
                    </div>
                    <div><label className={labelCls}>Payer</label>
                        <select value={payer} onChange={(e) => setPayer(e.target.value)} className={inputCls}>
                            {PAYERS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                        </select>
                    </div>
                    <div><label className={labelCls}>Starting</label>
                        <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputCls} />
                    </div>
                    <button type="button" onClick={run} disabled={!canRun || running} className="mt-1 w-full rounded-md bg-alloy-bend-pine px-3 py-2 text-sm font-medium text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50">
                        {running ? "Calculating…" : "Preview pricing"}
                    </button>
                    {!canRun && <p className="text-[11px] text-alloy-midnight/40">Pick a program, offering, and schedule to preview.</p>}
                </div>
            </div>

            {/* Results */}
            <div className="min-w-0 flex-1 overflow-auto p-6">
                {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
                {!preview && !error && (
                    <div className="flex h-full items-center justify-center">
                        <p className="max-w-sm text-center text-sm text-alloy-midnight/40">Choose a program and schedule, then preview to see what the family pays — and any warnings about your configuration.</p>
                    </div>
                )}
                {preview && <PreviewResult preview={preview} />}
            </div>
        </div>
    );
}

function PreviewResult({ preview }: { preview: CommercialExecutionPreview }) {
    const lines = preview.resolution.lines;
    const resolvedLines = lines.filter((l) => l.status === "resolved");
    const recurring = resolvedLines.filter((l) => l.cadence);
    const oneTime = resolvedLines.filter((l) => !l.cadence);
    const monthlyTotal = recurring.reduce((s, l) => s + l.net.amountCents, 0);
    const oneTimeTotal = oneTime.reduce((s, l) => s + l.net.amountCents, 0);
    const currency = resolvedLines[0]?.net.currency ?? "USD";

    return (
        <div className="max-w-2xl space-y-5">
            {/* Headline totals */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-3">
                    <p className="text-xs text-alloy-midnight/50">Due at start (one-time)</p>
                    <p className="mt-0.5 text-xl font-semibold text-alloy-midnight">{money({ amountCents: oneTimeTotal, currency })}</p>
                </div>
                <div className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-3">
                    <p className="text-xs text-alloy-midnight/50">Then recurring</p>
                    <p className="mt-0.5 text-xl font-semibold text-alloy-midnight">{money({ amountCents: monthlyTotal, currency })}</p>
                </div>
            </div>

            {/* Warnings */}
            {preview.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-800">Configuration notes</p>
                    <ul className="mt-1 space-y-1">
                        {preview.warnings.map((w, i) => <li key={i} className="text-xs text-amber-700">• {w.message}</li>)}
                    </ul>
                </div>
            )}
            {preview.resolution.status !== "resolved" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                    Some lines could not be priced ({preview.resolution.status}). Check that the program, offering, schedule, and tuition rate are all configured.
                </div>
            )}

            {/* Line detail */}
            <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">What the family pays</h3>
                <div className="overflow-hidden rounded-lg border border-alloy-stone/20 bg-white">
                    {resolvedLines.length === 0 && <p className="px-4 py-3 text-sm text-alloy-midnight/45">Nothing priced for this selection.</p>}
                    {resolvedLines.map((l, i) => <LineRow key={l.lineKey} line={l} border={i > 0} />)}
                </div>
            </div>

            {/* Payment schedule */}
            {preview.schedule && preview.schedule.occurrences.length > 0 && (
                <div>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">Upcoming (next 3 months)</h3>
                    <div className="overflow-hidden rounded-lg border border-alloy-stone/20 bg-white">
                        {preview.schedule.occurrences.slice(0, 12).map((o) => (
                            <div key={o.occurrenceKey} className="flex items-center justify-between border-b border-alloy-stone/10 px-4 py-2 text-sm last:border-b-0">
                                <span className="text-alloy-midnight/70">{o.dueOn} · {KIND_LABELS[o.kind] ?? o.kind}</span>
                                <span className="font-medium text-alloy-midnight">{money(o.amount)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function LineRow({ line, border }: { line: ResolvedCommercialLine; border: boolean }) {
    const hasAdjustments = line.adjustments.length > 0;
    return (
        <div className={`px-4 py-2.5 ${border ? "border-t border-alloy-stone/12" : ""}`}>
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-alloy-midnight">{KIND_LABELS[line.kind] ?? line.kind}{line.cadence ? ` · ${line.cadence.label ?? line.cadence.cadenceKey}` : " · one-time"}</span>
                <span className="text-sm font-semibold text-alloy-midnight">{money(line.net)}</span>
            </div>
            {hasAdjustments && (
                <div className="mt-1 space-y-0.5">
                    <div className="flex items-center justify-between text-xs text-alloy-midnight/45">
                        <span>List price</span><span>{money(line.gross)}</span>
                    </div>
                    {line.adjustments.map((a, i) => (
                        <div key={i} className="flex items-center justify-between text-xs text-alloy-bend-pine">
                            <span>{a.label ?? a.kind}</span><span>{money({ amountCents: a.amountCents, currency: line.net.currency })}</span>
                        </div>
                    ))}
                </div>
            )}
            <p className="mt-0.5 text-[11px] text-alloy-midnight/40">
                Recognized: {RECOGNITION_LABELS[line.accounting.recognition] ?? line.accounting.recognition}
                {line.accounting.glAccountId ? "" : " · accounting not yet mapped"}
            </p>
        </div>
    );
}
