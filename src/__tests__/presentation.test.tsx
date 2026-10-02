import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { OUTCOME_LABELS } from "../lib/labels";
import { NAV_ITEMS } from "../components/shell/nav";

const { default: PresentationPage } = await import("../app/presentation/page");

describe("page /presentation (rendu)", () => {
  const renderPage = () => {
    const { container } = render(<PresentationPage />);
    return { container, text: container.textContent ?? "" };
  };

  it("est dans la navigation, juste apres l'accueil", () => {
    expect(NAV_ITEMS[0].href).toBe("/");
    expect(NAV_ITEMS[1].href).toBe("/presentation");
    expect(NAV_ITEMS[1].label).toBe("Présentation");
  });

  it("porte l'encart epistemique complet", () => {
    const { container, text } = renderPage();
    expect(container.querySelector("#epistemic-notice-title")).not.toBeNull();
    expect(container.querySelector("#cadrage")).not.toBeNull();
    expect(text).toMatch(/pas des associations cliniques ni causales/i);
    expect(text).toMatch(/78,75/);
    expect(text).toMatch(/0,44/);
  });

  it("rend les sections deplacees depuis l'accueil et un sommaire", () => {
    const { container } = renderPage();
    for (const id of ["cadrage", "corpus", "gestes", "signaux", "entrees", "contexte"]) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull();
    }
    expect(
      container.querySelectorAll('nav[aria-label="Sommaire de la présentation"]').length,
    ).toBeGreaterThan(0);
    expect(container.querySelector("#corpus")!.textContent).toMatch(/Le corpus en chiffres/);
  });

  it("relie les pages principales", () => {
    const { container } = renderPage();
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const h of [
      "/graph",
      "/matrice",
      "/allele",
      "/complication",
      "/methode",
      "/carte-v1",
      "/guide",
    ]) {
      expect(hrefs).toContain(h);
    }
  });

  it("garde les trois gestes et la legende compacte des niveaux", () => {
    const { container } = renderPage();
    const steps = container.querySelector("#demarche-titre")?.closest("section");
    expect(steps).not.toBeNull();
    expect(steps!.querySelectorAll("ol > li")).toHaveLength(3);
    const guide = [...steps!.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/guide");
    expect(guide?.textContent).toMatch(/Ouvrir le guide complet/);
    for (const label of ["fort", "net", "modéré", "faible", "inverse"]) {
      expect(steps!.textContent).toContain(`Signal ${label}`);
    }
  });

  it("propose les quatre portes « Par où commencer ? »", () => {
    const { container } = renderPage();
    const entrees = container.querySelector("#entrees")!;
    expect(entrees.textContent).toMatch(/Par où commencer/);
    const hrefs = [...entrees.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const h of ["/allele", "/complication", "/matrice", "/graph"]) {
      expect(hrefs).toContain(h);
    }
  });

  it("n'affiche aucune metrique brute d'association", () => {
    const { text } = renderPage();
    expect(text).not.toMatch(/NPMI|odds ratio|\bFDR\b|p\s*=\s*0|IC 95/i);
  });

  it("n'emploie aucun terme causal proscrit", () => {
    const { text } = renderPage();
    const lower = text.toLowerCase();
    for (const term of ["associé à", "lié à", "risque de", "prédit", "provoque", "entraîne"]) {
      expect(lower).not.toContain(term);
    }
  });

  it("n'affiche aucune cle technique de complication comme texte", () => {
    const { container, text } = renderPage();
    // Les cles a souligne (graft_loss...) ne doivent jamais apparaitre ;
    // les sigles (DSA, ABMR) n'apparaissent qu'entre parentheses dans un
    // libelle, ou dans une phrase source citee.
    for (const key of Object.keys(OUTCOME_LABELS).filter((k) => k.includes("_"))) {
      expect(text).not.toContain(key);
    }
    for (const el of container.querySelectorAll("a, li, span, p, h3")) {
      if (el.children.length > 0) continue;
      const own = (el.textContent ?? "").trim();
      expect(Object.keys(OUTCOME_LABELS)).not.toContain(own);
    }
  });
});
