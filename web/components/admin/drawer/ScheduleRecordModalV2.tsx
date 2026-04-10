"use client";

import type { ReactNode } from "react";
import EntityDrawerOverview from "@/components/admin/entity/EntityDrawerOverview";
import type { StatusDefOption } from "@/components/admin/entity/EntityDrawerOverview";
import type { EntityDrawerSectionConfig, EntityPresentationType } from "@/lib/entityPresentation";

/** Admin V2 centered modal body for schedules — same field deck as legacy sidebar, distinct shell + data attrs. */
export default function ScheduleRecordModalV2(props: {
    entityType: EntityPresentationType;
    data: Record<string, unknown> | null;
    customSectionContent?: Record<string, ReactNode>;
    overviewSectionsOverride?: EntityDrawerSectionConfig[];
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
            className="adminv2-schedule-record-modal-root w-full max-w-none space-y-2 [&_section[data-entity-section]]:mb-2 [&_[data-entity-drawer-overview]]:pt-1"
        >
            <div className="adminv2-schedule-record-fielddeck">
                <EntityDrawerOverview {...props} />
            </div>
        </div>
    );
}
