"use client";

type Props = {
    isOpen: boolean;
    personName: string;
    isLoading?: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
};

/** Lightweight confirmation before reassigning household primary contact on a lead. */
export default function LeadHouseholdPrimaryContactConfirmModal({
    isOpen,
    personName,
    isLoading = false,
    onClose,
    onConfirm,
}: Props) {
    if (!isOpen) return null;

    const handleConfirm = () => {
        void Promise.resolve(onConfirm()).catch(() => {});
    };

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-primary-contact-modal-title"
            onClick={onClose}
        >
            <div
                className="mx-4 w-full max-w-md rounded-lg border border-alloy-stone/30 bg-white p-5 shadow-lg"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 id="lead-primary-contact-modal-title" className="mb-2 text-base font-semibold text-alloy-midnight">
                    Change primary contact?
                </h3>
                <p className="mb-4 text-sm text-alloy-midnight/80">
                    Make <strong>{personName || "this person"}</strong> the primary contact for this family?
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="rounded border border-alloy-stone/40 px-3 py-1.5 text-sm hover:bg-alloy-stone/20 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isLoading}
                        className="rounded bg-alloy-blue px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {isLoading ? "Saving…" : "Make primary contact"}
                    </button>
                </div>
            </div>
        </div>
    );
}
