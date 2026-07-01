import type { DrawerSignalTone } from "@/lib/adminV2/drawerPipeline/types";

export type JobDrawerSignalLines = {
    paymentLabel: string;
    paymentTone: DrawerSignalTone;
    scheduleLabel: string;
    scheduleTone: DrawerSignalTone;
    assignmentLabel: string;
    assignmentTone: DrawerSignalTone;
};

export function deriveJobDrawerSignalLines(
    job: Record<string, unknown>,
    schedules: { start_at?: string }[],
    paymentLabel: string,
    paymentIsPaid: boolean,
    paymentFailed: boolean
): JobDrawerSignalLines {
    const nextRaw = job._next_schedule != null ? String(job._next_schedule) : "";
    const nextFromSched = schedules[0]?.start_at;
    const refIso = nextRaw || nextFromSched || "";
    let scheduleLabel = "No upcoming visit";
    let scheduleTone: DrawerSignalTone = "warning";
    if (refIso) {
        const t = new Date(refIso).getTime();
        if (!Number.isNaN(t)) {
            const now = Date.now();
            if (t < now) {
                scheduleLabel = "Overdue visit";
                scheduleTone = "critical";
            } else {
                const days = (t - now) / 86400000;
                scheduleLabel = days <= 1 ? "Visit soon" : "Scheduled";
                scheduleTone = days <= 1 ? "warning" : "info";
            }
        }
    }

    const vendorId = job.assigned_vendor_id != null ? String(job.assigned_vendor_id).trim() : "";
    const vendorName = String((job as { _vendor_name?: string | null })._vendor_name ?? "").trim();
    const wu = String((job as { _work_unit_label?: string | null })._work_unit_label ?? "").trim();
    let assignmentLabel = "Unassigned";
    let assignmentTone: DrawerSignalTone = "warning";
    if (vendorId) {
        assignmentLabel = vendorName ? `Cleaner: ${vendorName}` : "Cleaner assigned";
        assignmentTone = "info";
    } else if (wu) {
        assignmentLabel = `Queue: ${wu}`;
        assignmentTone = "info";
    }

    let payTone: DrawerSignalTone = "neutral";
    if (paymentFailed) payTone = "critical";
    else if (paymentIsPaid) payTone = "info";
    else payTone = "warning";

    return {
        paymentLabel,
        paymentTone: payTone,
        scheduleLabel,
        scheduleTone,
        assignmentLabel,
        assignmentTone,
    };
}
