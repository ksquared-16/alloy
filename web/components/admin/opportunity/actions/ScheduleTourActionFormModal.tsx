import React, { useMemo, useState } from "react";

export type ScheduleTourActionFormModalProps = {
    open: boolean;
    onClose: () => void;
    onSubmit: (payload: { tour_date: string; tour_time: string }) => Promise<void> | void;
};

export function ScheduleTourActionFormModal(props: ScheduleTourActionFormModalProps) {
    const { open, onClose, onSubmit } = props;
    const [tourDate, setTourDate] = useState("");
    const [tourTime, setTourTime] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = useMemo(() => Boolean(tourDate && tourTime && !submitting), [tourDate, tourTime, submitting]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
            <div
                className="w-full max-w-md overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="border-b border-alloy-stone/15 px-5 py-4">
                    <div className="text-base font-semibold text-alloy-midnight">Schedule tour</div>
                    <div className="mt-0.5 text-sm text-alloy-midnight/65">Enter the tour date and time to start the follow-up workflow.</div>
                </div>

                <div className="space-y-4 px-5 py-4">
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

                    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                            type="button"
                            className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm hover:bg-alloy-stone/5"
                            onClick={onClose}
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
                                    onClose();
                                } catch (e) {
                                    const msg = e instanceof Error ? e.message : String(e);
                                    setError(msg || "Failed to schedule tour");
                                } finally {
                                    setSubmitting(false);
                                }
                            }}
                        >
                            {submitting ? "Scheduling…" : "Schedule tour"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

