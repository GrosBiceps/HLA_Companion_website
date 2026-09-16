export function SyntheticBanner({ version }: { version: string }) {
  return (
    <div
      role="alert"
      className="sticky top-0 z-50 bg-amber-500 px-4 py-2 text-center
                 text-sm font-semibold text-amber-950"
    >
      ⚠ DONNÉES SYNTHÉTIQUES — jeu de démonstration ({version}). Les chiffres
      affichés sont fictifs et ne doivent pas être interprétés.
    </div>
  );
}
