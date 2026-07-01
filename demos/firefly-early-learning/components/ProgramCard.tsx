type ProgramCardProps = {
  title: string;
  description: string;
};

export default function ProgramCard({ title, description }: ProgramCardProps) {
  return (
    <article className="rounded-2xl border border-cream-dark bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-navy">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>
    </article>
  );
}
