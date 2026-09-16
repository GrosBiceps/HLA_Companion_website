/**
 * Couverture des correctifs de la revue 1 — volontairement SEPAREE de
 * `epistemic.test.tsx`, dont le contenu est fixe verbatim par le brief de la
 * tache 5 et ne doit pas etre modifie.
 *
 * Ce fichier couvre ce que l'autre ne peut pas voir : la peremption des
 * metriques d'extraction, et le fait que l'encart reste non refermable quand
 * l'avertissement de peremption s'affiche.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EpistemicNotice } from "../components/EpistemicNotice";
import {
  EXTRACTION_METRICS,
  areMetricsStale,
} from "../lib/extraction-metrics";

describe("areMetricsStale", () => {
  it("ne signale rien quand le corpus rendu est celui de la mesure", () => {
    expect(areMetricsStale(EXTRACTION_METRICS.measuredAgainstCorpus)).toBe(
      false,
    );
  });

  it("signale la peremption des que le corpus differe", () => {
    expect(areMetricsStale("B-reel")).toBe(true);
  });
});

describe("EpistemicNotice — peremption des metriques", () => {
  it("n'affiche aucun avertissement sur le corpus de mesure", () => {
    render(
      <EpistemicNotice
        corpusVersion={EXTRACTION_METRICS.measuredAgainstCorpus}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("avertit visiblement quand les metriques viennent d'un autre corpus", () => {
    render(<EpistemicNotice corpusVersion="B-reel" />);
    const alert = screen.getByRole("alert");
    // L'avertissement doit nommer LES DEUX corpus : celui de la mesure et
    // celui affiche. Sans les deux, le lecteur ne peut pas juger de l'ecart.
    expect(alert.textContent).toContain(
      EXTRACTION_METRICS.measuredAgainstCorpus,
    );
    expect(alert.textContent).toContain("B-reel");
  });

  it("reste non refermable meme en etat perime", () => {
    const { container } = render(<EpistemicNotice corpusVersion="B-reel" />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("n'emploie aucun terme causal interdit en etat perime", () => {
    const { container } = render(<EpistemicNotice corpusVersion="B-reel" />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const forbidden of ["associé à", "lié à", "risque de", "prédit"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("rend les metriques depuis le module, pas en dur dans le JSX", () => {
    const { container } = render(<EpistemicNotice />);
    const text = container.textContent ?? "";
    expect(text).toContain(EXTRACTION_METRICS.precisionPct);
    expect(text).toContain(EXTRACTION_METRICS.negationKappa);
    expect(text).toContain(EXTRACTION_METRICS.errorRatePhrase);
  });
});

describe("EpistemicNotice — ordre de lecture", () => {
  it("place le taux d'erreur avant le bloc des metriques", () => {
    const { container } = render(<EpistemicNotice />);
    const text = container.textContent ?? "";
    const errorRateAt = text.indexOf(EXTRACTION_METRICS.errorRatePhrase);
    const metricsBlockAt = text.indexOf("Métriques d'extraction");
    expect(errorRateAt).toBeGreaterThan(-1);
    expect(metricsBlockAt).toBeGreaterThan(-1);
    // Le taux d'erreur est la consequence, pas une metrique parmi d'autres :
    // il ne doit pas cloturer une liste qui se lit comme rassurante.
    expect(errorRateAt).toBeLessThan(metricsBlockAt);
  });

  it("lie explicitement le hasard au texte, pas aux patients", () => {
    const { container } = render(<EpistemicNotice />);
    expect(container.textContent ?? "").toMatch(
      /au hasard\s+dans le texte/i,
    );
  });
});
