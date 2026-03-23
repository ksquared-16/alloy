"use client";

import type {
  RecordActivityPanelVm,
  RecordContactContextVm,
  RecordRelatedPanelVm,
} from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
  recordId: string;
  contact: RecordContactContextVm | null | undefined;
  related: RecordRelatedPanelVm | null | undefined;
  activity: RecordActivityPanelVm | null | undefined;
  onAction: WorkspaceActionHandler;
};

/**
 * Record body — right column: who/what this touches, connected objects, recent events.
 * Left column stays “what this record is” (core inline sections).
 */
export default function RecordInteractionPanels({
  recordId,
  contact,
  related,
  activity,
  onAction,
}: Props) {
  const relatedItems = related?.items?.filter((i) => i.preview?.trim()) ?? [];
  const events = activity?.events?.filter((e) => e.trim()) ?? [];

  if (!contact && relatedItems.length === 0 && events.length === 0) return null;

  return (
    <div className="adminv2-ws-record-context-stack" aria-label="Communication and context">
      {contact ? (
        <div className="adminv2-ws-record-interaction-panel">
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
      ) : null}

      {relatedItems.length > 0 ? (
        <div className="adminv2-ws-record-interaction-panel adminv2-ws-record-interaction-panel--context-soft">
          <h3 className="adminv2-ws-record-interaction-panel-title">Related</h3>
          <ul className="adminv2-ws-record-related-list" role="list">
            {relatedItems.map((item) => (
              <li key={item.id} className="adminv2-ws-record-related-row">
                <span className="adminv2-ws-record-related-kind">{item.kind}</span>
                <span className="adminv2-ws-record-related-value">
                  {item.linkId ? (
                    <button
                      type="button"
                      className="adminv2-ws-record-related-link"
                      onClick={() =>
                        onAction({
                          type: "record.body.link",
                          recordId,
                          sectionId: "related",
                          linkId: item.linkId!,
                          linePreview: `${item.kind}: ${item.preview}`.slice(0, 120),
                        })
                      }
                    >
                      {item.preview}
                    </button>
                  ) : (
                    item.preview
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {events.length > 0 ? (
        <div className="adminv2-ws-record-interaction-panel adminv2-ws-record-interaction-panel--activity adminv2-ws-record-interaction-panel--context-soft">
          <h3 className="adminv2-ws-record-interaction-panel-title">Recent activity</h3>
          <ul className="adminv2-ws-record-activity-list" aria-label="Recent events">
            {events.map((line, i) => (
              <li key={`ev-${i}`} className="adminv2-ws-record-activity-item">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
