import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { SignalGlyph } from "@/components/SignalIndicator";
import { SignalLegend } from "@/components/entity/SignalLegend";
import {
  AlleleName,
  Callout,
  PageHeader,
  StatTile,
  cardClasses,
} from "@/components/ui";
import { CATEGORIES } from "@/lib/labels";
import { SIGNAL_DISPLAY } from "@/lib/signal";
import { categoryClasses, categoryColor, categoryDisplay } from "@/lib/theme";
import { cn } from "@/lib/cn";
import { categoryAnchor, formatInt, plural } from "@/lib/format";
import { getOutcomeCatalog, type OutcomeCatalogEntry } from "@/lib/queries";

/**
 * Index des complications — porte d'entree « Explorer par complication »
 * (corrige le 404 du lien de l'accueil vers `/complication`).
 *
 * Les 7 categories cliniques, dans l'ordre de `CATEGORIES`, et leurs
 * complications : libelle clinique (JAMAIS la cle technique), nombre
 * d'articles, nombre d'alleles co-mentionnes, et les trois alleles les plus
 * marques (ordre du site : niveau de signal, puis effectif). Une barre fine
 * compare les effectifs d'articles entre complications — un compte, pas une
 * metrique.
 *
 * Les ancres `#cat-<categorie>` sont la cible du fil d'Ariane des fiches.
 */
export const metadata: Metadata = {
  title: "Complications — index du corpus",
  description:
    "Les complications de transplantation rénale du référentiel, par catégorie " +
    "clinique, avec les allèles HLA co-mentionnés. Co-occurrences textuelles, " +
    "pas des associations cliniques.",
};

function groupByCategory(entries: OutcomeCatalogEntry[]) {
  const groups = new Map<string, OutcomeCatalogEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.category) ?? [];
    list.push(e);
    groups.set(e.category, list);
  }
  const ordered: { category: string; items: OutcomeCatalogEntry[] }[] = [];
  for (const c of CATEGORIES) {
    const items = groups.get(c);
    if (items) ordered.push({ category: c, items });
    groups.delete(c);
  }
  for (const [category, items] of groups) ordered.push({ category, items });
  return ordered;
}

export default function ComplicationIndexPage() {
  const catalog = getOutcomeCatalog(3);
  const groups = groupByCategory(catalog);
  const maxArticles = Math.max(1, ...catalog.map((c) => c.nArticles));
  const nMarked = catalog.reduce((s, c) => s + c.nMarked, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Explorer par complication"
        title="Complications de la transplantation rénale"
        description="Le référentiel du pipeline, regroupé en catégories cliniques. Chaque fiche remonte vers les allèles mentionnés dans les mêmes articles."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Complications"
          value={catalog.length}
          hint="libellés cliniques"
        />
        <StatTile
          label="Catégories"
          value={groups.length}
          hint="regroupement clinique"
        />
        <StatTile
          label="Paires testées"
          value={formatInt(catalog.reduce((s, c) => s + c.nAlleles, 0))}
          hint="allèle × complication co-mentionnés"
        />
        <StatTile
          label="Au-dessus du seuil"
          value={formatInt(nMarked)}
          hint="co-occurrences marquées"
        />
      </div>

      <Callout
        tone="framing"
        title="Comment lire cet index"
        aria-label="Comment lire cet index"
      >
        <p>
          Les allèles cités sous chaque complication sont ceux dont la{" "}
          <strong>co-mention textuelle</strong> est la plus marquée dans le
          corpus — une fréquence de publication, pas une observation chez des
          patients. La fiche de chaque complication conduit aux phrases sources.{" "}
          <Link href="/methode" className="link font-medium">
            Méthodologie
          </Link>
        </p>
      </Callout>

      <nav aria-label="Catégories" className="flex flex-wrap gap-2">
        {groups.map(({ category, items }) => (
          <a
            key={category}
            href={`#${categoryAnchor(category)}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-medium text-fg-muted ring-1 ring-inset ring-line hover:text-fg hover:ring-line-strong"
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-2 w-2 rounded-full",
                categoryClasses(category).bg,
              )}
            />
            {categoryDisplay(category)}
            <span className="tabular text-fg-subtle">{items.length}</span>
          </a>
        ))}
      </nav>

      <SignalLegend levels={["inverse", "strong", "clear", "moderate"]} />

      <div className="space-y-10">
        {groups.map(({ category, items }) => (
          <section
            key={category}
            id={categoryAnchor(category)}
            aria-label={categoryDisplay(category)}
            className="scroll-mt-40 space-y-3"
          >
            <h2 className="flex items-center gap-2.5 font-serif text-xl font-semibold tracking-tight text-fg">
              <span
                aria-hidden="true"
                className={cn(
                  "h-3 w-3 rounded-[3px]",
                  categoryClasses(category).bg,
                )}
              />
              {categoryDisplay(category)}
              <span className="font-sans text-sm font-normal text-fg-subtle">
                {plural(items.length, "complication")}
              </span>
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((o) => (
                <li
                  key={o.outcome}
                  className={cn(
                    cardClasses({ padding: "none" }),
                    "relative flex flex-col overflow-hidden",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ background: categoryColor(o.category).css }}
                  />
                  <div className="flex-1 space-y-3 px-4 py-3.5 pl-5">
                    <Link
                      href={`/complication/${encodeURIComponent(o.outcome)}`}
                      className="block font-semibold leading-snug text-fg after:absolute after:inset-0 after:content-[''] hover:text-primary"
                    >
                      {/* Libelle clinique de la base, jamais la cle. */}
                      {o.label}
                    </Link>
                    <div>
                      <p className="flex items-baseline justify-between text-xs text-fg-muted">
                        <span className="tabular">
                          {plural(o.nArticles, "article")}
                        </span>
                        <span className="tabular text-fg-subtle">
                          {plural(o.nAlleles, "entité HLA", "entités HLA")}
                        </span>
                      </p>
                      <div
                        aria-hidden="true"
                        className="mt-1 h-1 overflow-hidden rounded-full bg-fg/[0.06]"
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(o.nArticles / maxArticles) * 100}%`,
                            background: categoryColor(o.category).css,
                          }}
                        />
                      </div>
                    </div>
                    {o.topAlleles.length > 0 ? (
                      <div className="relative z-10">
                        <p className="eyebrow mb-1">Allèles les plus marqués</p>
                        <ul className="flex flex-wrap gap-1.5">
                          {o.topAlleles.map((t) => (
                            <li key={t.hla}>
                              <Link
                                href={`/allele/${encodeURIComponent(t.hla)}`}
                                title={`${t.hla} — ${plural(t.nCooccurrence, "article")} — ${SIGNAL_DISPLAY[t.signalLevel].label}`}
                                className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-1.5 py-0.5 text-xs text-fg ring-1 ring-inset ring-line hover:ring-line-strong"
                              >
                                <span
                                  className={SIGNAL_DISPLAY[t.signalLevel].tone}
                                >
                                  <SignalGlyph level={t.signalLevel} />
                                </span>
                                <AlleleName hla={t.hla} />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  <p className="flex items-center justify-between border-t border-line px-4 py-2 pl-5 text-2xs text-fg-subtle">
                    <span>
                      {o.nMarked > 0
                        ? `${plural(o.nMarked, "co-occurrence")} au-dessus du seuil`
                        : "Aucune co-occurrence au-dessus du seuil"}
                    </span>
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
