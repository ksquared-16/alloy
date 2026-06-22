"use client";

type Props = {
    isOpen: boolean;
    personName: string;
    currentPrimaryName?: string | null;
    scopeLabels?: string[];
    isLoading?: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
};

/** Confirmation before reassigning household primary contact — shows current vs new and affected scope. */
export default function LeadHouseholdPrimaryContactConfirmModal({
    isOpen,
    personName,
    currentPrimaryName,
    scopeLabels,
    isLoading = false,
    onClose,
    onConfirm,
}: Props) {
    if (!isOpen) return null;

    const handleConfirm = () => {
        void Promise.resolve(onConfirm()).catch(() => {});
    };

    const scopes = (scopeLabels ?? []).filter(Boolean);

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
                <div className="mb-4 space-y-2 text-sm text-alloy-midnight/80">
                    {currentPrimaryName ?
                        <p>
                            <span className="text-alloy-midnight/60">Current primary:</span>{" "}
                            <strong>{currentPrimaryName}</strong>
                        </p>
                    :   null}
                    <p>
                        <span className="text-alloy-midnight/60">New primary:</span>{" "}
                        <strong>{personName || "this person"}</strong>
                    </p>
                    {scopes.length > 0 ?
                        <div>
                            <p className="text-alloy-midnight/60">Affected scope:</p>
                            <ul className="mt-1 list-inside list-disc">
                                {scopes.map((scope) => (
                                    <li key={scope}>{scope}</li>
                                ))}
                            </ul>
                        </div>
                    :   null}
                    <p className="text-alloy-midnight/70">
                        The previous primary contact will remain linked as an additional household contact.
                    </p>
                </div>
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
