"use client";

import { ActionModalOverlayShell } from "@/components/admin/opportunity/actions/ActionModalOverlayShell";

type Props = {
    isOpen: boolean;
    primaryName: string;
    targetName: string;
    /** Human summary of fields that will copy, e.g. "email, phone, and address". */
    fieldsSummary: string;
    isLoading?: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
};

function firstName(full: string | null | undefined): string {
    const trimmed = String(full ?? "").trim();
    if (!trimmed) return "";
    return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Confirm copying primary Context Details onto another household adult. */
export default function HouseholdCopyPrimaryContactConfirmModal({
    isOpen,
    primaryName,
    targetName,
    fieldsSummary,
    isLoading = false,
    onClose,
    onConfirm,
}: Props) {
    const handleConfirm = () => {
        void Promise.resolve(onConfirm()).catch(() => {});
    };

    const from = firstName(primaryName) || (primaryName.trim() || "Primary");
    const to = firstName(targetName) || (targetName.trim() || "this contact");

    return (
        <ActionModalOverlayShell
            open={isOpen}
            onClose={onClose}
            busy={isLoading}
            panelClassName="mx-4 w-full max-w-[400px] overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white p-5 shadow-2xl"
            data-testid="household-copy-primary-contact-confirm"
        >
            <h3
                id="household-copy-primary-contact-title"
                className="text-[15px] font-semibold tracking-tight text-alloy-midnight"
            >
                Copy from primary?
            </h3>

            <p className="mt-3 text-[13px] leading-snug text-alloy-slate">
                Copy {from}&rsquo;s {fieldsSummary} onto {to}. Name stays unchanged.
                Existing values on {to} for those fields will be replaced.
            </p>

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
                    data-household-copy-primary-confirm="true"
                >
                    {isLoading ? "Copying…" : "Copy details"}
                </button>
            </div>
        </ActionModalOverlayShell>
    );
}
