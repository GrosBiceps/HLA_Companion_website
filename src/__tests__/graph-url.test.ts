import { describe, it, expect } from "vitest";
import { clampDepth, entityHref, graphHref } from "../lib/graph-url";

/**
 * Round-trip de l'URL du graphe : une cle HLA porte `*` et `:`, et toute
 * cle doit revenir INTACTE apres serialisation puis lecture par
 * `searchParams.get` (ce que font le navigateur et Next).
 */
function readBack(href: string): URLSearchParams {
  return new URL(href, "http://localhost").searchParams;
}

describe("graphHref — aller-retour de ?center=", () => {
  it.each([
    "HLA-DQB1*02:01",
    "HLA-A*02",
    "DQB1",
    "graft_loss",
    "HLA-mismatch",
    // Cas hostiles : un encodage manuel casserait ici.
    "a&b=c",
    "x+y z",
    "100%",
    "#frag",
  ])("%s revient intact", (center) => {
    const href = graphHref({ center, depth: 2 });
    expect(href.startsWith("/graph?")).toBe(true);
    expect(readBack(href).get("center")).toBe(center);
    expect(readBack(href).get("depth")).toBe("2");
  });

  it("encode `:` et accepte la forme %2A%3A envoyee par un lien externe", () => {
    const href = graphHref({ center: "HLA-DQB1*02:01" });
    expect(href).toContain("%3A");
    expect(href).not.toContain(":01");
    // Forme entierement percent-encodee (lien colle par un utilisateur).
    expect(readBack("/graph?center=HLA-DQB1%2A02%3A01").get("center")).toBe(
      "HLA-DQB1*02:01",
    );
  });

  it("n'ajoute minSignal que s'il est pose", () => {
    expect(readBack(graphHref({ center: "DSA" })).has("minSignal")).toBe(false);
    expect(readBack(graphHref({ center: "DSA", minSignal: "" })).has("minSignal")).toBe(false);
    expect(readBack(graphHref({ center: "DSA", minSignal: "strong" })).get("minSignal")).toBe(
      "strong",
    );
  });

  it("borne la profondeur a [1, 3]", () => {
    expect(clampDepth(0)).toBe(1);
    expect(clampDepth(7)).toBe(3);
    expect(clampDepth("2")).toBe(2);
    expect(clampDepth("abc")).toBe(1);
    expect(clampDepth(undefined)).toBe(1);
    expect(readBack(graphHref({ center: "DSA", depth: 9 })).get("depth")).toBe("3");
  });
});

describe("entityHref", () => {
  it("mene a la fiche allele ou complication, cle encodee", () => {
    expect(entityHref("hla", "HLA-DQB1*02:01")).toBe(
      `/allele/${encodeURIComponent("HLA-DQB1*02:01")}`,
    );
    expect(decodeURIComponent(entityHref("hla", "HLA-DQB1*02:01").split("/")[2])).toBe(
      "HLA-DQB1*02:01",
    );
    expect(entityHref("outcome", "graft_loss")).toBe("/complication/graft_loss");
  });
});
