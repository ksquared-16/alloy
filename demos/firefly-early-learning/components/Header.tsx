import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-cream-dark bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex min-w-0 items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-firefly text-sm font-bold text-navy"
            aria-hidden
          >
            ✦
          </span>
          <span className="truncate text-base font-semibold text-navy sm:text-lg">
            Firefly Early Learning
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-3 sm:gap-6">
          <Link
            href="/"
            className="hidden text-sm font-medium text-muted transition-colors hover:text-navy sm:inline"
          >
            Home
          </Link>
          <Link
            href="/contact"
            className="rounded-full bg-firefly px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-firefly-dark sm:px-5"
          >
            Contact Us
          </Link>
        </nav>
      </div>
    </header>
  );
}
