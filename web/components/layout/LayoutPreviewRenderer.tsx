"use client";

/**
 * Layout V2 — Preview Renderer (Deliverable C).
 *
 * Drawer surfaces delegate to {@link LayoutRuntimePlanView} so settings preview
 * and live runtime share one rendering engine. Queue surfaces keep card/table
 * preview renderers.
 */

import {
    LAYOUT_GRID_COLUMNS,
    type LayoutDoc,
    type LayoutItem,
} from "@/lib/layout/layoutV2";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import QueueCardProofRenderer from "@/components/layout/QueueCardProofRenderer";
import WaitlistCandidateCardProofRenderer from "@/components/layout/WaitlistCandidateCardProofRenderer";
import type { WaitlistCandidateCardVM } from "@/lib/layout/waitlist/waitlistCandidateCardVm";

/** Sample candidate for the Waitlist card preview (tier/position shown as runtime-supplied). */
const WAITLIST_PREVIEW_VM: WaitlistCandidateCardVM = {
    candidateId: "preview", opportunityId: "preview", isSyntheticFallback: false,
    child: { name: "Avery Nguyen (3y)", ageLabel: "3y", programLabel: "Toddler", desiredStartDate: "Aug 2026" },
    household: { name: "Nguyen", primaryContactName: "Jordan Nguyen", phone: "(555) 010-2244", email: "jordan@example.com", locationName: "North Campus" },
    waitlist: { cohortKey: "toddler", cohortLabel: "Toddler", cohortSectionTitle: "Toddler waitlist", tierLabel: "Sibling enrolled", positionLabel: "Position 3/12", positionMode: "live", waitSince: "May 15, 2026", desiredStartDate: "Aug 2026", status: "waitlisted", shadowMode: false },
    overrides: { hasActive: true, kinds: ["pin"], pinned: true, manuallyAdjusted: true, reason: "Sibling cohort alignment" },
    actions: { canOpen: true, canMessage: true, canCreateOffer: true, canOverride: true, canAskBos: true },
    widgets: {},
};

/**
 * Placeholder record for the queue-card preview: feeds two sample children so
 * the builder clearly shows that child rows REPEAT (one row per child), plus
 * representative header/contact/tour values.
 */
const QUEUE_PREVIEW_RECORD: Record<string, unknown> = {
    last_name: "Nguyen",
    _status_display: "Qualified",
    "opportunity.status_key": "Qualified",
    _attention: "Tour Jun 12 — confirm details",
    "opportunity.location": "North Campus",
    "person.primary_contact_name": "Jordan Nguyen",
    "person.primary_phone": "(555) 010-2244",
    "person.primary_email": "jordan@example.com",
    "opportunity.tour_date": "2026-06-12",
    children: [
        { id: "c1", "child.name": "Avery", "child.age_band": "3y", "child.program": "Preschool", "child.status": "Inquiry" },
        { id: "c2", "child.name": "Bryce", "child.age_band": "1y", "child.program": "Infant", "child.status": "Waitlist" },
    ],
};

const BORDER = "#e6e8ec";
const MUTED = "#59678b";
const TEXT = "#31394d";

function HintChip({ hint }: { hint?: string }) {
    if (!hint) return null;
    return (
        <span className="ml-2 rounded bg-[#F4F6F9] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#59678b]">
            {hint}
        </span>
    );
}

/**
 * A `locked` item is a SYSTEM FIELD (part of the data model) — it cannot be
 * deleted from the field registry, but its layout placement is fully editable.
 * The badge communicates that, not that the layout is locked.
 */
function SystemFieldChip({ locked }: { locked?: boolean }) {
    if (!locked) return null;
    return (
        <span
            className="ml-2 rounded border border-[#e6e8ec] bg-[#f4f6f9] px-1.5 py-0.5 text-[10px] font-medium text-[#59678b]"
            title="System field — part of the data model. Placement is editable; it just can't be deleted from the field registry."
        >
            system field
        </span>
    );
}

/**
 * Queue surface preview. A card-style queue (`metadata.renderAs === "card"`)
 * renders its sections like a record card; otherwise it falls back to the
 * table-of-columns preview.
 */
function QueuePreview({ doc }: { doc: LayoutDoc }) {
    const renderAs = (doc.metadata as { renderAs?: string } | undefined)?.renderAs;
    if (renderAs === "waitlist_candidate_card") {
        return (
            <div className="flex flex-col gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>Waitlist candidate card preview · sample data (tier/position supplied by runtime)</div>
                <WaitlistCandidateCardProofRenderer doc={doc} vm={WAITLIST_PREVIEW_VM} />
            </div>
        );
    }
    if (renderAs === "work_unit_card" || renderAs === "card") {
        return (
            <div className="flex flex-col gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>Queue card preview · sample data (child rows repeat per child)</div>
                <QueueCardProofRenderer doc={doc} record={QUEUE_PREVIEW_RECORD} />
            </div>
        );
    }
    const items = doc.sections[0]?.rows[0]?.columns[0]?.items ?? [];
    return (
        <div className="overflow-x-auto rounded-lg border border-[#e6e8ec] bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                    <tr className="border-b border-[#e6e8ec]" style={{ color: MUTED }}>
                        {items.map((it) => (
                            <th key={it.id} className="px-3 py-2 font-semibold">
                                <span className="inline-flex items-center">
                                    {it.label || it.refKey}
                                    <HintChip hint={it.renderHint} />
                                    {it.metadata && (it.metadata as { sortable?: boolean }).sortable ? (
                                        <span className="ml-1 text-[10px] text-[#9aa4bf]">↕</span>
                                    ) : null}
                                    <SystemFieldChip locked={it.locked} />
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {[0, 1].map((r) => (
                        <tr key={r} className="border-b border-[#f0f2f6]">
                            {items.map((it) => (
                                <td key={it.id} className="px-3 py-2" style={{ color: TEXT }}>
                                    {it.renderHint === "status" ? (
                                        <span className="inline-block rounded-full bg-[#eef1f6] px-2 py-0.5 text-xs">Status</span>
                                    ) : it.renderHint === "money" ? (
                                        "$0.00"
                                    ) : (
                                        "—"
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function LayoutPreviewRenderer({ doc }: { doc: LayoutDoc }) {
    if (!doc || !Array.isArray(doc.sections)) {
        return <div className="text-sm text-[#59678b]">No layout to preview.</div>;
    }

    return (
        <div className="flex flex-col gap-3" style={{ border: `0px solid ${BORDER}` }} data-layout-surface={doc.surface}>
            <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
                <span className="rounded bg-[#F4F6F9] px-2 py-0.5 font-medium uppercase tracking-wide">{doc.surface}</span>
                <span>{doc.entityType}</span>
                <span className="text-[#c3cad9]">·</span>
                <span>
                    {doc.sections.length} section{doc.sections.length === 1 ? "" : "s"}
                </span>
            </div>

            {doc.surface === "queue" ? (
                <QueuePreview doc={doc} />
            ) : (
                <LayoutRuntimePlanView doc={doc} record={LAYOUT_DRAWER_PREVIEW_RECORD} variant="preview" />
            )}
        </div>
    );
}
