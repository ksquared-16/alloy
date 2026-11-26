"use client";

import { ActionModalOverlayShell } from "@/components/admin/opportunity/actions/ActionModalOverlayShell";

type Props = {
    isOpen: boolean;
    personName: string;
    currentPrimaryName?: string | null;
    /** @deprecated Prefer consequence copy; retained for callers that still pass scope chips. */
    scopeLabels?: string[];
    isLoading?: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
};

function firstName(full: string | null | undefined): string {
    const trimmed = String(full ?? "").trim();
    if (!trimmed) return "";
    return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Confirmation before reassigning household primary contact — card-style Focus Panel confirmation. */
export default function LeadHouseholdPrimaryContactConfirmModal({
    isOpen,
    personName,
    currentPrimaryName,
    isLoading = false,
    onClose,
    onConfirm,
}: Props) {
    const handleConfirm = () => {
        void Promise.resolve(onConfirm()).catch(() => {});
    };

    const newName = (personName || "").trim() || "this person";
    const currentName = (currentPrimaryName ?? "").trim();
    const newFirst = firstName(newName) || newName;
    const currentFirst = firstName(currentName) || currentName;

    const consequence =
        currentFirst ?
            `${newFirst} will become the primary contact for this household and its linked opportunities. ${currentFirst} will remain a household contact.`
        :   `${newFirst} will become the primary contact for this household and its linked opportunities.`;

    return (
        <ActionModalOverlayShell
            open={isOpen}
            onClose={onClose}
            busy={isLoading}
            panelClassName="mx-4 w-full max-w-[400px] overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white p-5 shadow-2xl"
            data-testid="lead-household-primary-contact-confirm"
        >
            <h3
                id="lead-primary-contact-modal-title"
                className="text-[15px] font-semibold tracking-tight text-alloy-midnight"
            >
                Change primary contact?
            </h3>

            <div className="mt-4 space-y-3">
                {currentName ?
                    <div className="space-y-0.5">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-alloy-slate">
                            Current
                        </p>
                        <p className="text-[14px] font-semibold text-alloy-midnight">{currentName}</p>
                    </div>
                :   null}

                {currentName ?
                    <div
                        className="flex items-center gap-2 text-alloy-slate"
                        aria-hidden="true"
                    >
                        <span className="h-px flex-1 bg-alloy-stone/30" />
                        <span className="text-[12px] leading-none">↓</span>
                        <span className="h-px flex-1 bg-alloy-stone/30" />
                    </div>
                :   null}

                <div className="space-y-0.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-alloy-slate">
                        New primary
                    </p>
                    <p className="text-[14px] font-semibold text-alloy-midnight">{newName}</p>
                </div>

                <p className="text-[13px] leading-snug text-alloy-slate">{consequence}</p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    className="rounded-lg border border-alloy-stone/40 bg-white px-3 py-1.5 text-sm font-medium text-alloy-midnight hover:bg-alloy-stone/15 disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={isLoading}
                    className="rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-sm font-semibold text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50"
                >
                    {isLoading ? "Saving…" : "Make primary contact"}
                </button>
            </div>
        </ActionModalOverlayShell>
    );
}
