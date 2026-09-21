import { NextRequest, NextResponse } from "next/server";
import { getPairMentions } from "@/lib/queries";

/**
 * Phrases sources d'une paire (allele, complication) — le pont entre le
 * `SentenceDrawer` (Client Component) et la base.
 *
 * Meme raison d'etre que `/api/search` : `better-sqlite3` est un module natif,
 * un composant client ne peut pas l'importer. Ce handler l'enveloppe.
 *
 * L'ECHEC EST EXPLICITE, jamais une liste vide. Un tableau vide signifie « le
 * corpus ne contient aucune phrase pour cette paire » — une affirmation sur le
 * contenu. Rendre ca en cas de panne ferait exactement ce que ce site existe
 * pour eviter : presenter une defaillance comme un resultat. On distingue donc
 * trois reponses : 400 (parametre manquant), 500 + `error` (base injoignable),
 * 200 + `mentions` (reponse du corpus, fut-elle vide).
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const hla = params.get("hla");
  const outcome = params.get("outcome");

  if (!hla || !outcome) {
    return NextResponse.json(
      { error: "missing_parameters" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ mentions: getPairMentions(hla, outcome) });
  } catch (error) {
    console.error("Echec de la lecture des mentions :", error);
    return NextResponse.json(
      { error: "mentions_unavailable" },
      { status: 500 },
    );
  }
}
