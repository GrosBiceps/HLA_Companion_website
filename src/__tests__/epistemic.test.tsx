import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EpistemicNotice } from "../components/EpistemicNotice";

describe("EpistemicNotice", () => {
  it("affiche les metriques de validation exactes", () => {
    render(<EpistemicNotice />);
    expect(screen.getByText(/78,75/)).toBeTruthy();
    expect(screen.getByText(/0,44/)).toBeTruthy();
    expect(screen.getByText(/1 mention sur 5/i)).toBeTruthy();
  });

  it("dit explicitement que ce ne sont pas des associations cliniques", () => {
    const { container } = render(<EpistemicNotice />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/co-occurrences? textuelles?/i);
    expect(text).toMatch(/pas des associations cliniques/i);
  });

  it("n'emploie aucun terme causal interdit", () => {
    const { container } = render(<EpistemicNotice />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const forbidden of ["associé à", "lié à", "risque de", "prédit"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("n'est pas refermable (aucun bouton de fermeture)", () => {
    const { container } = render(<EpistemicNotice />);
    expect(container.querySelector("button")).toBeNull();
  });
});
