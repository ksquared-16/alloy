"use client";

import { useCallback, useEffect, useState } from "react";

import PrimaryButton from "@/components/PrimaryButton";
import ProcessingAlloyDialog from "./ProcessingAlloyDialog";

/**
 * Start a packet from nothing.
 *
 * ## Why this replaced what was here
 *
 * "New packet" used to open the per-record composer: pick some Forms, pick a household, mint a
 * link. That was the whole packet model once, and it is the model this product has spent the last
 * several passes removing — a packet is now an ordered set of OBLIGATIONS, of which a Form is one
 * kind. So an administrator could configure all three kinds of step beautifully, and could not
 * create a packet that worked that way. The product only made sense for a packet somebody else had
 * somehow already made.
 *
 * ## What it deliberately does not ask
 *
 * Nothing about Forms, and nothing about implementation. Choosing Forms at creation is the old model
 * wearing a new label: it decides the packet's contents before the administrator has been asked what
 * the family needs to do. Name it, describe it if that helps, and then compose it in the same Packet
 * Studio surface that edits every other packet — which is the point. There is ONE packet editor, and
 * a new packet is simply one with no steps yet.
 */
export default function ProcessingCreatePacketDialog({
    open,
    onClose,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    /** Hand back the new packet so the caller can open it immediately. */
    onCreated: (packetDefId: string, name: string) => void;
}) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setName("");
        setDescription("");
        setErr(null);
    }, [open]);

    const create = useCallback(async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            setErr("Give the packet a name.");
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/forms/packet-definitions", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed, ...(description.trim() ? { description: description.trim() } : {}) }),
            });
            const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }; error?: string };
            if (!res.ok || !body.data?.id) throw new Error(body.error ?? "The packet could not be created.");
            onCreated(body.data.id, trimmed);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, [description, name, onCreated]);

    return (
        <ProcessingAlloyDialog open={open} onClose={onClose} title="Create packet" testId="create-packet-dialog">
            <div className="space-y-3">
                <label className="block space-y-1 text-sm">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">Name</span>
                    <input
                        className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm"
                        value={name}
                        disabled={busy}
                        autoFocus
                        placeholder="Enrollment Paperwork 2027–2028"
                        data-testid="create-packet-name"
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && name.trim() && !busy) void create();
                        }}
                    />
                </label>
                <label className="block space-y-1 text-sm">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                        Description (optional)
                    </span>
                    <textarea
                        className="min-h-[60px] w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm"
                        value={description}
                        disabled={busy}
                        placeholder="What this packet is for."
                        data-testid="create-packet-description"
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </label>

                <p className="text-[11px] leading-snug text-alloy-midnight/55">
                    You will choose what families complete next — questions to answer, a document to read and agree to,
                    or a document to send in.
                </p>

                {err ? (
                    <p className="text-[12px] font-medium text-alloy-ember" data-testid="create-packet-error">
                        {err}
                    </p>
                ) : null}

                <div className="flex justify-end gap-2 pt-1">
                    <button type="button" className="text-sm font-medium text-alloy-midnight/60" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <PrimaryButton
                        type="button"
                        className="!px-3 !py-2 text-sm"
                        disabled={busy || !name.trim()}
                        onClick={() => void create()}
                    >
                        {busy ? "Creating…" : "Create packet"}
                    </PrimaryButton>
                </div>
            </div>
        </ProcessingAlloyDialog>
    );
}
