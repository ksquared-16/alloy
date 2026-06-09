"use client";

import LeadActivityPreview from "@/components/layout/lead/LeadActivityPreview";
import type { LeadActivityPreviewEntry } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import type { PersonActivityPreviewEntry } from "@/lib/layout/runtime/resolvePersonActivityPreview";

type Props = {
    entries: PersonActivityPreviewEntry[];
};

/** Person activity preview — reuses Lead activity card chrome with person resolver entries. */
export default function PersonActivityPreview({ entries }: Props) {
    return <LeadActivityPreview entries={entries as LeadActivityPreviewEntry[]} />;
}
