interface ComingSoonProps {
    title: string;
}

export default function ComingSoon({ title }: ComingSoonProps) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-admin-border bg-admin-surface-card p-12 text-center shadow-sm">
            <h1 className="text-xl font-bold text-alloy-midnight">{title}</h1>
            <p className="mt-2 text-alloy-muted">Coming soon</p>
        </div>
    );
}
