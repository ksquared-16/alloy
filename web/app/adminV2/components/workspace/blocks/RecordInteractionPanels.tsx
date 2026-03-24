"use client";

import type { RecordContactContextVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
  recordId: string;
  contact: RecordContactContextVm | null | undefined;
  onAction: WorkspaceActionHandler;
};

/**
 * Record body — right column (middle): **Customer / contact** only.
 * Related entities live in embedded `ContextBlock`; recent activity sits above workflows (`WorkBlock`).
 */
export default function RecordInteractionPanels({ recordId, contact, onAction }: Props) {
  if (!contact) return null;

  return (
    <div className="adminv2-ws-record-context-stack" aria-label="Customer and contact">
      <div className="adminv2-ws-record-interaction-panel adminv2-ws-record-interaction-panel--contact-primary">
        <h3 className="adminv2-ws-record-interaction-panel-title">Customer / contact</h3>
        <p className="adminv2-ws-record-interaction-primary">{contact.name}</p>
        {contact.address ? (
          <p className="adminv2-ws-record-interaction-line">{contact.address}</p>
        ) : null}
        {contact.preferredContact ? (
          <p className="adminv2-ws-record-interaction-line">{contact.preferredContact}</p>
        ) : null}
        {contact.lastContactAt ? (
          <p className="adminv2-ws-record-interaction-meta">Last contact · {contact.lastContactAt}</p>
        ) : null}
        {contact.contactActions.length > 0 ? (
          <div className="adminv2-ws-record-interaction-chips" role="group" aria-label="Contact channels">
            {contact.contactActions.map((a) => (
              <button
                key={a.id}
                type="button"
                className="adminv2-ws-record-interaction-chip"
                onClick={() =>
                  onAction({
                    type: "record.interaction",
                    recordId,
                    panel: "contact",
                    actionId: a.id,
                  })
                }
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
