import { NextRequest, NextResponse } from "next/server";
import { searchEntities } from "@/lib/queries";
import { ORGAN_PARAM, extractOrganHint, parseOrganParam } from "@/lib/organ";

/**
 * Recherche unifiee — le seul pont entre le SearchBar (Client Component) et
 * la base. `better-sqlite3` est natif : le client ne peut pas l'importer, il
 * passe donc par ce Route Handler.
 *
 * L'echec est explicite. `searchEntities` peut lever (base absente, handle
 * ferme, syntaxe FTS5 non prevue) ; sans ce try/catch la reponse serait une
 * 500 non geree, et le client ne pourrait pas la distinguer d'un corpus vide.
 * On renvoie donc un 500 porteur d'un drapeau `error`, jamais une liste vide :
 * un resultat vide est une affirmation sur le corpus, pas un aveu de panne.
 *
 * ORGANE : `?organe=coeur` borne la recherche a la strate. Un mot d'organe
 * reste lisible DANS `q` (« DR15 coeur ») : il l'emporte sur le parametre et
 * est retire de la requete, pour que « coeur » ne soit pas cherche comme un
 * terme plein texte.
 */
export function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("q") ?? "";
  const { organ: hinted, rest } = extractOrganHint(raw);
  const organ = hinted ?? parseOrganParam(request.nextUrl.searchParams.get(ORGAN_PARAM));
  // Un mot d'organe seul n'est pas une requete : on la garde telle quelle.
  const q = hinted && rest.trim() === "" ? "" : hinted ? rest : raw;

  try {
    return NextResponse.json({ hits: searchEntities(q, undefined, organ) });
  } catch (error) {
    console.error("Echec de la recherche :", error);
    return NextResponse.json(
      { error: "search_unavailable" },
      { status: 500 },
    );
  }
}
