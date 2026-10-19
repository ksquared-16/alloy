"use client";

/**
 * CHOOSE WHO PAYS FROM A FAMILY'S PAPERWORK LINK — the operator's half of linkPayerBinding.
 *
 * Reads `GET /api/admin/enrollment/links/[linkId]/payer` (the household's primary contacts) and, once the
 * operator has picked one and confirmed, POSTs `{ person_id, confirm: true }`. It decides nothing itself:
 *   - nobody is pre-selected, even when there is one candidate — the server records an operator decision,
 *     so the screen must not make it for them;
 *   - a refusal is shown as the server words it (already bound, paperwork closed, no primary contact…);
 *   - without Enrollment decision authority the GET answers 403, and the picker says who can do this
 *     instead of offering a control that would fail.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Candidate = { personId: string; name: string | null; email: string | null; phone: string | null };
type Preview = { linkId: string; candidates: Candidate[]; choiceRequired: boolean };

export default function LinkPayerPicker({ linkId, onBound }: { linkId: string; onBound?: (personId: string) => void }) {
    const [preview, setPreview] = useState<Preview | null>(null);
    const [loading, setLoading] = useState(true);
    const [refusal, setRefusal] = useState<string | null>(null);
    const [chosen, setChosen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [bound, setBound] = useState<Candidate | null>(null);

    useEffect(() => {
        let live = true;
        setLoading(true);
        void fetch(`/api/admin/enrollment/links/${encodeURIComponent(linkId)}/payer`, { credentials: "include" })
            .then(async (r) => ({ status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> }))
            .then(({ status, json }) => {
                if (!live) return;
                if (status === 403) {
                    setRefusal("Choosing who pays is an Enrollment decision. Ask someone with Enrollment decision access.");
                } else if (status >= 400) {
                    setRefusal(String(json.error ?? "This link could not be read."));
                } else {
                    setPreview(json.data as Preview);
                    setRefusal(null);
                }
            })
            .catch(() => live && setRefusal("This link could not be read."))
            .finally(() => live && setLoading(false));
        return () => {
            live = false;
        };
    }, [linkId]);

    const confirm = useCallback(async () => {
        if (!chosen) return;
        setBusy(true);
        setRefusal(null);
        try {
            const res = await fetch(`/api/admin/enrollment/links/${encodeURIComponent(linkId)}/payer`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ person_id: chosen, confirm: true }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (res.status === 403) throw new Error("Choosing who pays is an Enrollment decision. Ask someone with Enrollment decision access.");
            if (!res.ok) throw new Error(json.error ?? "The payer could not be recorded.");
            const person = preview?.candidates.find((c) => c.personId === chosen) ?? null;
            setBound(person);
            onBound?.(chosen);
        } catch (e) {
            setRefusal((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, [chosen, linkId, onBound, preview]);

    if (loading) {
        return (
            <p className="flex items-center gap-1.5 text-[0.75rem] text-alloy-midnight/60" data-link-payer="loading">
                <Loader2 size={12} className="animate-spin" /> Finding who can pay…
            </p>
        );
    }
    if (bound) {
        return (
            <p className="text-[0.8125rem] font-medium text-alloy-bend-pine" data-link-payer="bound">
                {bound.name ?? "The chosen contact"} is now the payer on this link. The family can pay from the same link — nothing was re-sent.
            </p>
        );
    }
    return (
        <div className="space-y-2" data-link-payer="picker">
            {preview ? (
                <>
                    <p className="text-[0.75rem] text-alloy-midnight/70">
                        {preview.candidates.length > 1
                            ? "This household has more than one primary contact. Choose who pays:"
                            : "Confirm the household's primary contact as the payer:"}
                    </p>
                    <ul className="space-y-1">
                        {preview.candidates.map((c) => (
                            <li key={c.personId}>
                                <label className="flex cursor-pointer items-start gap-2 text-[0.8125rem] text-alloy-midnight">
                                    <input
                                        type="radio"
                                        name={`payer-${linkId}`}
                                        value={c.personId}
                                        checked={chosen === c.personId}
                                        onChange={() => setChosen(c.personId)}
                                        data-link-payer="candidate"
                                    />
                                    <span>
                                        {c.name ?? "Unnamed contact"}
                                        <span className="block text-[0.6875rem] text-alloy-midnight/55">
                                            {[c.email, c.phone].filter(Boolean).join(" · ") || "No email or phone on file"}
                                        </span>
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={!chosen || busy}
                        data-link-payer="confirm"
                        className="rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-[0.8125rem] font-medium text-white disabled:opacity-40"
                    >
                        {busy ? "Recording…" : "Record this payer"}
                    </button>
                </>
            ) : null}
            {refusal ? (
                <p className="text-[0.75rem] text-alloy-ember" role="alert" data-link-payer="refusal">
                    {refusal}
                </p>
            ) : null}
        </div>
    );
}
