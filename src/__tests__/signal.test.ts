import { describe, it, expect } from "vitest";
import { SIGNAL_DISPLAY } from "../lib/signal";

describe("SIGNAL_DISPLAY", () => {
  it("couvre les cinq niveaux", () => {
    for (const lvl of ["inverse", "strong", "clear", "moderate", "weak"]) {
      expect(SIGNAL_DISPLAY[lvl]).toBeDefined();
      expect(SIGNAL_DISPLAY[lvl].label).toBeTruthy();
    }
  });

  it("emploie le vocabulaire de co-occurrence, jamais causal", () => {
    for (const lvl of Object.keys(SIGNAL_DISPLAY)) {
      const label = SIGNAL_DISPLAY[lvl].label.toLowerCase();
      for (const forbidden of ["associé", "lié", "risque", "prédit", "cause"]) {
        expect(label).not.toContain(forbidden);
      }
    }
  });

  it("n'expose aucune valeur numerique de metrique dans le libelle", () => {
    for (const lvl of Object.keys(SIGNAL_DISPLAY)) {
      expect(SIGNAL_DISPLAY[lvl].label).not.toMatch(/npmi|fdr|odds|p\s*=/i);
    }
  });
});
