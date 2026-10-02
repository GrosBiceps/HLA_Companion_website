import Link from "next/link";
import { Compass } from "lucide-react";
import { LinkButton } from "@/components/ui";

/**
 * Page 404 du site.
 *
 * Une fiche introuvable n'est PAS un resultat : un allele absent de l'index
 * n'est pas « jamais co-mentionne », il est inconnu de ce corpus (faute de
 * frappe, autre resolution, entite hors referentiel). La page le dit, puis
 * renvoie vers les index navigables plutot que de laisser le lecteur conclure.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl py-6 text-center sm:py-12">
      <span
        aria-hidden="true"
        className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary"
      >
        <Compass className="h-6 w-6" />
      </span>
      <p className="eyebrow">Erreur 404</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
        Cette page n&apos;existe pas dans le corpus
      </h1>
      <p className="mx-auto mt-4 max-w-prose text-base leading-relaxed text-fg-muted">
        L&apos;adresse ne correspond à aucune fiche. Ce n&apos;est pas un
        résultat : une entité absente ici est inconnue de cette version du
        corpus — vérifiez l&apos;orthographe (par exemple{" "}
        <span className="allele text-fg">HLA-DQB1*02:01</span>) ou passez par
        les index.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <LinkButton href="/allele" variant="primary">
          Index des allèles
        </LinkButton>
        <LinkButton href="/complication">Index des complications</LinkButton>
        <LinkButton href="/" variant="ghost">
          Accueil
        </LinkButton>
      </div>
      <p className="mt-6 text-xs text-fg-subtle">
        Astuce : la recherche (touche <kbd className="kbd">/</kbd>) retrouve
        allèles, complications, articles et auteurs.{" "}
        <Link href="/graph" className="link">
          Ou explorez le graphe.
        </Link>
      </p>
    </div>
  );
}
