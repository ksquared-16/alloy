export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-cream-dark bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm font-semibold text-navy">Firefly Early Learning</p>
          <p className="text-sm text-muted">
            © {year} Firefly Early Learning. All rights reserved.
          </p>
        </div>
        <p className="mt-4 text-center text-xs text-muted sm:text-left">
          Demo validation site for Alloy enrollment workflows.
        </p>
      </div>
    </footer>
  );
}
