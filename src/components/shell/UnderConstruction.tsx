import type { ReactNode } from "react";
import { Construction } from "lucide-react";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";

/**
 * Gabarit de page « en construction » — pour les routes annoncees dans la
 * navigation avant d'etre livrees. Il evite un 404 sur un lien de l'en-tete
 * et dit honnetement ce qui viendra.
 *
 * A REMPLACER par la vraie page : supprimer l'usage, pas le composant (il
 * peut resservir).
 */
export function UnderConstruction({
  eyebrow,
  title,
  description,
  planned,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  /** Ce que la page montrera, en une phrase. */
  planned: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <EmptyState
        icon={<Construction />}
        title="Vue en construction"
        description={planned}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <LinkButton href="/graph" variant="primary">
              Explorer le graphe
            </LinkButton>
            <LinkButton href="/">Retour à l&apos;accueil</LinkButton>
          </div>
        }
      />
      {children}
    </div>
  );
}
