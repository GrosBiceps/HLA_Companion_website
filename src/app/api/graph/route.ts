import { NextRequest, NextResponse } from "next/server";
import { getNeighborhood } from "@/lib/queries";
import { SIGNAL_LEVELS } from "@/lib/labels";
import type { SignalLevel } from "@/lib/types";

/**
 * Voisinage de graphe — pont entre `GraphExplorer` (Client Component) et la
 * base. Meme raison d'etre que `/api/search` et `/api/mentions` :
 * `better-sqlite3` est un module natif, le client ne peut pas l'importer.
 *
 * L'ECHEC EST EXPLICITE, jamais un graphe vide. Un graphe vide signifie « ce
 * centre n'a aucun voisin dans le corpus » — une affirmation sur le contenu.
 * Quatre reponses distinctes : 400 (parametre manquant), 404 (centre absent
 * du corpus), 500 + `error` (base injoignable), 200 + le voisinage.
 *
 * ENCODAGE. Les cles HLA portent `*` et `:` ("HLA-DQB1*02:01").
 * `nextUrl.searchParams.get` rend la valeur DEJA decodee : on ne redecode
 * pas, sinon un allele contenant un `%` legitime serait corrompu.
 *
 * `minSignal` est valide contre `SIGNAL_LEVELS` : une valeur inventee ne doit
 * pas silencieusement filtrer tout ou rien, elle est refusee.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const center = params.get("center");

  if (!center) {
    return NextResponse.json({ error: "missing_center" }, { status: 400 });
  }

  const rawDepth = Number.parseInt(params.get("depth") ?? "1", 10);
  const depth = Number.isFinite(rawDepth) ? rawDepth : 1;

  const rawSignal = params.get("minSignal");
  let minSignal: SignalLevel | undefined;
  if (rawSignal !== null && rawSignal !== "") {
    if (!SIGNAL_LEVELS.includes(rawSignal as SignalLevel)) {
      return NextResponse.json({ error: "invalid_min_signal" }, { status: 400 });
    }
    minSignal = rawSignal as SignalLevel;
  }

  try {
    const graph = getNeighborhood(center, depth, minSignal);
    if (!graph.center) {
      return NextResponse.json({ error: "unknown_center" }, { status: 404 });
    }
    return NextResponse.json({ graph });
  } catch (error) {
    console.error("Echec de la lecture du voisinage :", error);
    return NextResponse.json({ error: "graph_unavailable" }, { status: 500 });
  }
}
