"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useOrganSelection } from "@/components/organ/useOrganSelection";
import { ALL_ORGANS, withOrgan, type OrganSelection } from "@/lib/organ";
import { NAV_ITEMS } from "./nav";

function Links({ organ }: { organ: OrganSelection }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {NAV_ITEMS.map((item) => (
        <li key={item.href}>
          <Link
            href={withOrgan(item.href, organ)}
            className="text-fg-muted transition-colors hover:text-primary"
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function LinksWithOrgan() {
  return <Links organ={useOrganSelection()} />;
}

/**
 * Liens du pied de page. Ils reportent la strate d'organe courante comme
 * ceux de l'en-tete ; sur une page prerendue, le repli (sans organe) part dans
 * le HTML puis le client le remplace.
 */
export function FooterNav() {
  return (
    <Suspense fallback={<Links organ={ALL_ORGANS} />}>
      <LinksWithOrgan />
    </Suspense>
  );
}
