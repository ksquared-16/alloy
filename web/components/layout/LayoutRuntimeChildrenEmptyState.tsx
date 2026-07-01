"use client";

import { dispatchOpenAddInquiryChildModal } from "@/lib/admin/actions/addInquiryChildActionClient";

type Props = {
    opportunityId: string;
    canMutate?: boolean;
};

/** Intentional empty state for Child Information repeater. */
export default function LayoutRuntimeChildrenEmptyState({ opportunityId, canMutate = false }: Props) {
    return (
        <div
            className="flex flex-col items-start gap-2 px-3 py-4 sm:items-center sm:text-center"
            data-layout-runtime-children-empty="true"
        >
            <p className="text-sm font-medium text-alloy-midnight/85">No children linked yet</p>
            <p className="max-w-sm text-[11px] leading-snug text-alloy-muted">
                Add a child to capture program interest, schedule, and enrollment details for this inquiry.
            </p>
            {canMutate && opportunityId.trim() ?
                <button
                    type="button"
                    className="rounded-md border border-alloy-juniper/35 bg-white px-2.5 py-1 text-[11px] font-semibold text-alloy-juniper hover:bg-alloy-juniper/5"
                    data-layout-runtime-add-child="true"
                    onClick={() =>
                        dispatchOpenAddInquiryChildModal({
                            opportunity_id: opportunityId.trim(),
                            mode: "child",
                            action_key: "add_child",
                        })
                    }
                >
                    Add child
                </button>
            :   null}
        </div>
    );
}
