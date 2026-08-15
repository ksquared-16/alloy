"use client";

/**
 * Enroll Directly — the operator surface for `enrollment.direct`.
 *
 * It collects exactly the facts the durable trio requires and nothing else. That is the whole
 * distinction this modal has to hold: Direct Enroll skips the JOURNEY, not the INFORMATION, so
 * every field here exists because an agreement, a placement or a schedule assignment cannot be
 * written without it.
 *
 * Readiness is judged by the server, in `enrollment.direct`'s own eligibility evaluation, and shown
 * here through the preview. Re-implementing the rules client-side would create a second opinion
 * about what "ready" means, and the two would drift.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
    ENROLLMENT_DIRECT_ACTION_KEY,
} from "@/lib/adminV2/actions/definitions/enrollmentActions";
import { useInquiryChildPlacementCascade } from "@/lib/admin/hooks/useInquiryChildPlacementCascade";

type Option = { value: string; label: string };

export type DirectEnrollModalProps = {
    open: boolean;
    customerMemberId: string;
    childName: string;
    todayYmd: string;
    onClose: () => void;
    onEnrolled: (summary: { customerMemberId: string; childName: string }) => void;
};

const INPUT =
    "w-full rounded border border-alloy-stone/25 bg-white px-2.5 py-1.5 text-[13px] text-alloy-forge focus:border-alloy-juniper focus:outline-none focus:ring-1 focus:ring-alloy-juniper/20";
const LABEL = "mb-1 block text-[11px] font-medium text-alloy-midnight/55";
const PRIMARY_BTN =
    "rounded bg-[#00A283] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#009276] disabled:cursor-not-allowed disabled:opacity-50";
const GHOST_BTN =
    "rounded border border-alloy-stone/25 px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10";

export default function DirectEnrollModal({
    open,
    customerMemberId,
    childName,
    todayYmd,
    onClose,
    onEnrolled,
}: DirectEnrollModalProps) {
    const [siteLocationId, setSiteLocationId] = useState("");
    const [startDate, setStartDate] = useState(todayYmd);
    const [programCategoryId, setProgramCategoryId] = useState("");
    const [roomLocationId, setRoomLocationId] = useState("");
    const [scheduleType, setScheduleType] = useState("");
    const [scheduleOptions, setScheduleOptions] = useState<Option[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [blockers, setBlockers] = useState<{ code: string; message: string }[]>([]);
    const [previewChanges, setPreviewChanges] = useState<string[] | null>(null);

    // The same cascade Create Lead and operational placement edits use, so site → program → room
    // stays one vocabulary rather than a Records-specific copy.
    const cascade = useInquiryChildPlacementCascade({
        locationValue: siteLocationId,
        programValue: programCategoryId,
        programCategoryId,
    });

    useEffect(() => {
        if (!open) return;
        setSiteLocationId("");
        setStartDate(todayYmd);
        setProgramCategoryId("");
        setRoomLocationId("");
        setScheduleType("");
        setError(null);
        setBlockers([]);
        setPreviewChanges(null);
    }, [open, todayYmd]);

    // Schedule patterns are site-scoped: a schedule that exists at one site may not at another, and
    // offering an unusable one is exactly what the server blocks on.
    useEffect(() => {
        if (!open || !siteLocationId) {
            setScheduleOptions([]);
            return;
        }
        let alive = true;
        void (async () => {
            try {
                const res = await fetch(
                    `/api/admin/records/schedule-patterns?site_location_id=${encodeURIComponent(siteLocationId)}`,
                    { credentials: "include" }
                );
                const json = (await res.json()) as { patterns?: { key: string; label: string }[] };
                if (!alive) return;
                setScheduleOptions((json.patterns ?? []).map((p) => ({ value: p.key, label: p.label })));
            } catch {
                if (alive) setScheduleOptions([]);
            }
        })();
        return () => {
            alive = false;
        };
    }, [open, siteLocationId]);

    const payload = useMemo(
        () => ({
            site_location_id: siteLocationId,
            start_date: startDate,
            program_category_id: programCategoryId,
            room_location_id: roomLocationId,
            schedule_type: scheduleType,
        }),
        [siteLocationId, startDate, programCategoryId, roomLocationId, scheduleType]
    );

    const run = useCallback(
        async (mode: "preview" | "execute") => {
            setBusy(true);
            setError(null);
            setBlockers([]);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        action_key: ENROLLMENT_DIRECT_ACTION_KEY,
                        entity_type: "child",
                        entity_id: customerMemberId,
                        mode,
                        ...(mode === "execute" ? { confirmation: { confirmed: true } } : {}),
                        payload,
                    }),
                });
                const json = (await res.json()) as {
                    ok?: boolean;
                    data?: { execution_result?: { preview?: { changes?: string[] } } };
                    error?: { message?: string; details?: { blockers?: { code: string; message: string }[] } };
                };
                if (!res.ok || json.ok === false) {
                    const found = json.error?.details?.blockers ?? [];
                    setBlockers(found);
                    throw new Error(json.error?.message ?? "Could not enroll this child");
                }
                if (mode === "preview") {
                    setPreviewChanges(json.data?.execution_result?.preview?.changes ?? []);
                } else {
                    onEnrolled({ customerMemberId, childName });
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : "Could not enroll this child");
            } finally {
                setBusy(false);
            }
        },
        [customerMemberId, childName, payload, onEnrolled]
    );

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-start justify-center bg-alloy-midnight/30 p-6 pt-[10vh]"
            data-direct-enroll-modal="true"
        >
            <div className="w-full max-w-[520px] rounded-lg border border-alloy-stone/25 bg-white shadow-xl">
                <header className="flex items-center justify-between border-b border-alloy-stone/25 px-4 py-3">
                    <div>
                        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                            Enrollment
                        </p>
                        <h2 className="text-[15px] font-semibold text-alloy-midnight">
                            Enroll {childName} directly
                        </h2>
                    </div>
                    <button type="button" className={GHOST_BTN} onClick={onClose} data-direct-enroll-cancel="true">
                        Cancel
                    </button>
                </header>

                <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
                    <p className="mb-3 text-[12px] leading-snug text-alloy-midnight/60">
                        This skips the enrollment process — no tour, no qualification. It still records
                        the agreement, placement and schedule, because those are what make the child
                        appear on a roster.
                    </p>

                    {error ? (
                        <p
                            className="mb-3 rounded border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] text-red-700"
                            data-direct-enroll-error="true"
                        >
                            {error}
                        </p>
                    ) : null}

                    {blockers.length > 0 ? (
                        <ul className="mb-3 space-y-1" data-direct-enroll-blockers="true">
                            {blockers.map((b) => (
                                <li key={b.code} className="text-[12px] text-red-700" data-blocker={b.code}>
                                    · {b.message}
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={LABEL} htmlFor="de-site">Site</label>
                            <select
                                id="de-site"
                                className={INPUT}
                                value={siteLocationId}
                                onChange={(e) => {
                                    setSiteLocationId(e.target.value);
                                    setProgramCategoryId("");
                                    setRoomLocationId("");
                                    setScheduleType("");
                                }}
                                data-direct-enroll-field="site_location_id"
                            >
                                <option value="">Select a site</option>
                                {cascade.siteOptions.map((o: Option) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="de-start">Start date</label>
                            <input
                                id="de-start"
                                type="date"
                                className={INPUT}
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                data-direct-enroll-field="start_date"
                            />
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="de-program">Program</label>
                            <select
                                id="de-program"
                                className={INPUT}
                                value={programCategoryId}
                                onChange={(e) => setProgramCategoryId(e.target.value)}
                                disabled={cascade.programDisabled}
                                data-direct-enroll-field="program_category_id"
                            >
                                <option value="">Select a program</option>
                                {(cascade.programCategoryIdOptions as Option[]).map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="de-room">Room</label>
                            <select
                                id="de-room"
                                className={INPUT}
                                value={roomLocationId}
                                onChange={(e) => setRoomLocationId(e.target.value)}
                                disabled={cascade.roomDisabled}
                                data-direct-enroll-field="room_location_id"
                            >
                                <option value="">Not set</option>
                                {(cascade.roomOptions as Option[]).map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className={LABEL} htmlFor="de-schedule">Schedule</label>
                            <select
                                id="de-schedule"
                                className={INPUT}
                                value={scheduleType}
                                onChange={(e) => setScheduleType(e.target.value)}
                                data-direct-enroll-field="schedule_type"
                            >
                                <option value="">Select a schedule</option>
                                {scheduleOptions.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                            <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/50">
                                Only schedules configured at the selected site appear here. Without one
                                the child would never be expected on a day.
                            </p>
                        </div>
                    </div>

                    {previewChanges ? (
                        <ul className="mt-3 space-y-1 border-t border-alloy-stone/25 pt-3" data-direct-enroll-preview="true">
                            {previewChanges.map((c) => (
                                <li key={c} className="text-[12px] leading-snug text-alloy-midnight/65">· {c}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>

                <footer className="flex items-center justify-between border-t border-alloy-stone/25 px-4 py-3">
                    <button
                        type="button"
                        className={GHOST_BTN}
                        disabled={busy}
                        onClick={() => void run("preview")}
                        data-direct-enroll-preview-run="true"
                    >
                        {busy ? "Checking…" : "Check"}
                    </button>
                    <button
                        type="button"
                        className={PRIMARY_BTN}
                        disabled={busy}
                        onClick={() => void run("execute")}
                        data-direct-enroll-confirm="true"
                    >
                        {busy ? "Enrolling…" : "Enroll directly"}
                    </button>
                </footer>
            </div>
        </div>
    );
}
