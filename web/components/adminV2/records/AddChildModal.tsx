"use client";

/**
 * Add Child — operator surface for the registered `child.add` capability.
 *
 * The flow exists to make two decisions visible before they are made:
 *
 *     household → child details → existing record OR explicit create-new → confirm
 *
 * Nothing here re-implements identity matching. The candidate list comes from
 * `/api/admin/records/child-identity` (the shared resolver) and the write goes
 * through `/api/admin/actions/execute` with `child.add`. If this component were
 * bypassed entirely, the server would still refuse to create silently.
 *
 * ── THIS IS NOT ENROLLMENT INTAKE ──
 *
 * It collects the minimum needed to establish a record: household, name, date of
 * birth. Requested days, start date, tuition, tour facts and commercial terms
 * belong to Enrollment and are deliberately absent — the moment this modal
 * starts asking them, Add Child has become Create Lead wearing another name.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
    CHILD_ADD_ACTION_ENTITY_ID,
    CHILD_ADD_ACTION_KEY,
} from "@/lib/adminV2/actions/definitions/childAddAction";

type Candidate = {
    record_id: string;
    person_id: string | null;
    customer_member_id: string | null;
    display_name: string;
    confidence_band: string;
    explanation: string;
    in_household: boolean;
};

type Household = { id: string; name: string };

export type AddChildResultSummary = {
    customerMemberId: string;
    personId: string | null;
    displayName: string;
    identityOutcome: string;
};

export type AddChildModalProps = {
    open: boolean;
    onClose: () => void;
    onCreated: (result: AddChildResultSummary) => void;
    /** Opening the durable record for the child that was just added. */
    onOpenRecord: (customerMemberId: string) => void;
    /** The two legitimate follow-on paths. Neither runs automatically. */
    onStartEnrollment: (customerMemberId: string) => void;
    onEnrollDirectly: (customerMemberId: string) => void;
};

type Step = "household" | "details" | "identity" | "preview" | "done";

const INPUT =
    "w-full rounded border border-alloy-stone/25 bg-white px-2.5 py-1.5 text-[13px] text-alloy-forge focus:border-alloy-juniper focus:outline-none focus:ring-1 focus:ring-alloy-juniper/20";
const LABEL = "mb-1 block text-[11px] font-medium text-alloy-midnight/55";
const PRIMARY_BTN =
    "rounded bg-[#00A283] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#009276] disabled:cursor-not-allowed disabled:opacity-50";
const GHOST_BTN =
    "rounded border border-alloy-stone/25 px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10";

const BAND_COPY: Record<string, string> = {
    confirmed: "Almost certainly the same child",
    strong: "Very likely the same child",
    possible: "Possibly the same child",
    weak: "Weak signal only",
    conflicted: "Conflicting signals — review carefully",
};

/** A candidate the operator can actually choose. The classifier can report ambiguity
 * without naming a single record; that is evidence, not a selectable option. */
function isSelectable(c: Candidate): boolean {
    return Boolean(c.customer_member_id || c.person_id);
}

export default function AddChildModal({
    open,
    onClose,
    onCreated,
    onOpenRecord,
    onStartEnrollment,
    onEnrollDirectly,
}: AddChildModalProps) {
    const [step, setStep] = useState<Step>("household");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Household
    const [householdQuery, setHouseholdQuery] = useState("");
    const [households, setHouseholds] = useState<Household[] | null>(null);
    const [household, setHousehold] = useState<Household | null>(null);

    // Child details
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [dob, setDob] = useState("");

    // Identity
    const [candidates, setCandidates] = useState<Candidate[] | null>(null);
    const [selected, setSelected] = useState<Candidate | null>(null);
    const [createNew, setCreateNew] = useState(false);
    const [createNewReason, setCreateNewReason] = useState("");

    // Preview / result
    const [previewSummary, setPreviewSummary] = useState<string | null>(null);
    const [previewChanges, setPreviewChanges] = useState<string[]>([]);
    const [result, setResult] = useState<AddChildResultSummary | null>(null);

    const reset = useCallback(() => {
        setStep("household");
        setBusy(false);
        setError(null);
        setHouseholdQuery("");
        setHouseholds(null);
        setHousehold(null);
        setFirstName("");
        setLastName("");
        setDob("");
        setCandidates(null);
        setSelected(null);
        setCreateNew(false);
        setCreateNewReason("");
        setPreviewSummary(null);
        setPreviewChanges([]);
        setResult(null);
    }, []);

    useEffect(() => {
        if (open) reset();
    }, [open, reset]);

    // Household search is server-side and debounced — the picker is a query, not a
    // filter over a preloaded list the operator's scope may not even cover.
    useEffect(() => {
        if (!open || step !== "household") return;
        let alive = true;
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const p = new URLSearchParams();
                    if (householdQuery.trim()) p.set("q", householdQuery.trim());
                    const res = await fetch(`/api/admin/records/households?${p.toString()}`, {
                        credentials: "include",
                    });
                    const json = (await res.json()) as { ok?: boolean; households?: Household[] };
                    if (!alive) return;
                    setHouseholds(json.households ?? []);
                } catch {
                    if (alive) setHouseholds([]);
                }
            })();
        }, 250);
        return () => {
            alive = false;
            clearTimeout(timer);
        };
    }, [open, step, householdQuery]);

    const matchesFound = (candidates?.length ?? 0) > 0;
    const identityResolved =
        Boolean(selected) || (createNew && (!matchesFound || createNewReason.trim().length > 0));

    const payload = useMemo(
        () => ({
            customer_id: household?.id ?? "",
            customer_member_id: selected?.customer_member_id ?? "",
            person_id: selected?.customer_member_id ? "" : (selected?.person_id ?? ""),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            date_of_birth: dob.trim(),
            create_new_child: createNew,
            create_new_reason: createNewReason.trim(),
        }),
        [household, selected, firstName, lastName, dob, createNew, createNewReason]
    );

    async function resolveIdentity() {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/records/child-identity", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    date_of_birth: dob.trim(),
                    customer_id: household?.id ?? "",
                }),
            });
            const json = (await res.json()) as { candidates?: Candidate[]; error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not check for an existing child");
            setCandidates(json.candidates ?? []);
            // A clean no-match means creating is safe; it is still an explicit choice.
            if ((json.candidates ?? []).length === 0) setCreateNew(true);
            setStep("identity");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not check for an existing child");
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
                    action_key: CHILD_ADD_ACTION_KEY,
                    entity_type: "child",
                    entity_id: CHILD_ADD_ACTION_ENTITY_ID,
                    mode: "preview",
                    payload,
                }),
            });
            const json = (await res.json()) as {
                ok?: boolean;
                data?: { execution_result?: { preview?: { summary?: string; changes?: string[] } } };
                error?: { message?: string };
            };
            if (!res.ok || json.ok === false) throw new Error(json.error?.message ?? "Preview failed");
            const preview = json.data?.execution_result?.preview;
            setPreviewSummary(preview?.summary ?? "Add this child to the household.");
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
                    action_key: CHILD_ADD_ACTION_KEY,
                    entity_type: "child",
                    entity_id: CHILD_ADD_ACTION_ENTITY_ID,
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
            if (!res.ok || json.ok === false) throw new Error(json.error?.message ?? "Could not add child");
            const detail = json.data?.execution_result ?? {};
            const summary: AddChildResultSummary = {
                customerMemberId: String(detail.customer_member_id ?? ""),
                personId: detail.person_id != null ? String(detail.person_id) : null,
                displayName: String(detail.display_name ?? ""),
                identityOutcome: String(detail.identity_outcome ?? ""),
            };
            setResult(summary);
            setStep("done");
            onCreated(summary);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not add child");
        } finally {
            setBusy(false);
        }
    }

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-start justify-center bg-alloy-midnight/30 p-6 pt-[10vh]"
            data-add-child-modal="true"
            data-add-child-step={step}
        >
            <div className="w-full max-w-[520px] rounded-lg border border-alloy-stone/25 bg-white shadow-xl">
                <header className="flex items-center justify-between border-b border-alloy-stone/25 px-4 py-3">
                    <div>
                        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                            Children
                        </p>
                        <h2 className="text-[15px] font-semibold text-alloy-midnight">Add child</h2>
                    </div>
                    <button type="button" className={GHOST_BTN} onClick={onClose} data-add-child-cancel="true">
                        {step === "done" ? "Close" : "Cancel"}
                    </button>
                </header>

                <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
                    {error ? (
                        <p
                            className="mb-3 rounded border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] text-red-700"
                            data-add-child-error="true"
                        >
                            {error}
                        </p>
                    ) : null}

                    {step === "household" ? (
                        <div className="space-y-3">
                            <p className="text-[12px] leading-snug text-alloy-midnight/60">
                                A child belongs to a household. Choose it explicitly — Alloy will not guess one
                                from a matching name.
                            </p>
                            <div>
                                <label className={LABEL} htmlFor="child-household-search">
                                    Household
                                </label>
                                <input
                                    id="child-household-search"
                                    className={INPUT}
                                    value={householdQuery}
                                    onChange={(e) => setHouseholdQuery(e.target.value)}
                                    placeholder="Search households"
                                    data-add-child-household-search="true"
                                />
                            </div>
                            {households == null ? (
                                <p className="text-[12px] text-alloy-midnight/50">Loading…</p>
                            ) : households.length === 0 ? (
                                <p className="text-[12px] text-alloy-midnight/55" data-add-child-no-households="true">
                                    No households match that search.
                                </p>
                            ) : (
                                <ul className="space-y-1.5" data-add-child-households="true">
                                    {households.map((h) => (
                                        <li key={h.id}>
                                            <button
                                                type="button"
                                                onClick={() => setHousehold(h)}
                                                className={`w-full rounded border px-2.5 py-2 text-left text-[13px] ${
                                                    household?.id === h.id
                                                        ? "border-alloy-juniper bg-alloy-juniper/[0.07]"
                                                        : "border-alloy-stone/25 hover:bg-alloy-stone/10"
                                                }`}
                                                data-add-child-household={h.id}
                                            >
                                                {h.name}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ) : null}

                    {step === "details" ? (
                        <div className="space-y-3">
                            <p className="text-[12px] leading-snug text-alloy-midnight/60">
                                Adding to <span className="font-medium">{household?.name}</span>. Only what the
                                record needs — enrollment details are asked for when enrollment starts.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={LABEL} htmlFor="child-first-name">
                                        First name
                                    </label>
                                    <input
                                        id="child-first-name"
                                        className={INPUT}
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        data-add-child-field="first_name"
                                    />
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor="child-last-name">
                                        Last name
                                    </label>
                                    <input
                                        id="child-last-name"
                                        className={INPUT}
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        data-add-child-field="last_name"
                                    />
                                </div>
                                <div>
                                    <label className={LABEL} htmlFor="child-dob">
                                        Date of birth
                                    </label>
                                    <input
                                        id="child-dob"
                                        type="date"
                                        className={INPUT}
                                        value={dob}
                                        onChange={(e) => setDob(e.target.value)}
                                        data-add-child-field="date_of_birth"
                                    />
                                </div>
                            </div>
                            <p className="text-[11px] leading-snug text-alloy-midnight/50">
                                Date of birth is optional, and leaving it out is honest. Without it, a shared name
                                cannot be told apart — so Alloy will ask you rather than choose.
                            </p>
                        </div>
                    ) : null}

                    {step === "identity" ? (
                        <div className="space-y-3" data-add-child-candidates="true">
                            {matchesFound ? (
                                <>
                                    <p className="text-[12px] font-medium text-alloy-midnight/80">
                                        {candidates!.length === 1
                                            ? "One existing record may already be this child."
                                            : `${candidates!.length} existing records may already be this child.`}
                                    </p>
                                    <ul className="space-y-1.5">
                                        {candidates!.map((c) => (
                                            <li key={`${c.record_id}:${c.customer_member_id ?? ""}`}>
                                                <button
                                                    type="button"
                                                    disabled={!isSelectable(c)}
                                                    onClick={() => {
                                                        setSelected(c);
                                                        setCreateNew(false);
                                                    }}
                                                    className={`w-full rounded border px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
                                                        selected?.record_id === c.record_id
                                                            ? "border-alloy-juniper bg-alloy-juniper/[0.07]"
                                                            : "border-alloy-stone/25 hover:bg-alloy-stone/10"
                                                    }`}
                                                    data-add-child-candidate={
                                                        c.customer_member_id ?? c.person_id ?? c.record_id
                                                    }
                                                >
                                                    <span className="block text-[13px] font-medium text-alloy-midnight">
                                                        {c.display_name}
                                                    </span>
                                                    <span className="block text-[11px] text-alloy-midnight/55">
                                                        {BAND_COPY[c.confidence_band] ?? c.confidence_band}
                                                        {c.in_household ? " · already in this household" : ""}
                                                        {isSelectable(c) ? "" : " · no single record to select"}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>

                                    <label className="mt-2 flex items-start gap-2 text-[12px] text-alloy-midnight/70">
                                        <input
                                            type="checkbox"
                                            className="mt-0.5"
                                            checked={createNew}
                                            onChange={(e) => {
                                                setCreateNew(e.target.checked);
                                                if (e.target.checked) setSelected(null);
                                            }}
                                            data-add-child-create-new="true"
                                        />
                                        <span>None of these — this is a different child</span>
                                    </label>
                                    {createNew ? (
                                        <div>
                                            <label className={LABEL} htmlFor="child-create-reason">
                                                Why is this a different child?
                                            </label>
                                            <input
                                                id="child-create-reason"
                                                className={INPUT}
                                                value={createNewReason}
                                                onChange={(e) => setCreateNewReason(e.target.value)}
                                                placeholder="e.g. Different Emma Chen — confirmed with the family"
                                                data-add-child-create-reason="true"
                                            />
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                <p className="text-[12px] text-alloy-midnight/70" data-add-child-no-match="true">
                                    No existing record matched. A new child record will be created.
                                </p>
                            )}
                        </div>
                    ) : null}

                    {step === "preview" ? (
                        <div className="space-y-3" data-add-child-step-preview="true">
                            <p
                                className="text-[13px] font-medium text-alloy-midnight"
                                data-add-child-preview-summary="true"
                            >
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

                    {step === "done" && result ? (
                        <div className="space-y-3" data-add-child-done="true">
                            <p className="text-[13px] font-medium text-alloy-midnight">Child added</p>
                            <p className="text-[12px] leading-snug text-alloy-midnight/65">
                                {result.identityOutcome === "already_in_household"
                                    ? `${result.displayName} was already on this household — nothing was duplicated.`
                                    : result.identityOutcome === "linked_existing_person"
                                      ? `${result.displayName} was linked from the existing person record — no second identity was created.`
                                      : `${result.displayName} is now on this household.`}
                            </p>
                            <p className="text-[11px] leading-snug text-alloy-midnight/50">
                                No enrollment was started — adding a child never starts one.
                            </p>

                            {/* The director already chose the family and the child, so the next
                                question is which enrolment path this sibling takes. Create Lead is
                                deliberately absent: it answers a question already answered. */}
                            <div className="border-t border-alloy-stone/25 pt-3" data-add-child-next="true">
                                <p className={LABEL}>What happens next?</p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className={GHOST_BTN}
                                        onClick={() => onStartEnrollment(result.customerMemberId)}
                                        data-add-child-start-enrollment="true"
                                    >
                                        Start enrollment
                                    </button>
                                    <button
                                        type="button"
                                        className={GHOST_BTN}
                                        onClick={() => onEnrollDirectly(result.customerMemberId)}
                                        data-add-child-enroll-directly="true"
                                    >
                                        Enroll directly
                                    </button>
                                </div>
                                <p className="mt-2 text-[11px] leading-snug text-alloy-midnight/50">
                                    Start enrollment runs the configured process. Enroll directly
                                    records the placement and schedule without it.
                                </p>
                            </div>
                        </div>
                    ) : null}
                </div>

                <footer className="flex items-center justify-between border-t border-alloy-stone/25 px-4 py-3">
                    <button
                        type="button"
                        className={GHOST_BTN}
                        onClick={() =>
                            setStep(
                                step === "preview" ? "identity" : step === "identity" ? "details" : "household"
                            )
                        }
                        disabled={step === "household" || step === "done" || busy}
                    >
                        Back
                    </button>

                    {step === "household" ? (
                        <button
                            type="button"
                            className={PRIMARY_BTN}
                            disabled={!household || busy}
                            onClick={() => setStep("details")}
                            data-add-child-household-continue="true"
                        >
                            Continue
                        </button>
                    ) : step === "details" ? (
                        <button
                            type="button"
                            className={PRIMARY_BTN}
                            disabled={busy || !firstName.trim() || !lastName.trim()}
                            onClick={resolveIdentity}
                            data-add-child-search="true"
                        >
                            {busy ? "Checking…" : "Check for an existing record"}
                        </button>
                    ) : step === "identity" ? (
                        <button
                            type="button"
                            className={PRIMARY_BTN}
                            disabled={!identityResolved || busy}
                            onClick={runPreview}
                            data-add-child-preview="true"
                        >
                            {busy ? "Checking…" : "Preview"}
                        </button>
                    ) : step === "preview" ? (
                        <button
                            type="button"
                            className={PRIMARY_BTN}
                            disabled={busy}
                            onClick={confirm}
                            data-add-child-confirm="true"
                        >
                            {busy ? "Adding…" : "Confirm and add child"}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className={PRIMARY_BTN}
                            onClick={() => result && onOpenRecord(result.customerMemberId)}
                            data-add-child-open-record="true"
                        >
                            Open record
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
}
