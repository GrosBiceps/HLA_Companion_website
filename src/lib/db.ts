/**
 * Acces SQLite — singleton, LECTURE SEULE.
 *
 * ⚠ SERVEUR UNIQUEMENT. `better-sqlite3` est un module natif : il ne peut pas
 * etre importe depuis un Client Component. Toute requete passe par un Server
 * Component ou un Route Handler.
 *
 * La base est un artefact de build scelle : aucune ecriture n'est possible
 * depuis l'interface, le handle est ouvert avec `readonly: true`.
 */

// Transforme un import depuis un Client Component en erreur de build nommee
// ("This module cannot be imported from a Client Component module") plutot
// qu'en "Module not found: Can't resolve 'fs'" illisible.
// Alias vers un stub sous Vitest (cf. vitest.config.mts).
import "server-only";
import Database from "better-sqlite3";
import path from "node:path";
import type { CorpusVersion } from "./types";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  // `db.open` garde le cas ou un chemin de fermeture serait ajoute plus tard :
  // un handle ferme est reouvert au lieu d'etre resservi. Si une telle
  // fermeture apparait, elle doit aussi remettre `cachedVersion` a null.
  if (db && db.open) return db;
  const file =
    process.env.CORPUS_DB_PATH ??
    path.join(process.cwd(), "dist", "corpus_A_synthetic.sqlite");
  db = new Database(file, { readonly: true, fileMustExist: true });
  db.pragma("foreign_keys = ON");
  return db;
}

interface CorpusVersionRow {
  version: string;
  universe: string;
  built_at: string;
  n_articles: number;
  is_synthetic: number;
  notes: string | null;
}

let cachedVersion: CorpusVersion | null = null;

/**
 * Metadonnees de build du corpus. La table `corpus_version` ne contient
 * qu'une ligne (le builder la scelle a chaque reconstruction).
 */
export function getCorpusVersion(): CorpusVersion {
  if (cachedVersion) return cachedVersion;
  const row = getDb()
    .prepare(
      `SELECT version, universe, built_at, n_articles, is_synthetic, notes
         FROM corpus_version
        ORDER BY built_at DESC
        LIMIT 1`,
    )
    .get() as CorpusVersionRow | undefined;

  if (!row) {
    throw new Error(
      "corpus_version est vide : la base n'a pas ete construite correctement.",
    );
  }

  cachedVersion = {
    version: row.version,
    universe: row.universe,
    builtAt: row.built_at,
    nArticles: row.n_articles,
    isSynthetic: row.is_synthetic === 1,
    notes: row.notes,
  };
  return cachedVersion;
}
