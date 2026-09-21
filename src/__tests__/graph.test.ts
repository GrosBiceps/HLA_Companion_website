import { describe, it, expect } from "vitest";
import {
  getNeighborhood,
  getDefaultGraphCenter,
  truncateBySignal,
  GRAPH_NODE_CAP,
  type GraphEdge,
  type GraphNode,
} from "../lib/queries";
import { OUTCOME_LABELS } from "../lib/labels";

describe("getNeighborhood", () => {
  it("retourne le centre et ses voisins directs a profondeur 1", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 1);
    expect(g.nodes.some((n) => n.id === "HLA-DQB1*02:01")).toBe(true);
    expect(g.nodes.length).toBeGreaterThan(1);
    expect(g.edges.length).toBeGreaterThan(0);
  });

  it("toute arete relie deux noeuds presents", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 1);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("profondeur 2 elargit le voisinage", () => {
    const d1 = getNeighborhood("HLA-DQB1*02:01", 1);
    const d2 = getNeighborhood("HLA-DQB1*02:01", 2);
    expect(d2.nodes.length).toBeGreaterThanOrEqual(d1.nodes.length);
  });

  it("chaque noeud porte son type et son libelle affichable", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 1);
    for (const n of g.nodes) {
      expect(["hla", "outcome"]).toContain(n.type);
      expect(n.label).toBeTruthy();
      if (n.type === "outcome") {
        expect(n.label).not.toBe(n.id); // jamais la cle brute
      }
    }
  });

  it("borne la taille du voisinage pour eviter le hairball", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 3);
    expect(g.nodes.length).toBeLessThanOrEqual(150);
  });
});

// --------------------------------------------------------------------------
// Couverture supplementaire (au-dela du brief)
// --------------------------------------------------------------------------

describe("getNeighborhood — navigation bidirectionnelle", () => {
  /**
   * La promesse du graphe est la meme que celle de la fiche complication :
   * on part d'une complication comme on part d'un allele. Si seul le
   * centrage HLA marchait, le graphe ne serait qu'une fiche allele dessinee.
   */
  it("accepte aussi une complication comme centre", () => {
    const g = getNeighborhood("graft_loss", 1);
    expect(g.center?.type).toBe("outcome");
    expect(g.nodes.some((n) => n.id === "graft_loss")).toBe(true);
    expect(g.nodes.some((n) => n.type === "hla")).toBe(true);
    expect(g.edges.length).toBeGreaterThan(0);
  });

  it("le centre complication porte son libelle clinique, pas sa cle", () => {
    const g = getNeighborhood("graft_loss", 1);
    expect(g.center?.label).toBe(OUTCOME_LABELS.graft_loss.label);
    expect(g.center?.label).not.toBe("graft_loss");
  });

  /**
   * Regle transverse du projet, appliquee au graphe : AUCUNE cle technique
   * n'atteint l'ecran. On la verifie sur un voisinage profond, ou les noeuds
   * outcome sont decouverts en chemin (et non resolus comme centre) — c'est
   * le chemin de code ou une cle brute pourrait fuir.
   */
  it("aucun noeud outcome n'expose sa cle technique, meme a profondeur 3", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 3);
    const outcomes = g.nodes.filter((n) => n.type === "outcome");
    expect(outcomes.length).toBeGreaterThan(0);
    for (const n of outcomes) {
      expect(n.label).not.toBe(n.id);
      const known = OUTCOME_LABELS[n.id];
      if (known) expect(n.label).toBe(known.label);
    }
  });

  it("centre inconnu : voisinage vide, pas une exception", () => {
    const g = getNeighborhood("HLA-INEXISTANT*99:99", 2);
    expect(g.center).toBeNull();
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });

  it("profondeur 0 ne rend que le centre, sans arete pendante", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 0);
    expect(g.nodes.length).toBe(1);
    expect(g.edges).toEqual([]);
  });

  /**
   * Monotonie : chaque saut supplementaire ne peut qu'ajouter. Verifie sur
   * les deux natures de centre, parce que la BFS emprunte deux requetes
   * distinctes selon le type du noeud courant.
   */
  it("la croissance est monotone depuis un allele comme depuis un outcome", () => {
    for (const center of ["HLA-DQB1*02:01", "graft_loss"]) {
      const n1 = getNeighborhood(center, 1).nodes.length;
      const n2 = getNeighborhood(center, 2).nodes.length;
      const n3 = getNeighborhood(center, 3).nodes.length;
      expect(n2).toBeGreaterThanOrEqual(n1);
      expect(n3).toBeGreaterThanOrEqual(n2);
    }
  });
});

describe("getNeighborhood — negations et non significatif", () => {
  /**
   * Regle transverse : les negations et le non significatif ne sont JAMAIS
   * masques par defaut. Le corpus A est majoritairement `weak` (110 / 127) :
   * si le defaut filtrait quoi que ce soit, le graphe serait presque vide.
   */
  it("sans minSignal, les aretes faibles sont presentes", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 2);
    expect(g.edges.some((e) => e.signalLevel === "weak")).toBe(true);
    expect(g.edges.some((e) => !e.isSignificant)).toBe(true);
  });

  it("minSignal est un filtre OPTIONNEL, qui retire effectivement", () => {
    const tout = getNeighborhood("HLA-DQB1*02:01", 2);
    const filtre = getNeighborhood("HLA-DQB1*02:01", 2, "clear");
    expect(filtre.edges.length).toBeLessThan(tout.edges.length);
    for (const e of filtre.edges) {
      expect(["inverse", "strong", "clear"]).toContain(e.signalLevel);
    }
    // Le filtre ne doit pas laisser d'arete pendante non plus.
    const ids = new Set(filtre.nodes.map((n) => n.id));
    for (const e of filtre.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("chaque arete porte de quoi rendre son style sans metrique", () => {
    const g = getNeighborhood("HLA-DQB1*02:01", 2);
    for (const e of g.edges) {
      expect(typeof e.signalLevel).toBe("string");
      expect(typeof e.majorityNegative).toBe("boolean");
      // Aucune metrique statistique ne transite par le graphe.
      expect(e).not.toHaveProperty("npmi");
      expect(e).not.toHaveProperty("fdr");
      expect(e).not.toHaveProperty("oddsRatio");
    }
  });
});

describe("truncateBySignal — plafond anti-hairball", () => {
  /**
   * POURQUOI UN TEST SYNTHETIQUE ICI. Le corpus A sature a 54 noeuds
   * (profondeur 5) : il ne peut pas atteindre 150, la garantie serait donc
   * invérifiable via `getNeighborhood`. On teste la LOGIQUE de coupe
   * directement, sur un graphe construit pour depasser le plafond — la
   * garantie porte sur le code, pas sur ce corpus-ci.
   */
  function fauxGraphe(nHla: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes: GraphNode[] = [
      {
        id: "centre",
        type: "outcome",
        label: "Perte du greffon",
        category: "Fonction du greffon",
        distance: 0,
        nMentions: 100,
      },
    ];
    const edges: GraphEdge[] = [];
    for (let i = 0; i < nHla; i++) {
      const id = `HLA-X*${String(i).padStart(3, "0")}`;
      nodes.push({
        id,
        type: "hla",
        label: id,
        category: null,
        distance: 1,
        nMentions: 1,
      });
      // Les 10 premiers portent des signaux forts, le reste est faible.
      const signalLevel =
        i < 4 ? "inverse" : i < 7 ? "strong" : i < 10 ? "clear" : "weak";
      edges.push({
        id: `${id}--centre`,
        source: id,
        target: "centre",
        signalLevel,
        nCooccurrence: 1,
        nNegated: 0,
        isSignificant: signalLevel !== "weak",
        majorityNegative: false,
      });
    }
    return { nodes, edges };
  }

  it("ne coupe rien en dessous du plafond", () => {
    const { nodes, edges } = fauxGraphe(20);
    const out = truncateBySignal(nodes, edges, GRAPH_NODE_CAP);
    expect(out.truncated).toBe(false);
    expect(out.nodes.length).toBe(21);
  });

  it("coupe a 150 noeuds au-dessus du plafond", () => {
    const { nodes, edges } = fauxGraphe(300);
    const out = truncateBySignal(nodes, edges, GRAPH_NODE_CAP);
    expect(out.truncated).toBe(true);
    expect(out.nodes.length).toBe(GRAPH_NODE_CAP);
  });

  it("coupe par force de signal, pas arbitrairement", () => {
    const { nodes, edges } = fauxGraphe(300);
    const out = truncateBySignal(nodes, edges, 11);
    const kept = new Set(out.nodes.map((n) => n.id));
    // Le centre survit toujours.
    expect(kept.has("centre")).toBe(true);
    // Les 10 alleles a signal fort survivent tous...
    for (let i = 0; i < 10; i++) {
      expect(kept.has(`HLA-X*${String(i).padStart(3, "0")}`)).toBe(true);
    }
    // ...et aucun `weak` n'a pris leur place.
    for (const e of out.edges) {
      expect(e.signalLevel).not.toBe("weak");
    }
  });

  it("apres coupe, aucune arete ne pend dans le vide", () => {
    const { nodes, edges } = fauxGraphe(300);
    const out = truncateBySignal(nodes, edges, 40);
    const ids = new Set(out.nodes.map((n) => n.id));
    expect(out.edges.length).toBeGreaterThan(0);
    for (const e of out.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("`inverse` n'est jamais coupe avant `strong` : une piste de protection est une information forte", () => {
    const { nodes, edges } = fauxGraphe(300);
    const out = truncateBySignal(nodes, edges, 5);
    const kept = new Set(out.nodes.map((n) => n.id));
    // 4 noeuds `inverse` + le centre = 5.
    for (let i = 0; i < 4; i++) {
      expect(kept.has(`HLA-X*${String(i).padStart(3, "0")}`)).toBe(true);
    }
  });
});

describe("getDefaultGraphCenter", () => {
  /**
   * Le point d'entree du graphe est CALCULE, pas code en dur : une cle ecrite
   * en dur mentirait a la reconstruction suivante du corpus.
   */
  it("designe un allele reellement present dans le corpus", () => {
    const center = getDefaultGraphCenter();
    expect(center).toBeTruthy();
    const g = getNeighborhood(center as string, 1);
    expect(g.center?.type).toBe("hla");
    expect(g.edges.length).toBeGreaterThan(0);
  });
});

// --------------------------------------------------------------------------
// Garde de routage : la page d'accueil doit mener a une route qui existe.
//
// Meme classe de defaut que celle documentee dans routes.test.ts : la carte
// « Graphe » de l'accueil pointait vers `/graphe` alors que le plan de taches
// pose la route sous `src/app/graph/`. Chaque cote etait correct isolement ;
// le lien menait a un 404. Le defaut ne vit dans aucun des deux modules, il
// vit dans l'accord entre un litteral et une arborescence — seule une
// verification du systeme de fichiers peut le voir.
// --------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";

describe("routage de l'explorateur de graphe", () => {
  it("les liens statiques de l'accueil menent a une page existante", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "page.tsx"),
      "utf-8",
    );
    const hrefs = [...source.matchAll(/href="\/([a-zA-Z0-9_-]+)"/g)].map(
      (m) => m[1],
    );

    expect(hrefs).toContain("graph");
    for (const segment of hrefs) {
      const page = path.join(process.cwd(), "src", "app", segment, "page.tsx");
      const dir = path.join(process.cwd(), "src", "app", segment);
      const hasDynamic =
        fs.existsSync(dir) &&
        fs
          .readdirSync(dir)
          .some(
            (name) =>
              name.startsWith("[") &&
              fs.existsSync(path.join(dir, name, "page.tsx")),
          );
      expect(
        fs.existsSync(page) || hasDynamic,
        `l'accueil pointe vers /${segment} mais aucune page n'existe sous src/app/${segment}/`,
      ).toBe(true);
    }
  });

  it("le handler d'API du graphe existe la ou le composant l'appelle", () => {
    const component = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "GraphExplorer.tsx"),
      "utf-8",
    );
    expect(component).toContain("/api/graph?");
    expect(
      fs.existsSync(
        path.join(process.cwd(), "src", "app", "api", "graph", "route.ts"),
      ),
    ).toBe(true);
  });
});
