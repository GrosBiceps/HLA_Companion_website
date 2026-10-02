import type { Config } from "tailwindcss";

/**
 * Design system du Compagnon HLA — voir docs/DESIGN_SYSTEM.md.
 *
 * PRINCIPE. Toutes les couleurs SEMANTIQUES (fond, texte, bordure, statut,
 * signal, categorie) sont des variables CSS definies dans `globals.css`, en
 * triplets RGB, et basculent automatiquement en mode sombre. Les classes
 * Tailwind (`bg-surface`, `text-fg-muted`, `bg-signal-strong`...) ne codent
 * donc jamais une teinte en dur : elles designent un ROLE.
 *
 * Les seules palettes « brutes » sont `brand` (encre indigo) et `accent`
 * (sarcelle), utiles pour des illustrations ; l'interface courante passe par
 * les roles (`primary`, `accent`).
 */

/** Couleur CSS-variable compatible avec les modificateurs d'opacite (`/40`). */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // ── Surfaces & texte ────────────────────────────────────────────
        canvas: v("canvas"),
        surface: {
          DEFAULT: v("surface"),
          muted: v("surface-muted"),
          sunken: v("surface-sunken"),
          raised: v("surface-raised"),
        },
        fg: {
          DEFAULT: v("fg"),
          muted: v("fg-muted"),
          subtle: v("fg-subtle"),
          faint: v("fg-faint"),
        },
        line: {
          DEFAULT: v("line"),
          strong: v("line-strong"),
        },
        // ── Roles d'action ──────────────────────────────────────────────
        primary: {
          DEFAULT: v("primary"),
          hover: v("primary-hover"),
          fg: v("primary-fg"),
          soft: v("primary-soft"),
          "soft-fg": v("primary-soft-fg"),
        },
        accent: {
          DEFAULT: v("accent"),
          fg: v("accent-fg"),
          soft: v("accent-soft"),
          "soft-fg": v("accent-soft-fg"),
        },
        // ── Statuts ────────────────────────────────────────────────────
        warn: {
          DEFAULT: v("warn"),
          fg: v("warn-fg"),
          soft: v("warn-soft"),
          "soft-fg": v("warn-soft-fg"),
          line: v("warn-line"),
        },
        danger: {
          DEFAULT: v("danger"),
          soft: v("danger-soft"),
          "soft-fg": v("danger-soft-fg"),
          line: v("danger-line"),
        },
        success: {
          DEFAULT: v("success"),
          soft: v("success-soft"),
          "soft-fg": v("success-soft-fg"),
          line: v("success-line"),
        },
        // ── Echelle ordinale du signal (daltonisme : bleus sequentiels +
        //    orange divergent pour l'inverse) ─────────────────────────────
        signal: {
          inverse: v("signal-inverse"),
          strong: v("signal-strong"),
          clear: v("signal-clear"),
          moderate: v("signal-moderate"),
          weak: v("signal-weak"),
        },
        // ── Echelle categorielle : 7 categories cliniques + classes HLA ──
        cat: {
          rejet: v("cat-rejet"),
          immunisation: v("cat-immunisation"),
          greffon: v("cat-greffon"),
          infection: v("cat-infection"),
          neoplasie: v("cat-neoplasie"),
          metabolique: v("cat-metabolique"),
          recidive: v("cat-recidive"),
          other: v("cat-other"),
        },
        hla: {
          "class-1": v("hla-class-1"),
          "class-2": v("hla-class-2"),
        },
        // ── Surlignage des spans extraits ──────────────────────────────
        mark: {
          hla: v("mark-hla"),
          "hla-fg": v("mark-hla-fg"),
          outcome: v("mark-outcome"),
          "outcome-fg": v("mark-outcome-fg"),
        },
        // ── Palettes brutes (illustrations, degrades) ──────────────────
        brand: {
          50: "#eef0fb",
          100: "#dde1f6",
          200: "#bcc3ec",
          300: "#939edf",
          400: "#6b78cf",
          500: "#4c58bb",
          600: "#3a439f",
          700: "#2f3681",
          800: "#272d66",
          900: "#1d2149",
          950: "#12152e",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        serif: ["var(--font-serif)", "Georgia", "ui-serif", "serif"],
        mono: [
          "var(--font-mono)",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(var(--shadow) / 0.06)",
        card: "0 1px 2px 0 rgb(var(--shadow) / 0.05), 0 1px 3px 0 rgb(var(--shadow) / 0.06)",
        raised:
          "0 4px 12px -2px rgb(var(--shadow) / 0.10), 0 2px 4px -2px rgb(var(--shadow) / 0.06)",
        overlay:
          "0 24px 48px -12px rgb(var(--shadow) / 0.28), 0 8px 16px -8px rgb(var(--shadow) / 0.12)",
      },
      maxWidth: {
        content: "72rem",
        prose: "68ch",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(24px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pop-in": {
          "0%": { transform: "translateY(-4px) scale(0.98)", opacity: "0" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s linear infinite",
        "slide-in-right": "slide-in-right 180ms ease-out",
        "fade-in": "fade-in 150ms ease-out",
        "pop-in": "pop-in 140ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
