"use client";

/**
 * Layout V2 proof — Waitlist candidate card = the SAME queue-card engine.
 *
 * This is intentionally a THIN adapter, not a separate renderer: it flattens the
 * read-only WaitlistCandidateCardVM into a record and delegates to
 * QueueCardProofRenderer (the one queue-card engine). There is no waitlist-
 * specific rendering path — the waitlist card differs from the Lead card only by
 * its FIELDS, WIDGETS (Context Area: position / waitlisted-since / sibling /
 * adjust), and GROUP DISPLAY. See the unify sprint + layout_contract_v1.md §3.4.
 */

import { type LayoutDoc } from "@/lib/layout/layoutV2";
import {
    waitlistCardVmToProofRecord,
    type WaitlistCandidateCardVM,
} from "@/lib/layout/waitlist/waitlistCandidateCardVm";
import QueueCardProofRenderer from "@/components/layout/QueueCardProofRenderer";

export default function WaitlistCandidateCardProofRenderer({
    doc,
    vm,
    onOpen,
    onAction,
    showRuntimePosition = true,
}: {
    doc: LayoutDoc;
    vm: WaitlistCandidateCardVM;
    onOpen?: () => void;
    onAction?: (label: string) => void;
    showRuntimePosition?: boolean;
}) {
    return (
        <QueueCardProofRenderer
            doc={doc}
            record={waitlistCardVmToProofRecord(vm)}
            onOpen={onOpen}
            onAction={onAction}
            showRuntimePosition={showRuntimePosition}
        />
    );
}
