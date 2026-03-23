"use client";

import type { RecordSectionVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
  recordId: string;
  sections: RecordSectionVm[];
  onAction: WorkspaceActionHandler;
};

/**
 * Record main column — grouped sections (overview, scheduling, customer, …), not a single form wall.
 */
export default function RecordBodyBlock({ recordId, sections, onAction }: Props) {
  return (
    <div className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-record-body-root">
      <div className="adminv2-ws-record-body-scroll" role="region" aria-label="Record details">
        {sections.map((sec) => (
          <section key={sec.id} className="adminv2-ws-record-section">
            <h3 className="adminv2-ws-record-section-title">{sec.title}</h3>
            {sec.rows.length > 0 ? (
              <dl className="adminv2-ws-record-section-rows">
                {sec.rows.map((row) => (
                  <div key={`${sec.id}-${row.label}`} className="adminv2-ws-record-row">
                    <dt>{row.label}</dt>
                    <dd>
                      {row.linkId ? (
                        <button
                          type="button"
                          className="adminv2-ws-record-field-link"
                          onClick={() =>
                            onAction({
                              type: "record.body.link",
                              recordId,
                              sectionId: sec.id,
                              rowLabel: row.label,
                              linkId: row.linkId!,
                            })
                          }
                        >
                          {row.value}
                        </button>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {sec.bullets && sec.bullets.length > 0 ? (
              <ul className="adminv2-ws-record-section-bullets">
                {sec.bullets.map((b, i) => (
                  <li key={`${sec.id}-b-${i}`}>{b}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
