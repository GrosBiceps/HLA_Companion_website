import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { OUTCOME_LABELS } from "../lib/labels";
import { NAV_ITEMS } from "../components/shell/nav";
import {
  FIRST_VISIT_KEY,
  FirstVisitHint,
} from "../components/landing/FirstVisitHint";

// Les liens du guide passent par next/link (aucun routeur requis en rendu).
const { default: GuidePage } = await import("../app/guide/page");

const APP_DIR = path.join(process.cwd(), "src", "app");

/** Une route interne existe sur le disque (page statique ou segment dynamique). */
function routeExists(href: string): boolean {
  const clean = href.split("#")[0].split("?")[0];
  if (clean === "" || clean === "/") return true;
  const parts = clean.replace(/^\//, "").split("/");
  let dir = APP_DIR;
  for (const [i, part] of parts.entries()) {
    const direct = path.join(dir, part);
    if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
      dir = direct;
      if (i === parts.length - 1) return fs.existsSync(path.join(dir, "page.tsx"));
      continue;
    }
    const dynamic = fs.existsSync(dir)
      ? fs.readdirSync(dir).find((n) => n.startsWith("[") && n.endsWith("]"))
      : undefined;
    if (!dynamic || i !== parts.length - 1) return false;
    return fs.existsSync(path.join(dir, dynamic, "page.tsx"));
  }
  return false;
}

describe("page /guide (rendu)", () => {
  const renderPage = () => {
    const { container } = render(<GuidePage />);
    return { container, text: container.textContent ?? "" };
  };

  it("est dans la navigation et existe sur le disque", () => {
    expect(NAV_ITEMS.map((n) => n.href)).toContain("/guide");
    expect(fs.existsSync(path.join(APP_DIR, "guide", "page.tsx"))).toBe(true);
  });

  it("porte un seul h1 et toutes les sections attendues", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")?.textContent).toMatch(/Guide d.utilisation/);
    for (const id of [
      "taches",
      "lire",
      "signaux",
      "carte",
      "recherche",
      "faq",
      "glossaire",
      "cadrage",
    ]) {
      expect(container.querySelector(`section#${id}`), id).not.toBeNull();
    }
    // Chaque entree du sommaire (desktop + mobile) vise une ancre existante.
    const anchors = [...container.querySelectorAll('nav a[href^="#"]')].map((a) =>
      a.getAttribute("href")!.slice(1),
    );
    expect(anchors.length).toBeGreaterThanOrEqual(8);
    for (const id of anchors) expect(container.querySelector(`#${id}`), id).not.toBeNull();
  });

  it("propose les cartes « Que voulez-vous faire ? » avec leurs destinations", () => {
    const { container } = renderPage();
    const cards = container.querySelectorAll("#taches ul > li");
    expect(cards.length).toBeGreaterThanOrEqual(5);
    expect(cards.length).toBeLessThanOrEqual(7);
    const hrefs = [...container.querySelectorAll("#taches a")].map((a) =>
      a.getAttribute("href"),
    );
    for (const h of ["/allele", "/complication", "/matrice", "/graph", "/carte-v1"]) {
      expect(hrefs).toContain(h);
    }
  });

  it("contient le parcours en trois etapes, la legende et le cadrage complet", () => {
    const { container, text } = renderPage();
    expect(container.querySelectorAll("#lire ol > li")).toHaveLength(3);
    expect(text).toMatch(/De l.allèle aux phrases sources, en deux clics/);
    for (const label of ["fort", "net", "modéré", "faible", "inverse"]) {
      expect(container.querySelector("#signaux")?.textContent).toContain(`Signal ${label}`);
    }
    expect(container.querySelector("#epistemic-notice-title")).not.toBeNull();
    expect(text).toMatch(/78,75/);
    expect(text).toMatch(/pas des associations cliniques ni causales/i);
  });

  it("documente la recherche, les raccourcis et la FAQ", () => {
    const { container } = renderPage();
    const search = container.querySelector("#recherche")!.textContent ?? "";
    for (const q of ["HLA-DQB1*02:01", "DQB1 02 01", "A*02", "rejet humoral"]) {
      expect(search).toContain(q);
    }
    expect(search).toMatch(/Ctrl/);
    expect(container.querySelectorAll("#faq details")).toHaveLength(5);
    const faq = container.querySelector("#faq")!.textContent ?? "";
    expect(faq).toMatch(/Pourquoi tant de signaux faibles/);
    expect(faq).toMatch(/Qu.est-ce qu.une co-occurrence/);
    expect(faq).toMatch(/Les données sont-elles réelles/);
    expect(faq).toMatch(/synthétique/);
    expect(faq).toMatch(/signal inverse/);
  });

  it("les sérotypes sont expliqués et liés vers /serotype", () => {
    const { container, text } = renderPage();
    expect(text).toMatch(/Sérotypes \(par exemple/);
    expect(text).not.toMatch(/à venir selon disponibilité/);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/serotype");
  });

  it("tous les liens internes menent a une route existante", () => {
    const { container } = renderPage();
    const hrefs = [...container.querySelectorAll("a")]
      .map((a) => a.getAttribute("href"))
      .filter((h): h is string => !!h && h.startsWith("/"));
    expect(hrefs.length).toBeGreaterThan(8);
    for (const h of hrefs) {
      expect(routeExists(h), `lien mort : ${h}`).toBe(true);
    }
    // Le test de resolution lui-meme n'est pas complaisant.
    expect(routeExists("/nexiste-pas")).toBe(false);
  });

  it("n'affiche aucune metrique brute d'association", () => {
    const { text } = renderPage();
    expect(text).not.toMatch(/NPMI|odds ratio|\bFDR\b|p\s*=\s*0|IC 95|\bOR\s*=/i);
  });

  it("n'emploie aucun terme causal proscrit", () => {
    const lower = renderPage().text.toLowerCase();
    for (const term of [
      "associé à",
      "associés à",
      "lié à",
      "liés à",
      "risque de",
      "prédit",
      "provoque",
      "entraîne",
      "à cause de",
      "responsable de",
    ]) {
      expect(lower).not.toContain(term);
    }
  });

  it("n'affiche aucune cle technique de complication", () => {
    const { text } = renderPage();
    for (const key of Object.keys(OUTCOME_LABELS).filter((k) => k.includes("_"))) {
      expect(text).not.toContain(key);
    }
  });
});

describe("FirstVisitHint (rappel de premiere visite)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("s'affiche a la premiere visite et mene au guide", async () => {
    window.localStorage.clear();
    await act(async () => {
      render(<FirstVisitHint />);
    });
    const hint = screen.getByTestId("first-visit-hint");
    expect(hint.textContent).toMatch(/Première visite/);
    expect(hint.querySelector('a[href="/guide"]')).not.toBeNull();
  });

  it("n'affiche rien au premier rendu (pas d'ecart d'hydratation)", async () => {
    // @ts-expect-error -- react-dom/server n'a pas de types dans ce depot.
    const { renderToString } = await import("react-dom/server");
    expect(renderToString(<FirstVisitHint />)).toBe("");
  });

  it("se ferme et memorise le refus", async () => {
    await act(async () => {
      render(<FirstVisitHint />);
    });
    fireEvent.click(screen.getByRole("button", { name: /fermer/i }));
    expect(screen.queryByTestId("first-visit-hint")).toBeNull();
    expect(window.localStorage.getItem(FIRST_VISIT_KEY)).toBe("1");
  });

  it("ne reapparait pas une fois ferme", async () => {
    window.localStorage.setItem(FIRST_VISIT_KEY, "1");
    await act(async () => {
      render(<FirstVisitHint />);
    });
    expect(screen.queryByTestId("first-visit-hint")).toBeNull();
  });

  it("fonctionne sans stockage (acces leve une exception)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await act(async () => {
      render(<FirstVisitHint />);
    });
    expect(screen.getByTestId("first-visit-hint")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /fermer/i }));
    expect(screen.queryByTestId("first-visit-hint")).toBeNull();
  });
});
