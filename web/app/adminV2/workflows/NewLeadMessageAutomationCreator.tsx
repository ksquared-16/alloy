"use client";

import { useEffect, useState } from "react";

/**
 * "WHEN A NEW LEAD IS CREATED → SEND A TEMPLATE" — the smallest usable automation authoring.
 *
 * No second runtime and no designer: it composes the existing workflow APIs into one workflow —
 * trigger `lead_created` (emitLeadCreatedEvent), action `send_communication_template` (the template by
 * reference, its current version resolved at send time, through the canonical sender) — and, by default,
 * one condition so it only greets NEW families (`new_family = true`), not a returning family's lead.
 */
type TemplateOption = { id: string; name: string; channel: "sms" | "email" };

export default function NewLeadMessageAutomationCreator({ onCreated }: { onCreated: () => void }) {
    const [open, setOpen] = useState(false);
    const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
    const [templateId, setTemplateId] = useState("");
    const [newFamiliesOnly, setNewFamiliesOnly] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || templates !== null) return;
        void (async () => {
            try {
                const res = await fetch("/api/admin/communications/templates?status=active", { credentials: "include" });
                const json = (await res.json().catch(() => ({}))) as { templates?: Array<Record<string, unknown>> };
                setTemplates(
                    (json.templates ?? [])
                        .map((t) => ({ id: String(t.id), name: String(t.name ?? ""), channel: String(t.channel ?? "") as TemplateOption["channel"] }))
                        .filter((t) => t.channel === "sms" || t.channel === "email"),
                );
            } catch {
                setTemplates([]);
            }
        })();
    }, [open, templates]);

    const chosen = templates?.find((t) => t.id === templateId) ?? null;

    const create = async () => {
        if (!chosen) {
            setError("Choose a template.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const wfRes = await fetch("/api/admin/workflows", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `New lead → ${chosen.name}`,
                    description: `When a new Enrollment lead is created, send the "${chosen.name}" ${chosen.channel === "sms" ? "SMS" : "email"} template to the family.`,
                    event_type: "lead_created",
                    entity_type: "opportunities",
                    enabled: true,
                    metadata: { authored_by: "new_lead_message_automation" },
                }),
            });
            const wf = (await wfRes.json().catch(() => ({}))) as { id?: string; error?: string };
            if (!wfRes.ok || !wf.id) throw new Error(wf.error || "Could not create the automation.");
            const put = (path: string, body: unknown) =>
                fetch(`/api/admin/workflows/${encodeURIComponent(wf.id!)}/${path}`, {
                    method: "PUT",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
            const actRes = await put("actions", {
                actions: [
                    {
                        action_type: "send_communication_template",
                        target_entity: "opportunities",
                        payload: { communication_template_id: chosen.id, channel: chosen.channel },
                    },
                ],
            });
            if (!actRes.ok) throw new Error("The automation was created but its message step could not be saved.");
            if (newFamiliesOnly) {
                const condRes = await put("conditions", {
                    conditions: [{ field_path: "new_family", operator: "eq", value: true }],
                });
                if (!condRes.ok) throw new Error("The automation was created but its new-family condition could not be saved.");
            }
            setOpen(false);
            setTemplateId("");
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not create the automation.");
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <button
                type="button"
                className="rounded-md border border-alloy-stone/25 px-2.5 py-1 text-[12px] font-medium text-alloy-bend-pine hover:bg-alloy-bend-pine/[0.06]"
                onClick={() => setOpen(true)}
                data-testid="new-lead-message-automation-open"
            >
                + When a new lead is created, send a message
            </button>
        );
    }
    return (
        <div className="space-y-2 rounded-lg border border-alloy-stone/20 bg-white p-3" data-testid="new-lead-message-automation">
            <p className="text-[13px] font-semibold text-alloy-midnight">When a new lead is created, send a message</p>
            <label className="block text-[12px] text-alloy-midnight/70">
                Template
                <select
                    className="mt-1 block w-full rounded-md border border-alloy-stone/25 px-2 py-1.5 text-[13px]"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    data-testid="new-lead-message-automation-template"
                >
                    <option value="">{templates === null ? "Loading templates…" : "Choose a template"}</option>
                    {(templates ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.name} · {t.channel === "sms" ? "SMS" : "Email"}
                        </option>
                    ))}
                </select>
            </label>
            <label className="flex items-center gap-2 text-[12px] text-alloy-midnight/70">
                <input type="checkbox" checked={newFamiliesOnly} onChange={(e) => setNewFamiliesOnly(e.target.checked)} />
                Only new families (not a returning family adding a child)
            </label>
            {error ? <p className="text-[12px] text-alloy-ember">{error}</p> : null}
            <div className="flex justify-end gap-2">
                <button type="button" className="text-[12px] text-alloy-midnight/60" onClick={() => setOpen(false)}>
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={busy}
                    className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                    onClick={() => void create()}
                    data-testid="new-lead-message-automation-create"
                >
                    {busy ? "Creating…" : "Create automation"}
                </button>
            </div>
        </div>
    );
}
