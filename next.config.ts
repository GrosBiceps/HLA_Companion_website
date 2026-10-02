import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Ancre la racine sur le depot : sans cela Turbopack remonte vers le
  // package-lock.json du repertoire utilisateur.
  turbopack: { root: path.resolve(".") },
  // better-sqlite3 est un binaire natif : il ne doit jamais etre bundle,
  // uniquement require() depuis le runtime Node du serveur.
  serverExternalPackages: ["better-sqlite3"],
  // La base est ouverte par un chemin calcule a l'execution : le tracage des
  // fichiers ne la voit pas. Sans cette inclusion, les fonctions serverless
  // (Vercel) sont deployees sans le .sqlite -> SQLITE_CANTOPEN.
  outputFileTracingIncludes: {
    "/**": ["./dist/*.sqlite"],
  },
};

export default nextConfig;
