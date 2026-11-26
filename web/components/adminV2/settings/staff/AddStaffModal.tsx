"use client";

/**
 * Add Staff — operator surface for the registered `staff.add` capability.
 *
 * The flow exists to make one decision visible before it is made:
 *
 *     search → existing person OR explicit create-new → employment → preview → confirm
 *
 * Nothing here re-implements identity matching. The candidate list comes from
 * `/api/admin/staff/resolve-person` (the canonical resolver) and the write goes
 * through `/api/admin/actions/execute` with `staff.add`. If this component were
 * bypassed entirely, the server would still refuse to create silently.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { STAFF_ADD_ACTION_ENTITY_ID, STAFF_ADD_ACTION_KEY } from "@/lib/adminV2/actions/definitions/staffAddAction";
import { EMPLOYMENT_TYPES } from "@/lib/employment/employmentTypes";

type Candidate = {
    person_id: string;
    display_name: string;
    confidence_band: string;
    explanation: string;
};

type Position = { id: string; label: string };
type SiteOption = { id: string; label: string };

export type AddStaffModalProps = {
    open: boolean;
    positions: Position[];
    sites: SiteOption[];
    todayYmd: string;
    onClose: () => void;
    onCreated: (result: { personId: string; employmentId: string; identityOutcome: string }) => void;
};

type Step = "identity" | "employment" | "preview";

const INPUT =
    "w-full rounded border border-admin-border bg-white px-2.5 py-1.5 text-[13px] text-alloy-forge focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20";
const LABEL = "mb-1 block text-[11px] font-medium text-alloy-midnight/55";
const PRIMARY_BTN =
    "rounded bg-alloy-blue px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-blue/90 disabled:cursor-not-allowed disabled:opacity-50";
const GHOST_BTN =
    "rounded border border-admin-border px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/70 hover:bg-alloy-midnight/5";

const BAND_COPY: Record<string, string> = {
    confirmed: "Almost certainly the same person",
    strong: "Very likely the same person",
    possible: "Possibly the same person",
    weak: "Weak signal only",
    conflicted: "Conflicting signals — review carefully",
};

export default function AddStaffModal({
    open,
    positions,
    sites,
    todayYmd,
    onClose,
    onCreated,
}: AddStaffModalProps) {
    const [step, setStep] = useState<Step>("identity");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Identity
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [candidates, setCandidates] = useState<Candidate[] | null>(null);
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
    const [createNew, setCreateNew] = useState(false);
    const [createNewReason, setCreateNewReason] = useState("");

    // Employment
    const [startDate, setStartDate] = useState(todayYmd);
    const [positionId, setPositionId] = useState("");
    const [employmentType, setEmploymentType] = useState("");
    const [primaryLocationId, setPrimaryLocationId] = useState("");

    // Preview
    const [previewSummary, setPreviewSummary] = useState<string | null>(null);
    const [previewChanges, setPreviewChanges] = useState<string[]>([]);

    const reset = useCallback(() => {
        setStep("identity");
        setBusy(false);
        setError(null);
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
        setCandidates(null);
        setSelectedPersonId(null);
        setCreateNew(false);
        setCreateNewReason("");
        setStartDate(todayYmd);
        setPositionId("");
        setEmploymentType("");
        setPrimaryLocationId("");
        setPreviewSummary(null);
        setPreviewChanges([]);
    }, [todayYmd]);

    useEffect(() => {
        if (open) reset();
    }, [open, reset]);

    const matchesFound = (candidates?.length ?? 0) > 0;
    const identityResolved = Boolean(selectedPersonId) || (createNew && (!matchesFound || createNewReason.trim().length > 0));

    const payload = useMemo(
        () => ({
            person_id: selectedPersonId ?? "",
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            create_new_person: createNew,
            create_new_reason: createNewReason.trim(),
            start_date: startDate,
            position_id: positionId,
            employment_type: employmentType,
            primary_location_id: primaryLocationId,
        }),
        [
            selectedPersonId,
            firstName,
            lastName,
            email,
            phone,
            createNew,
            createNewReason,
            startDate,
            positionId,
            employmentType,
            primaryLocationId,
        ]
    );

    async function resolveIdentity() {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/staff/resolve-person", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    email: email.trim(),
                    phone: phone.trim(),
                }),
            });
            const json = (await res.json()) as { candidates?: Candidate[]; error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not search for existing people");
            setCandidates(json.candidates ?? []);
            // A clean no-match means creating is safe; still an explicit choice.
            if ((json.candidates ?? []).length === 0) setCreateNew(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not search for existing people");
        } finally {
            setBusy(false);
        }
    }

    async function runPreview() {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/actions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    action_key: STAFF_ADD_ACTION_KEY,
                    entity_type: "person",
                    entity_id: STAFF_ADD_ACTION_ENTITY_ID,
                    mode: "preview",
                    payload,
                }),
            });
            const json = (await res.json()) as {
                ok?: boolean;
                data?: {
                    execution_result?: { preview?: { summary?: string; changes?: string[] } };
                };
                error?: { message?: string };
            };
            if (!res.ok || json.ok === false) {
                throw new Error(json.error?.message ?? "Preview failed");
            }
            // The envelope nests the action's preview under execution_result.preview.
            const preview = json.data?.execution_result?.preview;
            setPreviewSummary(preview?.summary ?? "Create employment for this person.");
            setPreviewChanges(preview?.changes ?? []);
            setStep("preview");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Preview failed");
        } finally {
            setBusy(false);
        }
    }

    async function confirm() {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/actions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    action_key: STAFF_ADD_ACTION_KEY,
                    entity_type: "person",
                    entity_id: STAFF_ADD_ACTION_ENTITY_ID,
                    mode: "execute",
                    confirmation: { confirmed: true },
                    payload,
                }),
            });
            const json = (await res.json()) as {
                ok?: boolean;
                data?: { execution_result?: Record<string, unknown> };
                error?: { message?: string };
            };
            if (!res.ok || json.ok === false) {
                throw new Error(json.error?.message ?? "Could not add staff");
            }
            // Execute returns the action's `detail` flattened onto execution_result.
            const detail = json.data?.execution_result ?? {};
            onCreated({
                personId: String(detail.person_id ?? ""),
                employmentId: String(detail.employment_id ?? ""),
                identityOutcome: String(detail.identity_outcome ?? ""),
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not add staff");
        } finally {
            setBusy(false);
        }
    }

    // Same dismissal contract as Add Child: X / Escape / backdrop, guarded by the platform's
    // existing dirty-state confirmation so typed work is never silently discarded.
    const dirty = Boolean(firstName.trim() || lastName.trim() || email.trim() || phone.trim());
    const requestClose = useCallback(() => {
        if (dirty && !window.confirm("Discard unsaved changes?")) return;
        onClose();
    }, [dirty, onClose]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            requestClose();
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [open, requestClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-start justify-center bg-alloy-midnight/30 p-6 pt-[10vh]"
            data-add-staff-modal="true"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) requestClose();
            }}
        >
            <div className="w-full max-w-[520px] rounded-lg border border-admin-border bg-white shadow-xl">
                <header className="flex items-center justify-between border-b border-admin-border px-4 py-3">
                    <div>
                        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                            Staff
                        </p>
                        <h2 className="text-[15px] font-semibold text-alloy-midnight">Add staff</h2>
                    </div>
                    <button type="button" className={GHOST_BTN} onClick={requestClose} data-add-staff-cancel="true">
                        Cancel
                    </button>
                </header>

                <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
                    {error ? (
                        <p
                            className="mb-3 rounded border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] text-red-700"
                            data-add-staff-error="true"
                        >
                            {error}
                        </p>
                    ) : null}

                    {step === "identity" ? (
                        <div className="space-y-3" data-add-staff-step="identity">
                            <p className="text-[12px] leading-snug text-alloy-midnight/60">
                                Search first. If this person is already in Alloy — a parent, a former employee — add
                                employment to the person who is already here rather than creating a second record.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={LABEL} htmlFor="staff-first-name">First name</label>
                                    <input
                                        id="staff-first-name"
                                        className={INPUT}
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        data-add-staff-field="first_name"
                                    />
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor="staff-last-name">Last name</label>
                                    <input
                                        id="staff-last-name"
                                        className={INPUT}
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        data-add-staff-field="last_name"
                                    />
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor="staff-email">Email</label>
                                    <input
                                        id="staff-email"
                                        className={INPUT}
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        data-add-staff-field="email"
                                    />
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor="staff-phone">Phone</label>
                                    <input
                                        id="staff-phone"
                                        className={INPUT}
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        data-add-staff-field="phone"
                                    />
                                </div>
                            </div>

                            <button
                                type="button"
                                className={PRIMARY_BTN}
                                disabled={busy || (!firstName.trim() && !lastName.trim() && !email.trim())}
                                onClick={resolveIdentity}
                                data-add-staff-search="true"
                            >
                                {busy ? "Searching…" : "Search for this person"}
                            </button>

                            {candidates != null ? (
                                <div className="mt-2 border-t border-admin-border pt-3" data-add-staff-candidates="true">
                                    {matchesFound ? (
                                        <>
                                            <p className="mb-2 text-[12px] font-medium text-alloy-midnight/80">
                                                {candidates.length === 1
                                                    ? "One person already in Alloy may be this human."
                                                    : `${candidates.length} people already in Alloy may be this human.`}
                                            </p>
                                            <ul className="space-y-1.5">
                                                {candidates.map((c) => (
                                                    <li key={c.person_id}>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedPersonId(c.person_id);
                                                                setCreateNew(false);
                                                            }}
                                                            className={`w-full rounded border px-2.5 py-2 text-left ${
                                                                selectedPersonId === c.person_id
                                                                    ? "border-alloy-blue bg-alloy-blue/5"
                                                                    : "border-admin-border hover:bg-alloy-midnight/5"
                                                            }`}
                                                            data-add-staff-candidate={c.person_id}
                                                        >
                                                            <span className="block text-[13px] font-medium text-alloy-midnight">
                                                                {c.display_name}
                                                            </span>
                                                            <span className="block text-[11px] text-alloy-midnight/55">
                                                                {BAND_COPY[c.confidence_band] ?? c.confidence_band}
                                                            </span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>

                                            <label className="mt-3 flex items-start gap-2 text-[12px] text-alloy-midnight/70">
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5"
                                                    checked={createNew}
                                                    onChange={(e) => {
                                                        setCreateNew(e.target.checked);
                                                        if (e.target.checked) setSelectedPersonId(null);
                                                    }}
                                                    data-add-staff-create-new="true"
                                                />
                                                <span>None of these — create a new person</span>
                                            </label>
                                            {createNew ? (
                                                <div className="mt-2">
                                                    <label className={LABEL} htmlFor="staff-create-reason">
                                                        Why is this a different person?
                                                    </label>
                                                    <input
                                                        id="staff-create-reason"
                                                        className={INPUT}
                                                        value={createNewReason}
                                                        onChange={(e) => setCreateNewReason(e.target.value)}
                                                        placeholder="e.g. Different Jane Wilson — confirmed by phone"
                                                        data-add-staff-create-reason="true"
                                                    />
                                                </div>
                                            ) : null}
                                        </>
                                    ) : (
                                        <p className="text-[12px] text-alloy-midnight/70" data-add-staff-no-match="true">
                                            No existing person matched. A new person record will be created.
                                        </p>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {step === "employment" ? (
                        <div className="space-y-3" data-add-staff-step="employment">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={LABEL} htmlFor="staff-start-date">Start date</label>
                                    <input
                                        id="staff-start-date"
                                        type="date"
                                        className={INPUT}
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        data-add-staff-field="start_date"
                                    />
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor="staff-position">Position</label>
                                    <select
                                        id="staff-position"
                                        className={INPUT}
                                        value={positionId}
                                        onChange={(e) => setPositionId(e.target.value)}
                                        data-add-staff-field="position_id"
                                    >
                                        <option value="">Not set</option>
                                        {positions.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor="staff-type">Employment type</label>
                                    <select
                                        id="staff-type"
                                        className={INPUT}
                                        value={employmentType}
                                        onChange={(e) => setEmploymentType(e.target.value)}
                                        data-add-staff-field="employment_type"
                                    >
                                        <option value="">Not set</option>
                                        {EMPLOYMENT_TYPES.map((t) => (
                                            <option key={t} value={t}>
                                                {t.replace("_", " ")}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor="staff-site">Primary location</label>
                                    <select
                                        id="staff-site"
                                        className={INPUT}
                                        value={primaryLocationId}
                                        onChange={(e) => setPrimaryLocationId(e.target.value)}
                                        data-add-staff-field="primary_location_id"
                                    >
                                        <option value="">Not set</option>
                                        {sites.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <p className="text-[11px] leading-snug text-alloy-midnight/50">
                                Employment records that this person works here. It does not create an Alloy sign-in,
                                a role, or any permission.
                            </p>
                        </div>
                    ) : null}

                    {step === "preview" ? (
                        <div className="space-y-3" data-add-staff-step="preview">
                            <p className="text-[13px] font-medium text-alloy-midnight" data-add-staff-preview-summary="true">
                                {previewSummary}
                            </p>
                            <ul className="space-y-1">
                                {previewChanges.map((c) => (
                                    <li key={c} className="text-[12px] leading-snug text-alloy-midnight/65">
                                        · {c}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>

                <footer className="flex items-center justify-between border-t border-admin-border px-4 py-3">
                    <button
                        type="button"
                        className={GHOST_BTN}
                        onClick={() => setStep(step === "preview" ? "employment" : "identity")}
                        disabled={step === "identity" || busy}
                    >
                        Back
                    </button>
                    {step === "identity" ? (
                        <button
                            type="button"
                            className={PRIMARY_BTN}
                            disabled={!identityResolved || busy}
                            onClick={() => setStep("employment")}
                            data-add-staff-continue="true"
                        >
                            Continue
                        </button>
                    ) : step === "employment" ? (
                        <button
                            type="button"
                            className={PRIMARY_BTN}
                            disabled={!startDate || busy}
                            onClick={runPreview}
                            data-add-staff-preview="true"
                        >
                            {busy ? "Checking…" : "Preview"}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className={PRIMARY_BTN}
                            disabled={busy}
                            onClick={confirm}
                            data-add-staff-confirm="true"
                        >
                            {busy ? "Adding…" : "Confirm and add staff"}
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
}
