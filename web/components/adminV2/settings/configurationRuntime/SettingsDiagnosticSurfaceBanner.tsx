import Link from "next/link";

/** Marks intentionally retained diagnostic/legacy settings surfaces and points to the canonical route. */
export default function SettingsDiagnosticSurfaceBanner({
    title = "Diagnostic surface",
    note,
    destinationHref,
    destinationLabel,
}: {
    title?: string;
    note: string;
    destinationHref: string;
    destinationLabel: string;
}) {
    return (
        <div
            className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-alloy-midnight/75"
            data-testid="settings-diagnostic-surface-banner"
        >
            <p className="font-semibold text-alloy-midnight/90">{title}</p>
            <p className="mt-1 max-w-3xl">{note}</p>
            <p className="mt-2">
                Canonical destination:{" "}
                <Link href={destinationHref} className="font-medium text-alloy-pine underline">
                    {destinationLabel}
                </Link>
            </p>
        </div>
    );
}
