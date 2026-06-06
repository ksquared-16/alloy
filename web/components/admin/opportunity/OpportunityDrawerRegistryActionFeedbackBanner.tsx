"use client";

import Link from "next/link";
import type { OpportunityDrawerRegistryActionFeedback } from "@/lib/admin/actions/useOpportunityDrawerRegistryActionFeedback";

type Props = {
    feedback: OpportunityDrawerRegistryActionFeedback;
};

export function OpportunityDrawerRegistryActionFeedbackBanner({ feedback }: Props) {
    return (
        <div
            className={`rounded-md border px-3 py-2 text-sm ${
                feedback.type === "success"
                    ? "border-alloy-pine/35 bg-emerald-50/90 text-alloy-midnight"
                    : "border-alloy-ember/40 bg-amber-50 text-alloy-ember"
            }`}
            role="status"
            data-opportunity-registry-action-feedback={feedback.type}
        >
            <div className="font-medium">{feedback.message}</div>
            {feedback.workflow_run_id ?
                <div className="mt-1.5 text-xs">
                    <Link
                        href={`/adminV2/workflows?run=${encodeURIComponent(feedback.workflow_run_id)}`}
                        className="font-semibold text-alloy-blue hover:underline"
                    >
                        Review workflow runs
                    </Link>
                </div>
            :   null}
        </div>
    );
}
