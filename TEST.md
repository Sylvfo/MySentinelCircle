Deux catégories, deux configs Jest distinctes :

Tests unitaires — colocalisés à côté du code source, suffixe .spec.ts :

app.controller.spec.ts
auth.service.spec.ts (ajouté cette session)
Config dans backend/package.json ("jest": {...}) : rootDir: "src", cherche tout *.spec.ts sous src/, compile via ts-jest. Lancé par npm run test.

Tests e2e — dans un dossier séparé backend/test/, suffixe .e2e-spec.ts :

app.e2e-spec.ts (seul présent, généré par défaut par le CLI NestJS — pas encore personnalisé)
Config séparée backend/test/jest-e2e.json : rootDir: "." (relatif à test/), monte l'app NestJS complète via supertest. Lancé par npm run test:e2e.


Les tests unitaires (*.spec.ts) testent une petite partie du code isolément, par exemple une méthode de AuthService. Ils sont rapides et servent à vérifier la logique métier.

CI github action
.github/workflow

hook code claude local

---

## Stratégie discutée (2026-08-24) — à reprendre sur la branche `test`

**Problème déclencheur** : le test curl du flux password-reset a modifié le mot de passe du vrai compte dev (`forster.sylvie@gmail.com`) faute de DB de test isolée.

**Décisions à valider avant de coder** :

1. **DB de test séparée** — `mysentinelcircle_test`, sur le même serveur MariaDB (pas besoin de toucher `docker-compose.yml`, juste une autre base sur le même conteneur). Jamais la DB dev.

2. **Niveaux de test** :
   - Unitaire (Jest + mocks Prisma) : logique métier des `*.service.ts`, surtout les règles "fluides" non protégées par le schéma (cf. `CLAUDE.md` — ex. un seul `LinkSentinels` actif par paire, au moins un Lead Sentinel par 1er cercle). Rapide, pas de DB.
   - E2e (Supertest + `mysentinelcircle_test`) : parcours utilisateur critiques de bout en bout (signup→OTP→login, invitation Sentinel→acceptation, cycle de vie d'une alerte).
   - Contrôleurs : pas de tests dédiés, déjà couverts indirectement par l'e2e.

3. **Priorité par module** : `auth` (déjà partiellement couvert) → `sentinel` (le plus de règles métier non protégées par le schéma) → `alert`/`organization`/`messaging` (encore des coquilles vides, pas la peine avant qu'il y ait du code).

**Workflow `npm run test:e2e` à implémenter** (spécifié par Sylvie) :
1. Vérifie qu'on utilise bien `mysentinelcircle_test` (jamais la DB dev)
2. Applique les migrations/schema sur cette DB
3. Nettoie la DB (état propre avant chaque run)
4. Lance les tests
5. Chaque test crée ses propres utilisateurs/données (pas de fixtures partagées)

Pas encore implémenté — à faire sur la branche `test`.