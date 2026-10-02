# Design system — Compagnon HLA

Référence pour toute nouvelle page ou visualisation. Ce document décrit les
**jetons**, les **composants** et les **règles d'usage**. Les garde-fous
épistémiques (README, `src/__tests__/vocabulary.test.ts`) priment sur toute
considération esthétique.

Captures de référence : [`docs/screenshots/design-system/`](screenshots/design-system/)
(accueil, fiche allèle, graphe, tiroir de phrases, palette de recherche, menu
mobile — bureau 1366 px et mobile 390 px, clair et sombre).

---

## 1. Principes

1. **Registre de publication scientifique** : titres en serif, texte en sans
   neutre, identifiants (allèles, PMID, versions) en chasse fixe. Surfaces
   « papier » chaudes, encre indigo, un seul accent sarcelle.
2. **Une couleur = un rôle**. On n'écrit jamais `bg-slate-100` ou `#334155` :
   on écrit `bg-surface-muted`, `SIGNAL_COLORS.strong.css`. Le mode sombre est
   alors gratuit.
3. **La couleur n'est jamais seule** : un niveau de signal porte toujours son
   libellé, une catégorie son nom, une polarité son texte.
4. **Hiérarchie épistémique** : l'encart de cadrage pèse plus lourd que les
   chiffres ; le chemin de vérification (« Voir les N phrases ») est l'action
   la plus visible ; les métriques restent derrière un `<details>`.

---

## 2. Jetons

Définis dans `src/app/globals.css` (variables CSS, triplets RGB), exposés à
Tailwind dans `tailwind.config.ts`, et en hexadécimal dans `src/lib/theme.ts`
pour les moteurs qui ne lisent pas le CSS. `src/__tests__/theme.test.ts`
vérifie que les trois concordent : **toute modification d'une couleur se fait
dans `globals.css` ET `theme.ts`**.

Mode sombre : automatique via `prefers-color-scheme` (pas de bascule manuelle
pour l'instant). Toutes les classes ci-dessous acceptent l'opacité
(`bg-primary/10`, `ring-fg/20`).

### Surfaces, texte, bordures

| Classe Tailwind | Variable | Usage |
|---|---|---|
| `bg-canvas` | `--canvas` | fond de page (posé sur `<body>`) |
| `bg-surface` | `--surface` | cartes, panneaux |
| `bg-surface-muted` | `--surface-muted` | bloc secondaire, pied de page, zone teintée |
| `bg-surface-sunken` | `--surface-sunken` | creux (fond de contrôle segmenté) |
| `bg-surface-raised` | `--surface-raised` | élément flottant en sombre |
| `text-fg` | `--fg` | texte principal, titres |
| `text-fg-muted` | `--fg-muted` | texte courant secondaire |
| `text-fg-subtle` | `--fg-subtle` | légendes, méta-données (contraste AA) |
| `text-fg-faint` | `--fg-faint` | décoratif uniquement (séparateurs, placeholders) |
| `border-line` / `border-line-strong` | `--line`, `--line-strong` | filets |

### Rôles

| Rôle | Classes | Usage |
|---|---|---|
| Primaire (encre indigo) | `bg-primary`, `text-primary-fg`, `hover:bg-primary-hover`, `bg-primary-soft`, `text-primary-soft-fg` | action principale, état actif, encart de cadrage |
| Accent (sarcelle) | `bg-accent`, `bg-accent-soft`, `text-accent-soft-fg` | rare : mise en avant secondaire, logo |
| Alerte | `bg-warn` (plein : **réservé au bandeau synthétique**), `bg-warn-soft`, `text-warn-soft-fg`, `border-warn-line` | mentions négatives, filtre actif, troncature |
| Danger | `bg-danger-soft`, `text-danger-soft-fg`, `border-danger-line` | panne (corpus non consulté) — jamais un état vide |
| Succès | `bg-success-soft`, `text-success-soft-fg`, `ring-success-line` | polarité positive |

### Échelle ordinale du signal (5 niveaux)

Séquentielle bleue pour `strong → clear → moderate → weak` (luminance
monotone, inversée en sombre pour que « fort » reste le plus saillant), et
**orange divergent** pour `inverse` — signal d'une autre nature, pas un
échelon. Bleu/orange reste distinguable dans les trois formes de daltonisme.

| Niveau | Classe | Clair | Sombre | Rang (`SIGNAL_RANK`) |
|---|---|---|---|---|
| inverse | `bg-signal-inverse` | `#C0561A` | `#F29A5C` | 3 (hors échelle) |
| strong | `bg-signal-strong` | `#1D3F8F` | `#A9C1FF` | 4 |
| clear | `bg-signal-clear` | `#3A72CF` | `#6E97EE` | 3 |
| moderate | `bg-signal-moderate` | `#8AAAD8` | `#4A6CA8` | 2 |
| weak | `bg-signal-weak` | `#B7BDC9` | `#485063` | 1 |

Pour du **texte** coloré par niveau, utiliser `SIGNAL_DISPLAY[level].tone`
(`src/lib/signal.ts`) : il garantit un contraste lisible (moderate/weak
passent en `fg-muted`/`fg-subtle`).

### Échelle catégorielle (7 catégories cliniques + classes HLA)

Ni bleu ni orange, pour ne pas concurrencer le signal (dans le graphe : nœuds
= catégorie, liens = signal).

| Catégorie (clé `CATEGORIES`) | Libellé affiché | Classe | Clair | Sombre |
|---|---|---|---|---|
| Rejet | Rejet | `bg-cat-rejet` | `#D1495B` | `#F0707F` |
| Immunisation | Immunisation | `bg-cat-immunisation` | `#7B5CC4` | `#A88BEB` |
| Fonction du greffon | Fonction du greffon | `bg-cat-greffon` | `#1C93A8` | `#4CC0D4` |
| Infection | Infection | `bg-cat-infection` | `#3D9A50` | `#6CC47E` |
| Neoplasie | Néoplasie | `bg-cat-neoplasie` | `#C0508F` | `#E27DB6` |
| Metabolique | Métabolique | `bg-cat-metabolique` | `#C29318` | `#E2B73F` |
| Recidive | Récidive | `bg-cat-recidive` | `#8C6A4E` | `#C09A7A` |
| (inconnue) | — | `bg-cat-other` | `#7A8194` | `#9AA1B3` |
| HLA classe I | — | `bg-hla-class-1` | `#3A439F` | `#8E99F0` |
| HLA classe II | — | `bg-hla-class-2` | `#7C88DD` | `#C3CAF8` |

⚠ Les clés de `CATEGORIES` sont sans accents (miroir du pipeline Python).
Pour l'affichage, passer par `categoryDisplay(category)` (« Néoplasie »).

### Surlignage des phrases sources

`bg-mark-hla` / `text-mark-hla-fg` (bleu, soulignement plein) pour l'allèle,
`bg-mark-outcome` / `text-mark-outcome-fg` (ambre, soulignement pointillé)
pour la complication.

### Typographie

| Famille | Classe | Police (next/font, auto-hébergée) | Usage |
|---|---|---|---|
| Sans | `font-sans` (défaut) | Inter | interface, texte courant |
| Serif | `font-serif` | Source Serif 4 | `<h1>`, `<h2>`, grands chiffres, citations |
| Mono | `font-mono`, `.allele` | JetBrains Mono | allèles, PMID, versions de corpus |

Échelle : `h1` = `text-3xl sm:text-4xl` serif semibold ; `h2` de section =
`text-xl` serif semibold ; `h3` de carte = `text-[0.975rem]` sans semibold ;
surtitre = classe `.eyebrow` (2xs, capitales espacées) ; nouvelle taille
`text-2xs` (11 px) pour badges et légendes.

### Classes utilitaires (`@layer components`)

- `.link` — lien de texte (indigo, soulignement discret).
- `.allele` — nom d'allèle (mono, sans ligatures). **Tout allèle affiché
  l'utilise** (ou le composant `AlleleName`).
- `.eyebrow` — surtitre.
- `.kbd` — touche clavier.
- `.tabular` — chiffres à chasse fixe (colonnes, tuiles).

### Divers

Rayons : `rounded-lg` (contrôles), `rounded-xl` (cartes), `rounded-2xl`
(encarts majeurs, dialogues). Ombres : `shadow-xs`, `shadow-card`,
`shadow-raised`, `shadow-overlay`. Largeur de contenu : `max-w-content`
(72 rem) ; texte long : `max-w-prose` (68 ch). Animations : `animate-fade-in`,
`animate-pop-in`, `animate-slide-in-right`, `animate-shimmer`. Hauteur
d'en-tête : `var(--header-h)`.

---

## 3. Coquille (`src/app/layout.tsx`, `src/components/shell/`)

Ordre vertical, sur toutes les routes :

1. **Bloc collant** : `SyntheticBanner` (si corpus synthétique) + `SiteHeader`.
   Le bandeau reste visible au défilement.
2. `GlobalFramingReminder` (une ligne, non collante).
3. `<main id="contenu">` — `max-w-content`, gouttières `px-4 sm:px-6 lg:px-8`,
   `py-8 sm:py-10`. **Les pages ne reposent pas leur propre conteneur.**
4. `SiteFooter` — version du corpus, rappel épistémique, crédits.

- Navigation : `src/components/shell/nav.ts` (`NAV_ITEMS`, `isActive`) est la
  source unique (en-tête, menu mobile, pied). Ajouter une route = une entrée.
- Recherche : `SearchCommand` dans l'en-tête — palette modale ouverte par
  « / » ou Ctrl/⌘-K, flèches + Entrée. **Un seul `SearchCommand` par page**
  (il écoute les raccourcis). La palette rappelle le cadrage en pied.
- Mobile (< `lg`) : menu hamburger (`MobileNav`), recherche en bouton-icône.
- `/methode` est une **page provisoire** ; `/matrice` et `/carte-v1` sont
  livrées (voir [`VISUALISATIONS.md`](VISUALISATIONS.md)). `/methode` porte déjà l'`EpistemicNotice` :
  c'est la cible de tous les liens « Méthodologie » / « En savoir plus ».

---

## 4. Primitives (`src/components/ui/`, import depuis `@/components/ui`)

Toutes sont des Server Components, sauf `SegmentedControl`.

| Composant | Props | Notes |
|---|---|---|
| `Card` | `as?`, `tone?: "default" \| "muted" \| "outline"`, `padding?: "none" \| "sm" \| "md" \| "lg"`, `interactive?`, `className?` | `cardClasses(opts)` pour habiller un `<Link>` |
| `CardHeader` | `eyebrow?`, `title`, `description?`, `actions?` | |
| `Badge` | `tone?: "neutral" \| "primary" \| "accent" \| "warn" \| "danger" \| "success" \| "outline"`, `size?: "xs" \| "sm"`, `uppercase?`, `icon?`, `title?` | |
| `CategoryBadge` | `category` | point coloré + libellé accentué |
| `HlaClassBadge` | `hlaClass` (`"I"`, `"II"`, autre) | |
| `Button` | `variant?: "primary" \| "secondary" \| "ghost" \| "link"`, `size?: "sm" \| "md" \| "lg" \| "icon"` + attributs `<button>` | `buttonClasses(variant, size)` |
| `LinkButton` | idem + props de `next/link` | |
| `PageHeader` | `eyebrow?`, `title`, `description?`, `meta?`, `actions?`, `children?` | porte le `<h1>` — un par page |
| `Section` | `id?`, `eyebrow?`, `title?`, `description?`, `actions?`, `aria-label?` | `<section>` + `<h2>` serif |
| `Container` | `className?` | largeur de contenu (déjà posée par le layout) |
| `StatTile` | `label`, `value`, `hint?`, `icon?` | **effectifs descriptifs uniquement**, jamais une métrique d'association |
| `Callout` | `tone?: "framing" \| "info" \| "warn" \| "danger"`, `title?`, `icon?`, `hideIcon?`, `role?`, `aria-label?` | `framing` = « Comment lire cette fiche » |
| `EmptyState` | `icon?`, `title`, `description?`, `action?` | dire ce que l'absence signifie |
| `Skeleton`, `SkeletonText` | `className?` / `lines?` | |
| `Tooltip` | `content`, `side?: "top" \| "bottom"`, `focusable?` | CSS pur ; jamais de métrique brute dedans |
| `SegmentedControl` | `options: {value, label, count?, disabled?}[]`, `value`, `onChange`, `ariaLabel`, `size?` | boutons `aria-pressed` (filtres), client |
| `AlleleName` | `hla`, `href?: string \| true`, `className?` | mono, préfixe « HLA- » atténué ; `textContent === hla` |

### Composants métier restylés (props inchangées)

| Composant | Props |
|---|---|
| `SyntheticBanner` | `version` |
| `GlobalFramingReminder` | — |
| `EpistemicNotice` | `corpusVersion?` — non refermable, aucun `<button>` |
| `SignalIndicator` | `level`, `variant?: "pill" \| "plain"` (nouveau, défaut `pill`), `className?` |
| `SignalGlyph` (nouveau export) | `level`, `className?` — jauge 4 barres / demi-disque, `aria-hidden` |
| `AssociationCard` | `association` |
| `AlleleBreadcrumb` | `ancestry` |
| `SearchBar` | `className?` — champ en ligne (accueil), panneau dans le flux |
| `SearchCommand` (nouveau) | `triggerClassName?` — palette d'en-tête |
| `SentenceDrawer` | `hla`, `outcome`, `label`, `onClose` |
| `HighlightedSentence` | `sentence`, `hlaSpan`, `outcomeSpan` |

---

## 5. Pour les graphiques (`src/lib/theme.ts`)

```ts
import { SIGNAL_COLORS, categoryColor, hlaClassColor, hlaClassFromKey,
         CHART_NEUTRALS, cssAlpha } from "@/lib/theme";

<line stroke={SIGNAL_COLORS[edge.signalLevel].css} />          // suit le thème
<rect fill={categoryColor(node.category).css} />
<circle fill={hlaClassColor(hlaClassFromKey(node.id)).css} />
<rect fill={cssAlpha(SIGNAL_COLORS.strong, 0.15)} />            // translucide
ctx.fillStyle = dark ? SIGNAL_COLORS.strong.dark : SIGNAL_COLORS.strong.light; // canvas
```

Aussi : `SIGNAL_RANK` (épaisseur/taille ordinale), `SIGNAL_CLASSES` et
`CATEGORY_CLASSES` / `categoryClasses()` (classes Tailwind écrites en entier,
visibles du JIT), `CATEGORY_DISPLAY` / `categoryDisplay()`.

Le `content` de Tailwind inclut désormais `src/lib/**` : une classe écrite
dans un module de `lib` est générée.

Texte SVG lisible sur fond quelconque : `fill="rgb(var(--fg))"
stroke="rgb(var(--surface))" strokeWidth={3} paintOrder="stroke"`.

---

## 6. Règles (à respecter, testées ou non)

- **Vocabulaire** : jamais « associé à », « lié à », « risque de », « prédit »,
  « provoque », « entraîne »… (liste complète dans `vocabulary.test.ts`). On
  écrit « co-mentionné », « co-occurrence », « apparaissent ensemble ».
- **Jamais de clé technique affichée** (`graft_loss`, `DSA` seul…) : toujours
  le libellé clinique. Pas de repli `?? outcome`.
- **Métriques brutes** (NPMI, OR, IC, FDR) : seulement dans un `<details>`
  fermé, avec leur mise en garde. Ni tuile, ni infobulle, ni légende.
- **Négations jamais masquées**, non-significatif **grisé mais présent**.
- **Panne ≠ vide** : une erreur de chargement est un `Callout tone="danger"`
  (« ce n'est pas un résultat »), jamais un `EmptyState`.
- **Bandeau synthétique** : ne pas le déplacer hors du bloc collant, ne rien
  colorer en `bg-warn` plein ailleurs.
- **Cadrage par page** : toute fiche affichant des chiffres ajoute un
  `Callout tone="framing"` (ou l'encart équivalent) en plus du rappel global.
- `SentenceDrawer` : les tests comptent ses `<li>` comme des cartes de
  mention — n'y ajouter aucune autre liste.
- `SearchBar.tsx` : le test de routes relit ce fichier et interprète tout
  motif `` `/xxx/${ `` comme une route — y compris dans les commentaires.

---

## 7. Points ouverts pour la phase 2

- La carte d'entrée « Complication » de l'accueil pointe vers `/complication`,
  qui n'a pas de page d'index (404 préexistant).
- ~~Le graphe garde son rendu SVG en anneaux~~ : remplacé par un réseau
  interactif (d3-force + d3-zoom) — voir [`VISUALISATIONS.md`](VISUALISATIONS.md)
  et les composants de `src/components/charts/`.
- Pas de bascule clair/sombre manuelle (préférence système uniquement).
