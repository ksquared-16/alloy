import { useMemo, useState } from "react";

export type AddInquiryChildModalProps = {
    open: boolean;
    mode: "child" | "sibling";
    onClose: () => void;
    onSubmit: (payload: {
        first_name: string;
        last_name: string;
        date_of_birth?: string | null;
        program?: string | null;
        age_group?: string | null;
    }) => Promise<void> | void;
};

export function AddInquiryChildModal(props: AddInquiryChildModalProps) {
    const { open, mode, onClose, onSubmit } = props;
    const [first, setFirst] = useState("");
    const [last, setLast] = useState("");
    const [dob, setDob] = useState("");
    const [program, setProgram] = useState("");
    const [ageGroup, setAgeGroup] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = useMemo(() => Boolean(first.trim() && last.trim() && !submitting), [first, last, submitting]);
    if (!open) return null;

    const title = mode === "sibling" ? "Add sibling" : "Add child";

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
            <div
                className="w-full max-w-md overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="border-b border-alloy-stone/15 px-5 py-4">
                    <div className="text-base font-semibold text-alloy-midnight">{title}</div>
                    <div className="mt-0.5 text-sm text-alloy-midnight/65">This UI is wired; persistence will be added next.</div>
                </div>

                <div className="space-y-4 px-5 py-4">
                    <div className="grid grid-cols-1 gap-3">
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">First name</div>
                            <input
                                value={first}
                                onChange={(e) => setFirst(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                required
                            />
                        </label>
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">Last name</div>
                            <input
                                value={last}
                                onChange={(e) => setLast(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                required
                            />
                        </label>
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">Date of birth (optional)</div>
                            <input
                                type="date"
                                value={dob}
                                onChange={(e) => setDob(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                            />
                        </label>
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">Program (optional)</div>
                            <input
                                value={program}
                                onChange={(e) => setProgram(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                placeholder="e.g. Toddler"
                            />
                        </label>
                        <label className="text-sm">
                            <div className="mb-1 font-medium text-alloy-midnight">Age group (optional)</div>
                            <input
                                value={ageGroup}
                                onChange={(e) => setAgeGroup(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight shadow-sm outline-none focus:border-alloy-midnight/30"
                                placeholder="e.g. 2–3"
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
                                    await onSubmit({
                                        first_name: first.trim(),
                                        last_name: last.trim(),
                                        date_of_birth: dob.trim() || null,
                                        program: program.trim() || null,
                                        age_group: ageGroup.trim() || null,
                                    });
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

