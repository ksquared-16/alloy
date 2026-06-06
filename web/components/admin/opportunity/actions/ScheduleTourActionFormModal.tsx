import React, { useMemo, useState } from "react";
import { ActionModalStatusMessage } from "@/components/admin/opportunity/actions/ActionModalStatusMessage";

export type ScheduleTourActionFormModalProps = {
    open: boolean;
    title?: string;
    subtitle?: string;
    submitLabel?: string;
    successMessage?: string;
    initialTourDate?: string | null;
    initialTourTime?: string | null;
    onClose: () => void;
    /** Cancel button; defaults to `onClose`. */
    onCancel?: () => void;
    onSubmit: (payload: { tour_date: string; tour_time: string }) => Promise<void> | void;
    /** When set, renders only the inner card (no full-screen overlay) for nesting inside another modal. */
    variant?: "modal" | "embedded";
};

const SUCCESS_DISMISS_MS = 2000;

export function ScheduleTourActionFormModal(props: ScheduleTourActionFormModalProps) {
    const {
        open,
        onClose,
        onCancel,
        onSubmit,
        title = "Schedule tour",
        subtitle = "Enter the tour date and time to start the follow-up workflow.",
        submitLabel = "Schedule tour",
        successMessage: successMessageDefault = "Tour scheduled.",
        initialTourDate = null,
        initialTourTime = null,
        variant = "modal",
    } = props;
    const [tourDate, setTourDate] = useState(initialTourDate ?? "");
    const [tourTime, setTourTime] = useState(initialTourTime ?? "");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const canSubmit = useMemo(
        () => Boolean(tourDate && tourTime && !submitting && !successMessage),
        [tourDate, tourTime, submitting, successMessage]
    );

    React.useEffect(() => {
        if (!open) return;
        setTourDate(initialTourDate ?? "");
        setTourTime(initialTourTime ?? "");
        setError(null);
        setSubmitting(false);
        setSuccessMessage(null);
    }, [open, initialTourDate, initialTourTime]);

    if (!open) return null;

    const inner = (
        <div
            className={`w-full overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl ${variant === "modal" ? "max-w-md" : "max-w-lg"}`}
            onClick={(e) => e.stopPropagation()}
        >
                <div className="border-b border-alloy-stone/15 px-5 py-4">
                    <div className="text-base font-semibold text-alloy-midnight">{title}</div>
                    <div className="mt-0.5 text-sm text-alloy-midnight/65">{subtitle}</div>
                </div>

                <div className="space-y-4 px-5 py-4">
                    {successMessage ?
                        <>
                            <ActionModalStatusMessage type="success" message={successMessage} />
                            <p className="text-xs text-alloy-midnight/65">
                                Tour date in the inquiry summary has been updated.
                            </p>
                            <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    className="rounded-lg bg-alloy-midnight px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-alloy-midnight/90"
                                    onClick={onClose}
                                >
                                    Done
                                </button>
                            </div>
                        </>
                    :   <>
                    <div className="grid grid-cols-1 gap-3">
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">Tour date</div>
                            <input
                                type="date"
                                value={tourDate}
                                onChange={(e) => setTourDate(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                required
                            />
                        </label>
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">Tour time</div>
                            <input
                                type="time"
                                value={tourTime}
                                onChange={(e) => setTourTime(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                required
                            />
                        </label>
                    </div>

                    {error ?
                        <ActionModalStatusMessage type="error" message={error} />
                    :   null}

                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                            type="button"
                            className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm hover:bg-alloy-stone/5"
                            onClick={onCancel ?? onClose}
                            disabled={submitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="rounded-lg bg-alloy-midnight px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-alloy-midnight/90 disabled:opacity-60"
                            disabled={!canSubmit}
                            onClick={async () => {
                                setError(null);
                                setSubmitting(true);
                                try {
                                    await onSubmit({ tour_date: tourDate, tour_time: tourTime });
                                    setSuccessMessage(successMessageDefault);
                                    window.setTimeout(() => onClose(), SUCCESS_DISMISS_MS);
                                } catch (e) {
                                    const msg = e instanceof Error ? e.message : String(e);
                                    setError(msg || "Failed to schedule tour");
                                } finally {
                                    setSubmitting(false);
                                }
                            }}
                        >
                            {submitting ? "Saving…" : submitLabel}
                        </button>
                    </div>
                    </>
                    }
                </div>
        </div>
    );

    if (variant === "embedded") {
        return inner;
    }

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
            {inner}
        </div>
    );
}
