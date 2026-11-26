/**
 * A projection row → the existing queue row shape (`ProvisioningRow` + `QueueRowContext`), so it renders
 * through the SAME compact queue row as every other Work View. Pure.
 *
 * Every field states what the row IS. Lifecycle-only facts (stage, case work, attention, next action)
 * are null — not invented — and the opportunity-only drawer is never named: `drawer_open` points at the
 * durable record's own table.
 */

import { QUEUE_ROW_CONTEXT_CONTRACT_VERSION, type QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import { domainProjectionRowId } from "@/lib/businessProcesses/projections/domainProjectionIdentity";
import type { DomainProjectionRow } from "@/lib/businessProcesses/projections/domainProjectionTypes";
import type { ProcessProjectionDomain } from "@/lib/lifecycle/processModelV1";

const SUBJECT_ROW_TYPE = { child: "child", person: "person", household: "customer" } as const;
const DRAWER_ENTITY = { child: "customer_members", person: "persons", household: "customers" } as const;
const SOURCE_LABEL = { schedule_assignment: "Assignment", charge: "Charge", enrollment_agreement: "Enrollment agreement", collection_attempt: "Collection" } as const;

export function domainProjectionQueueRowContext(
    row: DomainProjectionRow,
    args: { processKey: string; domain: ProcessProjectionDomain; projectionKey: string; projectionLabel: string },
): QueueRowContext {
    const sourceLabel = SOURCE_LABEL[row.source.kind];
    const d = row.detail ?? null;
    return {
        contract_version: QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
        row_subject: {
            subject_type: SUBJECT_ROW_TYPE[row.subject.type],
            subject_id: row.subject.id,
            display_name: row.label,
        },
        row_stage: args.projectionLabel,
        row_stage_key: null,
        lifecycle_key: args.processKey,
        row_status_key: row.source.kind,
        // The reason this record is in this view. A detail-bearing reason already states its own counts.
        row_status_label: d
            ? d.reason
            : row.source.count > 1
              ? `${row.source.statusLabel} · ${row.source.count} ${sourceLabel.toLowerCase()}s`
              : row.source.statusLabel,
        // The operational item this row is about. `case_id` is the SOURCE id, labelled as such — the
        // record that opens is `drawer_open` / `domain_projection.subject`, never this.
        case_context: {
            case_id: row.source.id,
            display_name: row.label,
            case_type_label: sourceLabel,
            case_status_key: row.source.kind,
            case_status_label: row.source.statusLabel,
        },
        primary_contact: null,
        related_subjects_summary: [],
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: DRAWER_ENTITY[row.subject.type], entity_id: row.subject.id },
        // Where the source puts this subject — rendered by the compact row's existing location slot.
        placement_context:
            d && (d.siteLocationId || d.roomLocationId || d.assignmentTypeLabel)
                ? {
                      location_id: d.siteLocationId ?? null,
                      location_label: d.siteLabel ?? null,
                      room_id: d.roomLocationId ?? null,
                      room_label: d.roomLabel ?? null,
                      program_label: d.assignmentTypeLabel ?? null,
                  }
                : null,
        domain_projection: {
            domain: args.domain,
            projection_key: args.projectionKey,
            subject: { type: row.subject.type, id: row.subject.id },
            source: { kind: row.source.kind, id: row.source.id, count: row.source.count, status_label: row.source.statusLabel },
            site_location_id: row.siteLocationId,
            detail: d
                ? {
                      reason: d.reason,
                      start_date: d.startDate ?? null,
                      end_date: d.endDate ?? null,
                      site_label: d.siteLabel ?? null,
                      room_location_id: d.roomLocationId ?? null,
                      room_label: d.roomLabel ?? null,
                      assignment_type_label: d.assignmentTypeLabel ?? null,
                      is_primary: d.isPrimary ?? null,
                      days_until: d.daysUntil ?? null,
                  }
                : null,
        },
    };
}

export function domainProjectionProvisioningRow(
    row: DomainProjectionRow,
    args: Parameters<typeof domainProjectionQueueRowContext>[1],
) {
    return {
        id: domainProjectionRowId(row),
        stageKey: null,
        statusKey: row.source.kind,
        updatedAt: null,
        title: row.label,
        context: domainProjectionQueueRowContext(row, args),
    };
}
