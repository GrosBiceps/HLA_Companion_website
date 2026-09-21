import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssociationCard } from "../components/AssociationCard";
import type { AssociationRow } from "../lib/types";

const base: AssociationRow = {
  hla: "HLA-DQB1*02:01",
  outcome: "DSA",
  label: "Anticorps anti-HLA du donneur (DSA)",
  category: "Immunisation",
  nCooccurrence: 18,
  nPositive: 14,
  nNegated: 4,
  signalLevel: "strong",
  isSignificant: true,
  firstYear: 1998,
  npmi: 0.61,
  oddsRatio: 8.4,
  orCiLow: 4.1,
  orCiHigh: 17.2,
  fdr: 2.3e-7,
  fdrTwoSided: 4.6e-7,
};

describe("AssociationCard", () => {
  it("affiche le libelle clinique, jamais la cle technique", () => {
    render(<AssociationCard association={base} />);
    expect(screen.getByText(/Anticorps anti-HLA du donneur/)).toBeTruthy();
    const { container } = render(<AssociationCard association={base} />);
    expect(container.textContent).not.toMatch(/\bgraft_loss\b|\brecurrent_GN\b/);
  });

  it("affiche le nombre d'articles en clair", () => {
    render(<AssociationCard association={base} />);
    expect(screen.getByText(/18 articles/)).toBeTruthy();
  });

  it("signale les mentions negatives sans les masquer", () => {
    render(<AssociationCard association={base} />);
    expect(screen.getByText(/4 .*sens négatif/i)).toBeTruthy();
  });

  /**
   * ⚠ AMENDEMENT AU TEST DU BRIEF (seul ecart, documente).
   *
   * Le brief ecrivait `container.textContent`, en supposant qu'un <details>
   * FERME soustrait son contenu au texte du conteneur. C'est faux : la
   * propriete `textContent` du DOM concatene TOUS les noeuds texte
   * descendants, `open` ou non. Le couple de tests du brief etait donc
   * insatisfiable — `details ⊂ container`, donc aucun rendu ne peut a la fois
   * exclure /NPMI/ du conteneur et l'inclure dans le depliant qu'il contient.
   *
   * On conserve l'INTENTION exacte de l'auteur — « aucune metrique dans ce
   * que l'utilisateur voit sans agir » — en mesurant le texte VISIBLE, c'est
   * a dire le conteneur prive du depliant. La contrainte reste mordante :
   * elle echoue des qu'une valeur ou un nom de metrique remonte hors du
   * <details>.
   */
  it("ne montre aucune metrique statistique par defaut", () => {
    const { container } = render(<AssociationCard association={base} />);
    const visible = container.cloneNode(true) as HTMLElement;
    visible.querySelectorAll("details").forEach((d) => d.remove());
    const text = visible.textContent ?? "";
    expect(text).not.toContain("0.61");
    expect(text).not.toContain("8.4");
    expect(text).not.toMatch(/NPMI|FDR|odds ratio/i);
  });

  it("expose les metriques derriere un depliant", () => {
    const { container } = render(<AssociationCard association={base} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details!.textContent).toMatch(/NPMI/i);
  });

  it("grise le non-significatif au lieu de le masquer", () => {
    const weak = { ...base, signalLevel: "weak" as const, isSignificant: false };
    const { container } = render(<AssociationCard association={weak} />);
    expect(container.textContent).toMatch(/seuil/i);
    expect(container.textContent).toContain("18 articles");
  });

  it("distingue le signal inverse", () => {
    const inv = { ...base, signalLevel: "inverse" as const, oddsRatio: 0.3 };
    render(<AssociationCard association={inv} />);
    expect(screen.getByText(/signal inverse/i)).toBeTruthy();
  });
});
