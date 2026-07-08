"use client";

import type { LucideIcon } from "lucide-react";
import {
    Briefcase,
    CheckCircle2,
    FileEdit,
    FilePen,
    FolderOpen,
    GraduationCap,
    HeartPulse,
    Inbox,
    Landmark,
    Layers,
    Sparkles,
} from "lucide-react";

const FOLDER_ICONS: Record<string, LucideIcon> = {
    incoming: Inbox,
    completed: CheckCircle2,
    enrollment: GraduationCap,
    medical: HeartPulse,
    subsidy: Landmark,
    licensing: Briefcase,
    generated: Sparkles,
    manual: FileEdit,
    draft: FilePen,
    published: CheckCircle2,
};

export function ProcessingFolderIcon({ folderId, className }: { folderId: string; className?: string }) {
    const Icon = FOLDER_ICONS[folderId] ?? FolderOpen;
    return <Icon className={className} aria-hidden strokeWidth={1.75} />;
}
