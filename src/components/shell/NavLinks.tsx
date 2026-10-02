"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, isActive } from "./nav";

/** Navigation horizontale (>= lg). Etat actif par chemin courant. */
export function NavLinks() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Navigation principale" className="hidden lg:block">
      <ul className="flex items-center gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-9 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors",
                  active
                    ? "text-fg after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-fg-muted hover:bg-fg/[0.05] hover:text-fg",
                )}
              >
                {item.short ? (
                  <>
                    <span className="xl:hidden">{item.short}</span>
                    <span className="hidden xl:inline">{item.label}</span>
                  </>
                ) : (
                  item.label
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Menu mobile (< lg) : bouton hamburger + panneau deroulant sous l'en-tete.
 * Se referme a chaque navigation et sur Echap.
 */
export function MobileNav() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-fg/[0.06] hover:text-fg"
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Navigation principale"
          className="absolute inset-x-0 top-full animate-pop-in border-b border-line bg-surface shadow-raised"
        >
          <ul className="mx-auto max-w-content space-y-0.5 px-3 py-3 sm:px-5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex flex-col rounded-lg px-3 py-2.5",
                      active ? "bg-primary-soft" : "hover:bg-surface-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm font-medium",
                        active ? "text-primary-soft-fg" : "text-fg",
                      )}
                    >
                      {item.label}
                    </span>
                    <span className="text-xs text-fg-subtle">
                      {item.description}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
