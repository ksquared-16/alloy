/**
 * One-shot read of work-unit URL query on mount. Lane queue state must not re-read the URL after mount.
 */

export type WorkUnitInitialLocationParams = {
    queue: string;
    unmapped: boolean;
    attentionBucket: string;
    statusKeys: string;
    attentionReason: string;
    attentionReasonCode: string;
    activitySignalKey: string;
};

export function readWorkUnitInitialLocationParams(): WorkUnitInitialLocationParams {
    if (typeof window === "undefined") {
        return {
            queue: "",
            unmapped: false,
            attentionBucket: "",
            statusKeys: "",
            attentionReason: "",
            attentionReasonCode: "",
            activitySignalKey: "",
        };
    }
    try {
        const sp = new URLSearchParams(window.location.search);
        return {
            queue: sp.get("queue")?.trim() ?? "",
            unmapped: sp.get("unmapped")?.trim() === "1",
            attentionBucket: (sp.get("attention_bucket") ?? "").trim(),
            statusKeys: (sp.get("status_keys") ?? "").trim(),
            attentionReason: (sp.get("attention_reason") ?? "").trim(),
            attentionReasonCode: (sp.get("attention_reason_code") ?? "").trim(),
            activitySignalKey: (sp.get("activity_signal_key") ?? "").trim(),
        };
    } catch {
        return {
            queue: "",
            unmapped: false,
            attentionBucket: "",
            statusKeys: "",
            attentionReason: "",
            attentionReasonCode: "",
            activitySignalKey: "",
        };
    }
}
