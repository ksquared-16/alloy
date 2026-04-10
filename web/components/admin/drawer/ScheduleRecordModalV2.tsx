"use client";

import type { CSSProperties, ReactNode } from "react";
import EntityDrawerOverview from "@/components/admin/entity/EntityDrawerOverview";
import type { StatusDefOption } from "@/components/admin/entity/EntityDrawerOverview";
import type { EntityDrawerSectionConfig, EntityPresentationType } from "@/lib/entityPresentation";
import { neutral, derived, brand } from "@/styles/tokens/colors";

/** Aligns token shell with JobRecordModalV2 so job + schedule records feel like one system. */
const shell: CSSProperties = {
    color: neutral.textPrimary,
    ["--d-muted" as string]: derived.textSecondary,
    ["--d-border" as string]: derived.border,
    ["--d-surface" as string]: neutral.surface,
    ["--d-brand" as string]: brand.primary,
};

/** Admin V2 centered modal body for schedules — same field deck as legacy sidebar, distinct shell + data attrs. */
export default function ScheduleRecordModalV2(props: {
    entityType: EntityPresentationType;
    data: Record<string, unknown> | null;
    customSectionContent?: Record<string, ReactNode>;
    overviewSectionsOverride?: EntityDrawerSectionConfig[];
    /** From `record_layouts.config_json.overview_rows` (schedule entity). */
    scheduleOverviewRows?: string[][];
    selectOptionsByFieldKey?: Record<string, { value: string; label: string }[]>;
    isEditing?: boolean;
    formData?: Record<string, unknown>;
    onFieldChange?: (key: string, value: unknown) => void;
    onBlur?: () => void;
    canEdit?: boolean;
    statusDefs?: StatusDefOption[];
    getStatusLabel?: (key: string) => string | null;
    onOpenDrawer?: (entityType: string, id: string) => void;
}) {
    return (
        <div
            data-adminv2-schedule-record-modal="true"
            className="adminv2-schedule-record-modal-root w-full max-w-none space-y-2 [&_section[data-entity-section]]:mb-2 [&_[data-entity-drawer-overview]]:pt-2"
            style={{ ...shell, marginTop: -2 }}
        >
            <div className="adminv2-schedule-record-fielddeck rounded-xl px-0.5 sm:px-1" style={shell}>
                <EntityDrawerOverview {...props} />
            </div>
        </div>
    );
}
