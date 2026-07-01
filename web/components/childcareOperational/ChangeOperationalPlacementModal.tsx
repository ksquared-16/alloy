"use client";

import { useEffect, useMemo, useState } from "react";
import { computePriorRowCloseDate } from "@/lib/childcareOperational/effectiveDating";
import {
    OPERATIONAL_EDIT_FUTURE_DATED_NOTE,
    OPERATIONAL_EDIT_HISTORY_NOTE,
} from "@/lib/childcareOperational/operationalEnrollmentEditDoctrine";
import { submitChildPlacement } from "@/lib/childcareOperational/fetchOperationalEnrollmentMutations";
import {
    formatOperationalEnrollmentDate,
    type OperationalEnrollmentSummaryResponse,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";
import { useOperationalPlacementOptions } from "@/lib/childcareOperational/useOperationalPlacementOptions";
import OperationalEnrollmentModalChrome from "@/components/childcareOperational/OperationalEnrollmentModalChrome";

type Props = {
    open: boolean;
    summary: OperationalEnrollmentSummaryResponse["summary"];
    onClose: () => void;
    onSuccess: () => void;
};

export default function ChangeOperationalPlacementModal({ open, summary, onClose, onSuccess }: Props) {
    const agreement = summary.agreement!;
    const placement = summary.placement;
    const siteLocationId = agreement.site_location_id;
    const labels = summary.labels;

    const [programCategoryId, setProgramCategoryId] = useState(
        placement?.program_category_id ?? ""
    );
    const [roomLocationId, setRoomLocationId] = useState(placement?.room_location_id ?? "");
    const [startDate, setStartDate] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { programOptions, roomOptions, programDisabled, roomDisabled, loading } =
        useOperationalPlacementOptions(siteLocationId, programCategoryId);

    useEffect(() => {
        if (!open) return;
        setProgramCategoryId(placement?.program_category_id ?? "");
        setRoomLocationId(placement?.room_location_id ?? "");
        setStartDate("");
        setError(null);
        setBusy(false);
    }, [open, placement?.program_category_id, placement?.room_location_id]);

    const priorClosePreview = useMemo(() => {
        if (!startDate.trim() || !placement) return null;
        try {
            return computePriorRowCloseDate(startDate.trim());
        } catch {
            return null;
        }
    }, [startDate, placement]);

    const canSubmit =
        programCategoryId.trim().length > 0
        && roomLocationId.trim().length > 0
        && startDate.trim().length > 0
        && !busy
        && !loading;

    async function handleSubmit() {
        setError(null);
        setBusy(true);
        try {
            await submitChildPlacement({
                enrollment_agreement_id: agreement.id,
                start_date: startDate.trim(),
                supersede: placement != null,
                program_category_id: programCategoryId.trim(),
                room_location_id: roomLocationId.trim(),
                source_key: "operator_placement_edit",
            });
            onSuccess();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to update placement");
        } finally {
            setBusy(false);
        }
    }

    return (
        <OperationalEnrollmentModalChrome
            open={open}
            title={placement ? "Change placement" : "Set placement"}
            description="Update committed program and room on this enrollment agreement."
            busy={busy}
            onClose={onClose}
            onSubmit={handleSubmit}
            submitLabel={placement ? "Change placement" : "Set placement"}
            submitDisabled={!canSubmit}
            testId="change-operational-placement-modal"
        >
            <p className="text-xs leading-relaxed text-alloy-midnight/65">{OPERATIONAL_EDIT_HISTORY_NOTE}</p>
            <p className="text-xs leading-relaxed text-alloy-midnight/55">{OPERATIONAL_EDIT_FUTURE_DATED_NOTE}</p>

            {placement ?
                <div className="rounded-md border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-2 text-xs text-alloy-midnight/80">
                    <div>
                        <span className="font-semibold">Current placement</span>
                        <span className="text-alloy-midnight/55">
                            {" "}
                            · effective {formatOperationalEnrollmentDate(placement.start_date)}
                        </span>
                    </div>
                    <div className="mt-1">
                        {labels.program ?? "—"} · {labels.room ?? "—"}
                    </div>
                    {priorClosePreview ?
                        <div className="mt-1 text-alloy-midnight/60" data-prior-placement-close-preview="true">
                            Prior placement closes {formatOperationalEnrollmentDate(priorClosePreview)}
                        </div>
                    :   null}
                </div>
            :   null}

            <div className="space-y-3">
                <label className="block text-xs font-medium text-alloy-midnight">
                    Site
                    <input
                        type="text"
                        readOnly
                        value={labels.site ?? siteLocationId}
                        className="mt-1 w-full rounded-md border border-alloy-stone/25 bg-alloy-stone/5 px-2 py-1.5 text-sm"
                    />
                </label>
                <label className="block text-xs font-medium text-alloy-midnight">
                    Program
                    <select
                        className="mt-1 w-full rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                        value={programCategoryId}
                        disabled={programDisabled || busy || loading}
                        onChange={(e) => {
                            setProgramCategoryId(e.target.value);
                            setRoomLocationId("");
                        }}
                    >
                        <option value="">Select program…</option>
                        {programOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </label>
                <label className="block text-xs font-medium text-alloy-midnight">
                    Room
                    <select
                        className="mt-1 w-full rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                        value={roomLocationId}
                        disabled={roomDisabled || busy || loading}
                        onChange={(e) => setRoomLocationId(e.target.value)}
                    >
                        <option value="">Select room…</option>
                        {roomOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </label>
                <label className="block text-xs font-medium text-alloy-midnight">
                    Effective start date
                    <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                        value={startDate}
                        disabled={busy}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                </label>
            </div>

            {error ?
                <p className="text-sm text-alloy-ember">{error}</p>
            :   null}
        </OperationalEnrollmentModalChrome>
    );
}
