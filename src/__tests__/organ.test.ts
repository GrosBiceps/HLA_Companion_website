import { describe, it, expect } from "vitest";
import {
  ALL_ORGANS,
  ORGANS,
  ORGAN_KEYS,
  ORGAN_PARAM,
  extractOrganHint,
  foldText,
  isOrganKey,
  isOrganSelection,
  organFromPage,
  organFromSearchParams,
  organLabel,
  organShortLabel,
  organSlug,
  parseOrganParam,
  serializeOrgan,
  withOrgan,
  withoutOrgan,
} from "../lib/organ";
import { graphHref, entityHref } from "../lib/graph-url";

/**
 * Aides d'URL de l'organe : lecture, ecriture et report sur les liens. L'URL
 * est la seule source de verite de la strate (`?organe=coeur`) : ces fonctions
 * sont ce qui la fait voyager de page en page.
 */

describe("vocabulaire des organes", () => {
  it("sept organes, cles stables, libelles francais accentues", () => {
    expect(ORGAN_KEYS).toEqual([
      "kidney",
      "liver",
      "heart",
      "lung",
      "hsct",
      "pancreas",
      "intestine",
    ]);
    expect(organLabel("heart")).toBe("Cœur");
    expect(organLabel("hsct")).toContain("hématopoïétiques");
    expect(organShortLabel("hsct")).toBe("GCSH");
    expect(organLabel(ALL_ORGANS)).toBe("Tous les organes");
  });

  it("slugs francais sans accent, uniques, jamais egaux a une cle anglaise (sauf pancreas)", () => {
    const slugs = ORGANS.map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z]+$/);
    expect(organSlug("heart")).toBe("coeur");
    expect(organSlug("kidney")).toBe("rein");
    expect(organSlug(ALL_ORGANS)).toBeNull();
  });

  it("reconnait une cle et une selection", () => {
    expect(isOrganKey("liver")).toBe(true);
    expect(isOrganKey("all")).toBe(false);
    expect(isOrganSelection("all")).toBe(true);
    expect(isOrganSelection("brain")).toBe(false);
    expect(isOrganSelection(undefined)).toBe(false);
  });
});

describe("parseOrganParam", () => {
  it("lit un slug, une cle, avec casse et accents libres", () => {
    expect(parseOrganParam("coeur")).toBe("heart");
    expect(parseOrganParam("Cœur")).toBe("heart");
    expect(parseOrganParam("COEUR")).toBe("heart");
    expect(parseOrganParam("heart")).toBe("heart");
    expect(parseOrganParam("pancréas")).toBe("pancreas");
    expect(parseOrganParam("GCSH")).toBe("hsct");
    expect(parseOrganParam(" foie ")).toBe("liver");
  });

  it("une valeur absente, vide, multiple ou inconnue vaut « tous les organes »", () => {
    expect(parseOrganParam(undefined)).toBe(ALL_ORGANS);
    expect(parseOrganParam(null)).toBe(ALL_ORGANS);
    expect(parseOrganParam("")).toBe(ALL_ORGANS);
    expect(parseOrganParam("cerveau")).toBe(ALL_ORGANS);
    expect(parseOrganParam("tous")).toBe(ALL_ORGANS);
    expect(parseOrganParam("all")).toBe(ALL_ORGANS);
    // Valeur multiple : la premiere est lue ; si elle est inconnue, tous.
    expect(parseOrganParam(["foie", "rein"])).toBe("liver");
    expect(parseOrganParam(["x", "rein"])).toBe(ALL_ORGANS);
  });

  it("round-trip : serializeOrgan puis parseOrganParam", () => {
    for (const key of ORGAN_KEYS) {
      expect(parseOrganParam(serializeOrgan(key))).toBe(key);
    }
    expect(serializeOrgan(ALL_ORGANS)).toBeNull();
  });

  it("organFromSearchParams accepte URLSearchParams et un objet Next", () => {
    expect(organFromSearchParams(new URLSearchParams("organe=poumon"))).toBe("lung");
    expect(organFromSearchParams({ organe: "intestin" })).toBe("intestine");
    expect(organFromSearchParams({ organe: ["rein", "foie"] })).toBe("kidney");
    expect(organFromSearchParams({})).toBe(ALL_ORGANS);
    expect(organFromSearchParams(null)).toBe(ALL_ORGANS);
    expect(organFromSearchParams(undefined)).toBe(ALL_ORGANS);
  });

  it("organFromPage resout la promesse searchParams de Next 16", async () => {
    expect(await organFromPage(Promise.resolve({ organe: "gcsh" }))).toBe("hsct");
    expect(await organFromPage(undefined)).toBe(ALL_ORGANS);
  });
});

describe("withOrgan : report de la strate sur un lien interne", () => {
  it("ajoute le parametre a une route nue", () => {
    expect(withOrgan("/allele", "heart")).toBe("/allele?organe=coeur");
    expect(withOrgan("/", "kidney")).toBe("/?organe=rein");
  });

  it("conserve les autres parametres (ordre, encodage) et l'ancre", () => {
    expect(withOrgan("/matrice?resolution=4-digit&locus=B", "liver")).toBe(
      "/matrice?resolution=4-digit&locus=B&organe=foie",
    );
    expect(withOrgan("/complication#cat-rejet", "lung")).toBe(
      "/complication?organe=poumon#cat-rejet",
    );
    expect(withOrgan("/graph?center=HLA-DQB1*02%3A01&depth=2", "hsct")).toBe(
      "/graph?center=HLA-DQB1*02%3A01&depth=2&organe=gcsh",
    );
  });

  it("remplace un parametre organe existant, ne le duplique jamais", () => {
    expect(withOrgan("/allele?organe=rein", "heart")).toBe("/allele?organe=coeur");
    expect(withOrgan("/allele?organe=rein&x=1", "heart")).toBe("/allele?x=1&organe=coeur");
    expect((withOrgan("/a?organe=rein", "liver").match(/organe=/g) ?? []).length).toBe(1);
  });

  it("pour « tous les organes », retire le parametre et laisse le reste intact", () => {
    expect(withOrgan("/allele?organe=coeur", ALL_ORGANS)).toBe("/allele");
    expect(withoutOrgan("/matrice?resolution=4-digit&organe=foie")).toBe(
      "/matrice?resolution=4-digit",
    );
    expect(withOrgan("/graph?center=HLA-DQB1*02%3A01", ALL_ORGANS)).toBe(
      "/graph?center=HLA-DQB1*02%3A01",
    );
  });

  it("n'altere ni les liens externes, ni les ancres seules, ni l'API", () => {
    expect(withOrgan("https://pubmed.ncbi.nlm.nih.gov/123/", "heart")).toBe(
      "https://pubmed.ncbi.nlm.nih.gov/123/",
    );
    expect(withOrgan("mailto:a@b.fr", "heart")).toBe("mailto:a@b.fr");
    expect(withOrgan("//cdn.example.org/x", "heart")).toBe("//cdn.example.org/x");
    expect(withOrgan("#contenu", "heart")).toBe("#contenu");
    expect(withOrgan("/api/search?q=a", "heart")).toBe("/api/search?q=a");
    expect(withOrgan("", "heart")).toBe("");
  });

  it("est idempotent", () => {
    for (const key of ORGAN_KEYS) {
      const once = withOrgan("/allele/HLA-A*02?x=1#h", key);
      expect(withOrgan(once, key)).toBe(once);
    }
  });

  it("le nom du parametre est `organe`", () => {
    expect(ORGAN_PARAM).toBe("organe");
  });

  it("graphHref et entityHref reportent l'organe sans perte de la cle HLA", () => {
    expect(graphHref({ center: "HLA-DQB1*02:01", depth: 2, organ: "heart" })).toBe(
      "/graph?center=HLA-DQB1*02%3A01&depth=2&organe=coeur",
    );
    expect(graphHref({ center: "HLA-DQB1*02:01" })).toBe("/graph?center=HLA-DQB1*02%3A01");
    expect(entityHref("hla", "HLA-DQB1*02:01", "liver")).toBe(
      `/allele/${encodeURIComponent("HLA-DQB1*02:01")}?organe=foie`,
    );
    expect(entityHref("outcome", "ABMR")).toBe("/complication/ABMR");
  });
});

describe("extractOrganHint : un mot d'organe dans la recherche", () => {
  it("extrait le mot et rend le reste de la requete", () => {
    expect(extractOrganHint("DR15 coeur")).toEqual({ organ: "heart", rest: "DR15" });
    expect(extractOrganHint("foie rejet")).toEqual({ organ: "liver", rest: "rejet" });
    expect(extractOrganHint("GCSH")).toEqual({ organ: "hsct", rest: "" });
    expect(extractOrganHint("DQB1*02:01 Cœur")).toEqual({
      organ: "heart",
      rest: "DQB1*02:01",
    });
  });

  it("comprend les accents, les majuscules et les mots anglais usuels", () => {
    expect(extractOrganHint("PANCRÉAS").organ).toBe("pancreas");
    expect(extractOrganHint("kidney").organ).toBe("kidney");
    expect(extractOrganHint("poumons").organ).toBe("lung");
    expect(extractOrganHint("intestin").organ).toBe("intestine");
  });

  it("ne confond pas un allele ou un mot courant avec un organe", () => {
    expect(extractOrganHint("A*02")).toEqual({ organ: null, rest: "A*02" });
    expect(extractOrganHint("DQB1 02 01").organ).toBeNull();
    expect(extractOrganHint("rejet aigu").organ).toBeNull();
    expect(extractOrganHint("constructor").organ).toBeNull();
    expect(extractOrganHint("").rest).toBe("");
  });

  it("foldText replie casse, accents et ligature", () => {
    expect(foldText("Cœur")).toBe("coeur");
    expect(foldText("Pancréas")).toBe("pancreas");
  });
});
