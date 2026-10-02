import { Suspense } from "react";
import { ALL_ORGANS } from "@/lib/organ";
import {
  HeaderContent,
  HeaderWithOrgan,
  type HeaderBarProps,
} from "./HeaderBar";

/**
 * En-tete du site — logo, navigation, selecteur d'organe, palette de
 * recherche.
 *
 * Il n'est PAS collant par lui-meme : `layout.tsx` l'enveloppe avec le
 * bandeau « données synthétiques » dans un seul bloc `sticky`, pour que le
 * bandeau reste visible au defilement sans que les deux se chevauchent.
 *
 * ORGANE. La strate (`?organe=coeur`) est lue dans l'URL par `HeaderWithOrgan`
 * (`useSearchParams`, cote client), ce qui suppose une frontiere `Suspense` :
 * sur une page prerendue statiquement (methode, guide…), c'est le repli —
 * le meme en-tete en strate « tous les organes » — qui part dans le HTML, puis
 * le client le remplace par la strate reelle. Le layout ne peut pas lire les
 * `searchParams` lui-meme (il n'est pas re-rendu a chaque navigation).
 */
export function SiteHeader(props: HeaderBarProps) {
  return (
    <header className="relative border-b border-line bg-surface/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75">
      <Suspense fallback={<HeaderContent organ={ALL_ORGANS} {...props} />}>
        <HeaderWithOrgan {...props} />
      </Suspense>
    </header>
  );
}
