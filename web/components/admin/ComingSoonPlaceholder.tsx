"use client";

export default function ComingSoonPlaceholder({
    title,
    description,
}: {
    title: string;
    description?: string;
}) {
    return (
        <div className="max-w-2xl">
            <h1 className="text-2xl font-bold text-alloy-midnight mb-2">{title}</h1>
            {description && (
                <p className="text-alloy-midnight/70 text-sm mb-6">{description}</p>
            )}
            <div className="p-6 bg-alloy-stone/20 rounded-lg border border-alloy-stone/30">
                <p className="text-alloy-midnight/80 text-sm font-medium">Coming soon</p>
                <p className="text-alloy-midnight/60 text-sm mt-1">
                    This area is planned. Configuration and functionality will be added in a future release.
                </p>
            </div>
        </div>
    );
}
