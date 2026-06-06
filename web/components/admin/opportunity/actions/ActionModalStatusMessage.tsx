type Props = {
    type: "success" | "error" | "info";
    message: string;
};

/** Inline success/error/info for action modals — not drawer header banners. */
export function ActionModalStatusMessage({ type, message }: Props) {
    const tone =
        type === "success" ? "border-alloy-pine/35 bg-emerald-50/90 text-alloy-midnight"
        : type === "error" ? "border-alloy-ember/40 bg-amber-50 text-alloy-ember"
        : "border-alloy-stone/20 bg-alloy-stone/5 text-alloy-midnight/80";
    return (
        <div
            className={`rounded-md border px-3 py-2 text-sm font-medium ${tone}`}
            role={type === "error" ? "alert" : "status"}
            data-action-modal-status={type}
        >
            {message}
        </div>
    );
}
