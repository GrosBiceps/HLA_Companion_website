import { NextRequest, NextResponse } from "next/server";
import { searchEntities } from "@/lib/queries";

/**
 * Recherche unifiee — le seul pont entre le SearchBar (Client Component) et
 * la base. `better-sqlite3` est natif : le client ne peut pas l'importer, il
 * passe donc par ce Route Handler.
 */
export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json({ hits: searchEntities(q) });
}
