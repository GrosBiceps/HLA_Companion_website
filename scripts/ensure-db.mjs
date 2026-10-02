/**
 * Prebuild : garantit la presence de la base SQLite avant `next build`.
 *
 * La base est un artefact de build non versionne (cf. .gitignore). Sur un
 * clone frais — Vercel en particulier — elle n'existe pas, et le prerendu de
 * `/` echoue sur SQLITE_CANTOPEN. On la reconstruit donc ici depuis les CSV
 * synthetiques avec le builder Python (bibliotheque standard uniquement).
 *
 * Ne fait rien si `CORPUS_DB_PATH` pointe vers une base existante, ou si la
 * base synthetique par defaut est deja presente.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const target =
  process.env.CORPUS_DB_PATH ??
  path.join(root, "dist", "corpus_A_synthetic.sqlite");

if (existsSync(target)) {
  console.log(`[ensure-db] Base presente : ${target}`);
  process.exit(0);
}

if (process.env.CORPUS_DB_PATH) {
  console.error(
    `[ensure-db] CORPUS_DB_PATH=${target} n'existe pas : aucune base a servir.`,
  );
  process.exit(1);
}

const args = [
  path.join("scripts", "build_sqlite.py"),
  "--source", path.join("data", "synthetic"),
  "--out", target,
  "--version", "A-synthetic",
  "--synthetic",
];

for (const python of ["python3", "python"]) {
  const res = spawnSync(python, args, { cwd: root, stdio: "inherit" });
  if (res.error?.code === "ENOENT") continue;
  if (res.status !== 0) {
    console.error(`[ensure-db] Le builder a echoue (code ${res.status}).`);
    process.exit(res.status ?? 1);
  }
  console.log(`[ensure-db] Base construite : ${target}`);
  process.exit(0);
}

console.error(
  "[ensure-db] Python introuvable : impossible de construire la base. " +
    "Lancer `python scripts/build_sqlite.py ...` ou definir CORPUS_DB_PATH.",
);
process.exit(1);
