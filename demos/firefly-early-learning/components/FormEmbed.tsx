type FormEmbedProps = {
  src: string;
  title: string;
};

/**
 * Embedded Alloy form.
 *
 * `loading="eager"` on purpose: `lazy` defers the iframe request until it nears the viewport, so
 * the form visibly pops in after scroll. This is the primary content of the page it sits on, so it
 * should start loading with the document.
 *
 * No `fetchPriority` here — it is defined for img/link/script, not iframe (it is absent from
 * React's IframeHTMLAttributes for that reason). The root layout preconnects to the form host
 * instead, which is what actually removes setup cost from this request.
 */
export default function FormEmbed({ src, title }: FormEmbedProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-cream-dark bg-white shadow-sm">
      <iframe
        src={src}
        width="100%"
        height={720}
        className="block h-[720px] w-full border-0"
        title={title}
        loading="eager"
      />
    </div>
  );
}
