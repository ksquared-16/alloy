"use client";

/**
 * Shell-owned inquiry children header actions — visible immediately; no registry fetch gate.
 */
export function OpportunityInquiryChildrenShellChrome({
    childrenCount,
    canMutate,
    onAddChild,
    onAddSibling,
}: {
    childrenCount: number;
    canMutate: boolean;
    onAddChild: () => void;
    onAddSibling: () => void;
}) {
    const label = childrenCount > 0 ? "Add sibling" : "Add child";
    const onClick = childrenCount > 0 ? onAddSibling : onAddChild;

    return (
        <button
            type="button"
            disabled={!canMutate}
            onClick={onClick}
            className="rounded-md border border-alloy-blue/30 bg-alloy-blue/5 px-3 py-1.5 text-sm font-semibold text-alloy-blue hover:bg-alloy-blue/10 hover:border-alloy-blue/45 disabled:opacity-50"
            data-inquiry-children-shell-action={childrenCount > 0 ? "add_sibling" : "add_child"}
            data-shell-owned="true"
        >
            {label}
        </button>
    );
}
