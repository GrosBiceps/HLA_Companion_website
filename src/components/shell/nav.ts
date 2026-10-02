/**
 * Navigation principale — source unique pour l'en-tete, le menu mobile et le
 * pied de page.
 *
 * `match` decide de l'etat actif : un prefixe de chemin (`/graph` est actif
 * sur `/graph?center=...`). L'accueil n'est actif que sur `/` exactement.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Libelle court pour les largeurs intermediaires. */
  short?: string;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Accueil",
    description: "Présentation du corpus et points d'entrée",
  },
  {
    href: "/graph",
    label: "Explorer le graphe",
    short: "Graphe",
    description: "Navigation de proche en proche entre allèles et complications",
  },
  { href: "/serotype", label: "Sérotypes", description: "Spécificités sérologiques (DR15, B27…) et leurs allèles" },
  {
    href: "/matrice",
    label: "Matrice",
    description: "Vue croisée allèles × complications",
  },
  {
    href: "/carte-v1",
    label: "Carte v1",
    description: "Cartographie d'ensemble du corpus",
  },
  {
    href: "/methode",
    label: "Méthode",
    description: "Ce que mesurent les chiffres, et leurs limites",
  },
  {
    href: "/guide",
    label: "Guide",
    description: "Mode d'emploi : que faire selon votre besoin",
  },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
