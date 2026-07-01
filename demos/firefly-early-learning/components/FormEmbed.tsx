type FormEmbedProps = {
  src: string;
  title: string;
};

export default function FormEmbed({ src, title }: FormEmbedProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-cream-dark bg-white shadow-sm">
      <iframe
        src={src}
        width="100%"
        height={520}
        className="block h-[520px] w-full border-0"
        title={title}
        loading="lazy"
      />
    </div>
  );
}
