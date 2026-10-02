import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Effectifs de la carte v1 (etude precedente, donnees REELLES), lus dans
 * `data/legacy/carte_v1_renal.json` plutot qu'ecrits en dur. `null` si le
 * fichier est absent ou illisible : l'accueil omet alors la mention chiffree.
 */
export function getLegacyMapSize(): { nodes: number; edges: number } | null {
  try {
    const raw = readFileSync(
      path.join(process.cwd(), "data", "legacy", "carte_v1_renal.json"),
      "utf-8",
    );
    const data = JSON.parse(raw) as { nodes?: unknown[]; edges?: unknown[] };
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null;
    return { nodes: data.nodes.length, edges: data.edges.length };
  } catch {
    return null;
  }
}
