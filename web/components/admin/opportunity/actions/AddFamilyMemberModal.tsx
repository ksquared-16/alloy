"use client";

import { useEffect, useMemo, useState } from "react";

const ROLE_OPTIONS = [
    { value: "parent", label: "Parent" },
    { value: "guardian", label: "Guardian" },
    { value: "family_member", label: "Family member" },
    { value: "emergency_contact", label: "Emergency contact" },
    { value: "other", label: "Other" },
] as const;

export function AddFamilyMemberModal(props: {
    open: boolean;
    title?: string;
    onClose: () => void;
    onSubmit: (payload: { first_name: string; last_name: string; phone?: string; email?: string; role_type?: string }) => Promise<void>;
}) {
    const { open, title = "Add family member", onClose, onSubmit } = props;
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [roleType, setRoleType] = useState<string>("parent");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
        setRoleType("parent");
        setBusy(false);
        setError(null);
    }, [open]);

    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel =
        "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold tracking-wide text-alloy-forge/50";
    const input =
        "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";

    const roleOptions = useMemo(() => [...ROLE_OPTIONS], []);

    if (!open) return null;

    return (
        <>
            <div className={overlay} onClick={() => (!busy ? onClose() : null)} />
            <div className={panel} role="dialog" aria-modal="true" aria-label={title}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-alloy-stone/15">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
                        <div className="mt-0.5 text-[12px] text-alloy-midnight/60">
                            Links a person to this opportunity only (not the contacts model).
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>

                <div className="px-5 py-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <div className={label}>First name</div>
                            <input value={firstName} disabled={busy} onChange={(e) => setFirstName(e.target.value)} className={input} />
                        </div>
                        <div>
                            <div className={label}>Last name</div>
                            <input value={lastName} disabled={busy} onChange={(e) => setLastName(e.target.value)} className={input} />
                        </div>
                    </div>
                    <div>
                        <div className={label}>Role</div>
                        <select value={roleType} disabled={busy} onChange={(e) => setRoleType(e.target.value)} className={input}>
                            {roleOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <div className={label}>Email (optional)</div>
                            <input value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} className={input} />
                        </div>
                        <div>
                            <div className={label}>Phone (optional)</div>
                            <input value={phone} disabled={busy} onChange={(e) => setPhone(e.target.value)} className={input} />
                        </div>
                    </div>

                    {error ? <div className="text-sm text-alloy-ember">{error}</div> : null}

                    <div className="flex justify-end gap-2 pt-1">
                        <button type="button" disabled={busy} onClick={onClose} className={input + " w-auto px-4"}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                                void (async () => {
                                    setError(null);
                                    if (!firstName.trim() || !lastName.trim()) {
                                        setError("First and last name are required.");
                                        return;
                                    }
                                    setBusy(true);
                                    try {
                                        await onSubmit({
                                            first_name: firstName.trim(),
                                            last_name: lastName.trim(),
                                            email: email.trim() || undefined,
                                            phone: phone.trim() || undefined,
                                            role_type: roleType.trim() || undefined,
                                        });
                                    } catch (e) {
                                        setError(e instanceof Error ? e.message : "Something went wrong");
                                    } finally {
                                        setBusy(false);
                                    }
                                })();
                            }}
                            className="rounded-lg bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                            {busy ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
