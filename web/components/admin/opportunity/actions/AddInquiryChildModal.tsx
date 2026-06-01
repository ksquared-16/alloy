import { useEffect, useMemo, useState } from "react";
import type { AddInquiryChildSubmitPayload } from "@/lib/admin/actions/submitAddInquiryChildFromDrawer";
import { validateAddInquiryChildSubmitPayload } from "@/lib/admin/actions/submitAddInquiryChildFromDrawer";

export type AddInquiryChildModalProps = {
    open: boolean;
    mode: "child" | "sibling";
    onClose: () => void;
    onSubmit: (payload: AddInquiryChildSubmitPayload) => Promise<void> | void;
};

export function AddInquiryChildModal(props: AddInquiryChildModalProps) {
    const { open, mode, onClose, onSubmit } = props;
    const [first, setFirst] = useState("");
    const [last, setLast] = useState("");
    const [dob, setDob] = useState("");
    const [program, setProgram] = useState("");
    const [ageGroup, setAgeGroup] = useState("");
    const [desiredSchedule, setDesiredSchedule] = useState("");
    const [desiredStartDate, setDesiredStartDate] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setFirst("");
        setLast("");
        setDob("");
        setProgram("");
        setAgeGroup("");
        setDesiredSchedule("");
        setDesiredStartDate("");
        setError(null);
        setSubmitting(false);
    }, [open, mode]);

    const payload = useMemo(
        (): AddInquiryChildSubmitPayload => ({
            first_name: first.trim(),
            last_name: last.trim(),
            date_of_birth: dob.trim() || null,
            program: program.trim() || null,
            age_group: ageGroup.trim() || null,
            desired_schedule_type: desiredSchedule.trim() || null,
            desired_start_date: desiredStartDate.trim() || null,
        }),
        [first, last, dob, program, ageGroup, desiredSchedule, desiredStartDate]
    );

    const validationError = useMemo(
        () => (first.trim() && last.trim() ? validateAddInquiryChildSubmitPayload(payload) : null),
        [first, last, payload]
    );

    const canSubmit = useMemo(
        () => Boolean(first.trim() && last.trim() && !validationError && !submitting),
        [first, last, validationError, submitting]
    );

    if (!open) return null;

    const title = mode === "sibling" ? "Add sibling" : "Add child";

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
            <div
                className="w-full max-w-md overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                data-add-inquiry-child-modal="true"
                data-add-inquiry-child-mode={mode}
            >
                <div className="border-b border-alloy-stone/15 px-5 py-4">
                    <div className="text-base font-semibold text-alloy-midnight">{title}</div>
                    <div className="mt-0.5 text-sm text-alloy-midnight/65">
                        Add the child to this inquiry. Required fields are checked when you save.
                    </div>
                </div>

                <div className="space-y-4 px-5 py-4">
                    <div className="grid grid-cols-1 gap-3">
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">
                                First name <span className="text-alloy-ember">*</span>
                            </div>
                            <input
                                value={first}
                                onChange={(e) => setFirst(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                required
                                data-add-inquiry-field="first_name"
                            />
                        </label>
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">
                                Last name <span className="text-alloy-ember">*</span>
                            </div>
                            <input
                                value={last}
                                onChange={(e) => setLast(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                required
                                data-add-inquiry-field="last_name"
                            />
                        </label>
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">
                                Date of birth <span className="text-alloy-midnight/45">(or age group below)</span>
                            </div>
                            <input
                                type="date"
                                value={dob}
                                onChange={(e) => setDob(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                data-add-inquiry-field="date_of_birth"
                            />
                        </label>
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">Age group</div>
                            <input
                                value={ageGroup}
                                onChange={(e) => setAgeGroup(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                placeholder="e.g. Toddler (2–3)"
                                data-add-inquiry-field="age_group"
                            />
                        </label>
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">Program interest</div>
                            <input
                                value={program}
                                onChange={(e) => setProgram(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                placeholder="e.g. Infant"
                                data-add-inquiry-field="program"
                            />
                        </label>
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">Desired schedule</div>
                            <input
                                value={desiredSchedule}
                                onChange={(e) => setDesiredSchedule(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                placeholder="e.g. full_day"
                                data-add-inquiry-field="desired_schedule_type"
                            />
                        </label>
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">Desired start date</div>
                            <input
                                type="date"
                                value={desiredStartDate}
                                onChange={(e) => setDesiredStartDate(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                data-add-inquiry-field="desired_start_date"
                            />
                        </label>
                    </div>

                    {validationError && !error ?
                        <p className="text-[11px] text-alloy-midnight/55" data-add-inquiry-validation-hint="true">
                            {validationError}
                        </p>
                    :   null}

                    {error ?
                        <div
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                            role="alert"
                        >
                            {error}
                        </div>
                    :   null}

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
                            data-add-inquiry-submit="true"
                            onClick={async () => {
                                const err = validateAddInquiryChildSubmitPayload(payload);
                                if (err) {
                                    setError(err);
                                    return;
                                }
                                setError(null);
                                setSubmitting(true);
                                try {
                                    await onSubmit(payload);
                                } catch (e) {
                                    setError(e instanceof Error ? e.message : String(e));
                                } finally {
                                    setSubmitting(false);
                                }
                            }}
                        >
                            {submitting ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
