import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Boutons et liens-boutons.
 *
 * `variant` :
 *  - `primary`   : action principale de la vue (une seule par zone) ;
 *  - `secondary` : action courante, bordee ;
 *  - `ghost`     : action discrete (barre d'outils, en-tete) ;
 *  - `link`      : texte souligne, pour une action dans une phrase.
 *
 * `Button` est un simple <button> : utilisable dans un Server Component tant
 * qu'on ne lui passe pas de gestionnaire d'evenement (sinon, l'appelant est
 * un Client Component — comme pour tout <button onClick>).
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-fg shadow-xs hover:bg-primary-hover disabled:opacity-50",
  secondary:
    "bg-surface text-fg ring-1 ring-inset ring-line-strong shadow-xs hover:bg-surface-muted disabled:opacity-60",
  ghost: "text-fg-muted hover:bg-fg/[0.06] hover:text-fg disabled:opacity-50",
  link: "text-primary underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-2.5 text-xs",
  md: "h-9 gap-2 rounded-lg px-3.5 text-sm",
  lg: "h-11 gap-2 rounded-xl px-5 text-sm",
  icon: "h-9 w-9 justify-center rounded-lg",
};

export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
): string {
  return cn(
    "inline-flex items-center font-medium transition-colors disabled:cursor-not-allowed",
    variant === "link" ? "gap-1 text-sm" : SIZES[size],
    VARIANTS[variant],
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={cn(buttonClasses(variant, size), className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Lien interne (next/link) habille en bouton. */
export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Link className={cn(buttonClasses(variant, size), className)} {...rest}>
      {children}
    </Link>
  );
}
