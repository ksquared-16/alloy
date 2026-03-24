"use client";

import type { RecordSectionVm, RecordSectionLineVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
  recordId: string;
  sections: RecordSectionVm[];
  onAction: WorkspaceActionHandler;
  /** Flatter sections inside State / Connections / History bands */
  density?: "default" | "band";
};

function lineClass(
  tone?: "default" | "primary" | "muted",
  rowKind?: RecordSectionLineVm["rowKind"],
  hasBadge?: boolean
) {
  const parts = ["adminv2-ws-record-line"];
  if (tone === "primary") parts.push("adminv2-ws-record-line--primary");
  else if (tone === "muted") parts.push("adminv2-ws-record-line--muted");
  const rk = rowKind ?? "default";
  if (rk === "schedule") parts.push("adminv2-ws-record-line--schedule");
  if (rk === "financial") parts.push("adminv2-ws-record-line--financial");
  if (rk === "document") parts.push("adminv2-ws-record-line--document");
  if (rk === "tag") parts.push("adminv2-ws-record-line--tag");
  if (hasBadge) parts.push("adminv2-ws-record-line--has-badge");
  return parts.join(" ");
}

function FieldRow({
  recordId,
  sectionId,
  line,
  onAction,
}: {
  recordId: string;
  sectionId: string;
  line: RecordSectionLineVm;
  onAction: WorkspaceActionHandler;
}) {
  const k = line.fieldLabel!.trim();
  const toneMod =
    line.tone === "primary"
      ? "adminv2-ws-record-field-row--primary"
      : line.tone === "muted"
        ? "adminv2-ws-record-field-row--muted"
        : "";
  const badge = line.typeBadge?.trim();
  const hasBadge = Boolean(badge);
  const core = line.linkId ? (
    <button
      type="button"
      className={`adminv2-ws-record-inline-link${line.rowKind === "document" ? " adminv2-ws-record-inline-link--document" : ""}`}
      aria-label={line.rowKind === "document" ? `Open document: ${line.text}` : undefined}
      onClick={() =>
        onAction({
          type: "record.body.link",
          recordId,
          sectionId,
          linkId: line.linkId!,
          linePreview: line.text.slice(0, 120),
        })
      }
    >
      {line.text}
    </button>
  ) : (
    line.text
  );

  return (
    <div className={`adminv2-ws-record-field-row ${toneMod}`.trim()}>
      <span className="adminv2-ws-record-field-k">{k}</span>
      <span className="adminv2-ws-record-field-v">
        {hasBadge ? <span className="adminv2-ws-record-type-badge adminv2-ws-record-type-badge--in-field">{badge}</span> : null}
        {core}
      </span>
    </div>
  );
}

function sectionClassName(id: string, density: Props["density"]) {
  const base = "adminv2-ws-record-section";
  if (density === "band") {
    return `${base} adminv2-ws-record-section--in-band`;
  }
  if (id === "overview" || id === "scheduling") {
    return `${base} adminv2-ws-record-section--priority`;
  }
  if (id === "financial") {
    return `${base} adminv2-ws-record-section--support adminv2-ws-record-section--financial`;
  }
  if (id === "billing_documents") {
    return `${base} adminv2-ws-record-section--support adminv2-ws-record-section--documents`;
  }
  if (id === "requirements") {
    return `${base} adminv2-ws-record-section--support adminv2-ws-record-section--tags`;
  }
  return `${base} adminv2-ws-record-section--support`;
}

/**
 * Record body — core sections only (compact inline lines). Outer chrome + grid live in RecordWorkspace.
 */
export default function RecordBodyBlock({ recordId, sections, onAction, density = "default" }: Props) {
  if (sections.length === 0) return null;
  return (
    <div
      className={
        density === "band"
          ? "adminv2-ws-record-body-scroll adminv2-ws-record-body-scroll--band"
          : "adminv2-ws-record-body-scroll"
      }
      role="region"
      aria-label="Record core details"
    >
      {sections.map((sec) => {
        const showTitle = Boolean(sec.title?.trim());
        const hasFieldRows = sec.lines.some((l) => Boolean(l.fieldLabel?.trim()));
        return (
          <section key={sec.id} className={sectionClassName(sec.id, density)} data-section-id={sec.id}>
            {showTitle ? (
              <h3
                className={
                  density === "band"
                    ? "adminv2-ws-record-section-title adminv2-ws-record-section-title--band"
                    : "adminv2-ws-record-section-title"
                }
              >
                {sec.title}
              </h3>
            ) : null}
            {sec.lines.length > 0 ? (
              <div
                className={
                  hasFieldRows
                    ? "adminv2-ws-record-section-lines adminv2-ws-record-section-lines--fields"
                    : "adminv2-ws-record-section-lines"
                }
              >
                {sec.lines.map((line, i) => {
                  const fl = line.fieldLabel?.trim();
                  if (fl) {
                    return (
                      <FieldRow
                        key={`${sec.id}-L${i}`}
                        recordId={recordId}
                        sectionId={sec.id}
                        line={line}
                        onAction={onAction}
                      />
                    );
                  }
                  const badge = line.typeBadge?.trim();
                  const hasBadge = Boolean(badge);
                  return (
                    <p key={`${sec.id}-L${i}`} className={lineClass(line.tone, line.rowKind, hasBadge)}>
                      {badge ? <span className="adminv2-ws-record-type-badge">{badge}</span> : null}
                      <span className="adminv2-ws-record-line-core">
                        {line.linkId ? (
                          <button
                            type="button"
                            className={`adminv2-ws-record-inline-link${line.rowKind === "document" ? " adminv2-ws-record-inline-link--document" : ""}`}
                            aria-label={
                              line.rowKind === "document" ? `Open document: ${line.text}` : undefined
                            }
                            onClick={() =>
                              onAction({
                                type: "record.body.link",
                                recordId,
                                sectionId: sec.id,
                                linkId: line.linkId!,
                                linePreview: line.text.slice(0, 120),
                              })
                            }
                          >
                            {line.text}
                          </button>
                        ) : (
                          line.text
                        )}
                      </span>
                    </p>
                  );
                })}
              </div>
            ) : null}
            {sec.bullets && sec.bullets.length > 0 ? (
              <ul className="adminv2-ws-record-section-bullets adminv2-ws-record-section-bullets--compact">
                {sec.bullets.map((b, i) => (
                  <li key={`${sec.id}-b-${i}`}>{b}</li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
