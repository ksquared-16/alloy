"use client";

import { useCallback, useState } from "react";
import ProcessingAlloyDialog from "./ProcessingAlloyDialog";
import { PROCESSING_DEV_CLEANUP_CONFIRM_TOKEN } from "@/lib/pos/processingDevCleanup";

type CleanupPlan = {
    clearAllForms?: boolean;
    counts: {
        documents: number;
        processingCases: number;
        forms: number;
        formSubmissions: number;
        formPublicLinks: number;
    };
    remaining?: {
        documents: number;
        processingCases: number;
        forms: number;
        formSubmissions: number;
    };
};

export default function ProcessingDevCleanupDialog({
    open,
    onClose,
    onApplied,
}: {
    open: boolean;
    onClose: () => void;
    onApplied?: () => void;
}) {
    const [plan, setPlan] = useState<CleanupPlan | null>(null);
    const [clearAllForms, setClearAllForms] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [applied, setApplied] = useState(false);
    const [remaining, setRemaining] = useState<CleanupPlan["remaining"] | null>(null);

    const runDryRun = useCallback(async () => {
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/processing/dev-cleanup", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apply: false, clear_all: clearAllForms }),
            });
            const body = (await res.json().catch(() => ({}))) as CleanupPlan & { error?: string };
            if (!res.ok) throw new Error(body.error || `Dry run failed (${res.status})`);
            setPlan(body);
            setRemaining(body.remaining ?? null);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Dry run failed");
        } finally {
            setBusy(false);
        }
    }, [clearAllForms]);

    const runApply = useCallback(async () => {
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/processing/dev-cleanup", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    apply: true,
                    clear_all: clearAllForms,
                    confirm: PROCESSING_DEV_CLEANUP_CONFIRM_TOKEN,
                }),
            });
            const body = (await res.json().catch(() => ({}))) as CleanupPlan & { error?: string; remaining?: CleanupPlan["remaining"] };
            if (!res.ok) throw new Error(body.error || `Apply failed (${res.status})`);
            setApplied(true);
            setRemaining(body.remaining ?? null);
            onApplied?.();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Apply failed");
        } finally {
            setBusy(false);
        }
    }, [clearAllForms, onApplied]);

    return (
        <ProcessingAlloyDialog
            open={open}
            onClose={onClose}
            title="Reset Processing test data"
            subtitle="Development/staging only. Removes Processing-owned test artifacts — not CRM records or canonical fields."
            testId="processing-dev-cleanup-dialog"
            footer={
                <>
                    <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70">
                        Close
                    </button>
                    {!applied ? (
                        <>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runDryRun()}
                                className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70"
                                data-testid="processing-dev-cleanup-dry-run"
                            >
                                {busy && !plan ? "Running dry-run…" : "Dry run"}
                            </button>
                            <button
                                type="button"
                                disabled={busy || !plan}
                                onClick={() => void runApply()}
                                className="rounded-lg bg-alloy-bend-pine px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
                                data-testid="processing-dev-cleanup-apply"
                            >
                                {busy && plan ? "Applying…" : "Apply reset"}
                            </button>
                        </>
                    ) : null}
                </>
            }
        >
            <div className="space-y-3 text-[12px] text-alloy-midnight/70">
                <p>This removes imported documents, processing cases, generated/manual Processing forms, public test submissions, and orphaned review artifacts.</p>
                <label className="flex items-start gap-2 rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.03] px-3 py-2">
                    <input
                        type="checkbox"
                        checked={clearAllForms}
                        onChange={(e) => {
                            setClearAllForms(e.target.checked);
                            setPlan(null);
                            setRemaining(null);
                        }}
                        className="mt-0.5"
                        data-testid="processing-dev-cleanup-clear-all"
                    />
                    <span>
                        <span className="block font-semibold text-alloy-midnight">Clear all Processing test data</span>
                        <span className="mt-0.5 block text-[11px] text-alloy-midnight/45">
                            Deletes every org form definition when heuristics miss legacy test forms. Staging/dev only.
                        </span>
                    </span>
                </label>
                {plan ? (
                    <dl className="grid grid-cols-2 gap-2 rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.03] p-3">
                        <CountRow label="Documents" value={plan.counts.documents} />
                        <CountRow label="Processing cases" value={plan.counts.processingCases} />
                        <CountRow label="Forms" value={plan.counts.forms} />
                        <CountRow label="Submissions" value={plan.counts.formSubmissions} />
                        <CountRow label="Public links" value={plan.counts.formPublicLinks} />
                    </dl>
                ) : (
                    <p className="text-alloy-midnight/45">Run a dry-run to see exact counts before applying.</p>
                )}
                {remaining ? (
                    <dl className="grid grid-cols-2 gap-2 rounded-lg border border-alloy-bend-pine/15 bg-alloy-bend-pine/[0.04] p-3">
                        <CountRow label="Remaining documents" value={remaining.documents} />
                        <CountRow label="Remaining cases" value={remaining.processingCases} />
                        <CountRow label="Remaining forms" value={remaining.forms} />
                        <CountRow label="Remaining submissions" value={remaining.formSubmissions} />
                    </dl>
                ) : null}
                {applied ? <p className="font-medium text-alloy-bend-pine">Cleanup applied. Work and Studio should now be blank.</p> : null}
                {err ? <p className="text-red-700">{err}</p> : null}
            </div>
        </ProcessingAlloyDialog>
    );
}

function CountRow({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">{label}</dt>
            <dd className="text-[14px] font-semibold tabular-nums text-alloy-midnight">{value}</dd>
        </div>
    );
}
