import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../lib/db";
import type { EntityType } from "../lib/types";

/**
 * LES ROUTES DE LA RECHERCHE DOIVENT EXISTER SUR LE DISQUE.
 *
 * Ce fichier existe a cause d'un bug reel : les fiches complication et auteur
 * avaient ete construites sous `/outcome/` et `/author/`, alors que
 * `SearchBar.hrefFor` emettait `/complication/` et `/auteur/`. Les deux cotes
 * etaient corrects isolement, chacun couvert par ses tests, et pourtant 61
 * entrees de l'index de recherche (19 complications + 42 auteurs) pointaient
 * vers des 404.
 *
 * Le defaut etait invisible aux tests unitaires parce qu'il ne vit dans aucun
 * des deux modules : il vit dans l'ACCORD entre un littéral de chaine et une
 * arborescence de dossiers. Le routage de Next etant fonde sur les fichiers,
 * seule une verification du systeme de fichiers peut le voir.
 *
 * `AssociationCard` ne porte aucun href : la recherche est l'unique porte
 * d'entree vers ces fiches. Un prefixe desaccorde ne degrade donc pas la
 * navigation, il supprime la fonctionnalite entiere.
 */

const APP_DIR = path.join(process.cwd(), "src", "app");

/**
 * Prefixes emis par `SearchBar.hrefFor`, recopies ici volontairement.
 *
 * `hrefFor` n'est pas exporte et SearchBar est un composant preexistant qu'on
 * ne modifie pas pour les besoins d'un test. La duplication est donc assumee,
 * mais elle est SURVEILLEE : le test suivant relit le source de SearchBar et
 * echoue si un prefixe y apparait qui ne figure pas dans cette table.
 */
const EXPECTED_PREFIX: Record<EntityType, string> = {
  allele: "allele",
  outcome: "complication",
  article: "article",
  author: "auteur",
};

/** Dossier de route dynamique sous `src/app/<prefix>/`, ou null. */
function dynamicSegmentOf(prefix: string): string | null {
  const dir = path.join(APP_DIR, prefix);
  if (!fs.existsSync(dir)) return null;
  const entry = fs
    .readdirSync(dir)
    .find((name) => name.startsWith("[") && name.endsWith("]"));
  if (!entry) return null;
  return fs.existsSync(path.join(dir, entry, "page.tsx")) ? entry : null;
}

describe("routes de la recherche", () => {
  it("chaque type d'entite a une route dynamique sur le disque", () => {
    for (const [entityType, prefix] of Object.entries(EXPECTED_PREFIX)) {
      const segment = dynamicSegmentOf(prefix);
      expect(
        segment,
        `aucune page dynamique sous src/app/${prefix}/ pour « ${entityType} »`,
      ).not.toBeNull();
    }
  });

  it("SearchBar n'emet aucun prefixe hors de ceux couverts ci-dessus", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "SearchBar.tsx"),
      "utf-8",
    );
    // Tous les littéraux de route de la forme `/xxx/${...}`.
    const emitted = [
      ...source.matchAll(/`\/([a-zA-Z0-9_-]+)\/\$\{/g),
    ].map((m) => m[1]);

    expect(emitted.length).toBeGreaterThan(0);
    const known = new Set(Object.values(EXPECTED_PREFIX));
    for (const prefix of emitted) {
      expect(
        known.has(prefix),
        `SearchBar emet /${prefix}/ — prefixe inconnu de EXPECTED_PREFIX, ` +
          `et donc non verifie contre l'arborescence des routes`,
      ).toBe(true);
    }
    // Reciproquement : chaque prefixe attendu est bien emis par SearchBar.
    for (const prefix of known) {
      expect(emitted).toContain(prefix);
    }
  });

  it("toute entree de l'index de recherche mene a une route existante", () => {
    const rows = getDb()
      .prepare("SELECT DISTINCT entity_type FROM search_index")
      .all() as { entity_type: EntityType }[];

    expect(rows.length).toBeGreaterThan(0);
    for (const { entity_type } of rows) {
      const prefix = EXPECTED_PREFIX[entity_type];
      expect(prefix, `type d'entite non route : ${entity_type}`).toBeTruthy();
      expect(dynamicSegmentOf(prefix)).not.toBeNull();
    }
  });
});

describe("hygiene des sources", () => {
  /**
   * Un octet NUL rend un fichier binaire aux yeux de git : plus de diff, plus
   * de blame, plus de fusion propre — et une revue de code qui ne voit rien.
   * Le cas s'est produit sur la fiche article (separateur `\x00` dans une cle
   * de Map).
   */
  it("aucun fichier source ne contient d'octet NUL", () => {
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx|css|mts)$/.test(entry.name)) {
          if (fs.readFileSync(full).includes(0)) offenders.push(full);
        }
      }
    };
    walk(path.join(process.cwd(), "src"));

    expect(offenders).toEqual([]);
  });
});
