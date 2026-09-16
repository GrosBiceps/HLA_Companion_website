// Stub vide : `server-only` leve une erreur hors contexte RSC. Vitest
// execute la couche de donnees dans un vrai runtime Node, ou ce garde-fou
// n'a pas lieu d'etre ; il est donc alias vers ce module inerte
// (cf. vitest.config.mts, resolve.alias).
export {};
