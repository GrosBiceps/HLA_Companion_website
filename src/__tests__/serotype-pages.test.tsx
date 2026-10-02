import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import SerotypePage from "../app/serotype/[serotype]/page";
import SerotypeIndexPage from "../app/serotype/page";
import { OUTCOME_LABELS } from "../lib/labels";

/**
 * Pages serotype : memes garde-fous que le reste du site, verifies sur le
 * RENDU (aucun terme causal, aucune cle technique, aucune metrique brute),
 * plus la fonction propre a ces pages : relier un serotype a ses alleles.
 */

vi.mock("next/navigation", async (orig) => {
  const actual = await orig<typeof import("next/navigation")>();
  return {
    ...actual,
    notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
    },
    redirect: (to: string) => {
      throw new Error(`NEXT_REDIRECT:${to}`);
    },
  };
});

const CAUSAL = [
  "associé à",
  "associée à",
  "lié à",
  "liée à",
  "risque de",
  "prédit",
  "provoque",
  "entraîne",
  "à cause de",
  "responsable de",
];
const METRICS = ["npmi", "odds ratio", "fdr", "ic 95", "p-valeur", "p =", "p<"];

async function renderSerotype(key: string) {
  return render(await SerotypePage({ params: Promise.resolve({ serotype: key }) }));
}

const allele = (hla: string) => `a[href="/allele/${encodeURIComponent(hla)}"]`;

describe("fiche serotype", () => {
  it("DR15 : en-tete, explication, alleles 2-digit et 4-digit, fil d'Ariane", async () => {
    const { container } = await renderSerotype("DR15");
    expect(container.querySelector("h1")?.textContent).toBe("DR15");
    expect(container.textContent).toContain("Sérotype et allèle : deux notations");
    expect(container.querySelector(allele("HLA-DRB1*15"))).not.toBeNull();
    expect(container.querySelector(allele("HLA-DRB1*15:01"))).not.toBeNull();
    const nav = container.querySelector('nav[aria-label="Fil d\'Ariane du sérotype"]')!;
    expect(nav.querySelector('a[href="/serotype"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/serotype/DR2"]')).not.toBeNull(); // famille large
    expect(container.querySelector('a[href^="/graph?center="]')).not.toBeNull();
  });

  it("liste les complications co-mentionnees avec un lien vers leur fiche", async () => {
    const { container } = await renderSerotype("DQ2");
    expect(container.querySelector('a[href^="/complication/"]')).not.toBeNull();
    const text = container.textContent ?? "";
    for (const key of Object.keys(OUTCOME_LABELS)) {
      if (key.includes("_")) expect(text).not.toContain(key);
    }
  });

  it("DQ8 : un seul allele, DQB1*03:02", async () => {
    const { container } = await renderSerotype("DQ8");
    expect(container.querySelector(allele("HLA-DQB1*03:02"))).not.toBeNull();
    expect(container.querySelectorAll('a[href^="/allele/HLA-DQB1"]').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector(allele("HLA-DQB1*02:01"))).toBeNull();
  });

  it("une famille large montre ses specificites plus fines", async () => {
    const { container } = await renderSerotype("DR2");
    expect(container.querySelector('a[href="/serotype/DR15"]')).not.toBeNull();
    expect(container.querySelector('a[href="/serotype/DR16"]')).not.toBeNull();
  });

  it("n'expose aucune metrique brute ni terme causal", async () => {
    for (const key of ["DR15", "A2", "B27", "Cw7", "DR51"]) {
      const { container, unmount } = await renderSerotype(key);
      const text = (container.textContent ?? "").toLowerCase();
      for (const c of CAUSAL) expect(text, `${key}: ${c}`).not.toContain(c);
      for (const m of METRICS) expect(text, `${key}: ${m}`).not.toContain(m);
      unmount();
    }
  });

  it("redirige une graphie approchee et 404 sur un inconnu", async () => {
    await expect(renderSerotype("dr15")).rejects.toThrow("NEXT_REDIRECT:/serotype/DR15");
    await expect(renderSerotype("c7")).rejects.toThrow("NEXT_REDIRECT:/serotype/Cw7");
    await expect(renderSerotype("ZZ99")).rejects.toThrow("NEXT_NOT_FOUND");
    // un pourcentage invalide ne doit pas lever autre chose qu'un 404
    await expect(renderSerotype("%ZZ")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("index des serotypes", () => {
  it("range les serotypes par locus et relie chaque carte a sa fiche", () => {
    const { container } = render(SerotypeIndexPage());
    for (const locus of ["A", "B", "C", "DR", "DQ", "DP"]) {
      expect(container.querySelector(`#locus-${locus}`), locus).not.toBeNull();
    }
    for (const id of ["DR15", "A2", "B27", "DQ2", "Cw7", "DR51", "DQ8"]) {
      expect(container.querySelector(`a[href="/serotype/${id}"]`), id).not.toBeNull();
    }
    expect(container.querySelector('input[type="search"]')).not.toBeNull();
  });

  it("le filtre comprend un serotype (« dr 15 ») et un allele (« DRB1*15 »)", () => {
    const { container } = render(SerotypeIndexPage());
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "dr 15" } });
    expect(container.querySelector('a[href="/serotype/DR15"]')).not.toBeNull();
    expect(container.querySelector('a[href="/serotype/DR4"]')).toBeNull();
    fireEvent.change(input, { target: { value: "DQB1*03:02" } });
    expect(container.querySelector('a[href="/serotype/DQ8"]')).not.toBeNull();
    expect(container.querySelector('a[href="/serotype/DR15"]')).toBeNull();
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(container.textContent).toContain("Aucun sérotype ne correspond");
  });

  it("n'expose aucun terme causal", () => {
    const { container } = render(SerotypeIndexPage());
    const text = (container.textContent ?? "").toLowerCase();
    for (const c of CAUSAL) expect(text).not.toContain(c);
  });
});
