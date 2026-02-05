interface ComingSoonProps {
    title: string;
}

export default function ComingSoon({ title }: ComingSoonProps) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-alloy-stone/30 bg-white p-12 text-center shadow-sm">
            <h1 className="text-xl font-bold text-alloy-midnight">{title}</h1>
            <p className="mt-2 text-alloy-midnight/60">Coming soon</p>
        </div>
    );
}
