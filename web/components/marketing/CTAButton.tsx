import Link from "next/link";
import type { ReactNode } from "react";

type CTAButtonVariant = "primary" | "secondary" | "ghost";

interface CTAButtonProps {
  children: ReactNode;
  href?: string;
  variant?: CTAButtonVariant;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}

const variantClasses: Record<CTAButtonVariant, string> = {
  primary:
    "bg-alloy-juniper text-white hover:bg-alloy-juniper/90 shadow-sm hover:shadow-md",
  secondary:
    "bg-white text-alloy-forge border border-alloy-forge/15 hover:border-alloy-juniper/40 hover:text-alloy-juniper",
  ghost: "text-alloy-forge/80 hover:text-alloy-juniper hover:bg-alloy-stone/60",
};

const baseClasses =
  "inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloy-juniper focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

export default function CTAButton({
  children,
  href,
  variant = "primary",
  className = "",
  type = "button",
  disabled,
  onClick,
}: CTAButtonProps) {
  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
