import { NextRequest, NextResponse } from "next/server";
import { searchEntities } from "@/lib/queries";

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
 */
export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";

  try {
    return NextResponse.json({ hits: searchEntities(q) });
  } catch (error) {
    console.error("Echec de la recherche :", error);
    return NextResponse.json(
      { error: "search_unavailable" },
      { status: 500 },
    );
  }
}
