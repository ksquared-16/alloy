/**
 * Operator-facing labels for operational_tasks.source (never show raw enum in UI).
 */
export function formatOperationalTaskSourceLabel(source: string | null | undefined): string {
    const key = (source ?? "").trim().toLowerCase();
    switch (key) {
        case "task_assist":
            return "Task Assist follow-up";
        case "manual":
            return "Added manually";
        default:
            return key ? key.replace(/_/g, " ") : "Task";
    }
}

export function formatOperationalTaskDueDisplay(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    return new Date(t).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export function operationalTaskDueToLocalInput(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
