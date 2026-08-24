# TEST.md

Updated: 2026-08-24 14:23

## Quand les tests se déclenchent

| Quand | Commande | Quoi |
|---|---|---|
| Pendant que tu codes, à la main | `npm run test` (dans `backend/`) | Unitaire seul, Prisma mocké, aucune DB touchée |
| Avant de push, à la main | `npm run test:e2e` (dans `backend/`) | Réinitialise + migre `mysentinelcircle_test`, lance les specs e2e — ne touche jamais la DB dev |
| À chaque push/PR sur `main`/`dev` | CI — `.github/workflows/backend-ci.yml` | `npm run lint` + `npm run test` + `npm run test:e2e`, sur une DB MariaDB éphémère créée par GitHub Actions |
| Proposé, pas encore activé | Hook Claude Code local | Relancerait `npm run test` après que Claude édite un fichier sous `backend/src/**` — à coller toi-même dans `.claude/settings.json` (verrouillé) si tu veux l'activer |

## Liste des tests actuels

### Unitaires — `backend/src/**/*.spec.ts` (28 tests)

- **`app.controller.spec.ts`** (1 test) — vérifie que `GET /` répond `"Hello World!"`.
- **`auth/auth.service.spec.ts`** (27 tests, `PrismaService`/`JwtService`/`ConfigService`/`OTP_SENDER`/`EMAIL_SENDER` mockés) :
  - **`claimOrCreateByPhone`** (via `signupPhone`, 3 tests) — création si aucun user, claim/upgrade d'un stub `ONLY_SMS` (même `id` conservé), rejet 409 si déjà un vrai compte.
  - **`signupGoogle`** (1 test) — rejet 409 si l'email Google est déjà utilisé par un autre compte.
  - **`signupEmail`** (2 tests) — rejet 409 si l'email est déjà pris ; succès (création + envoi OTP).
  - **`loginEmail`** (5 tests) — rejet si aucun compte, si pas de `passwordHash` (compte Google/phone-only), si mauvais mot de passe, si téléphone non vérifié ; succès (retourne un `accessToken`).
  - **`loginGoogle`** (4 tests) — rejet si token Google invalide, si aucun compte lié, si téléphone non vérifié ; succès (retourne un `accessToken`).
  - **`verifyOtp`** (6 tests) — rejet si aucun OTP en attente, si trop de tentatives (≥5), si code expiré, si mauvais code (avec vérification de l'incrément `otpAttempts`) ; succès à la première vérification (`phoneVerifiedAt` positionné) et succès si déjà vérifié (`phoneVerifiedAt` non écrasé).
  - **`requestPasswordReset`** (3 tests) — envoie l'email si le compte a un `passwordHash` ; ne fait rien (mais retourne le même message générique) si aucun compte ou si le compte n'a pas de `passwordHash`.
  - **`confirmPasswordReset`** (3 tests) — rejet si aucun compte pour ce token, si le token a expiré ; succès (mot de passe mis à jour, token effacé).

### E2e — `backend/test/**/*.e2e-spec.ts` (1 test)

- **`app.e2e-spec.ts`** — monte une vraie instance Nest (`AppModule`) contre `mysentinelcircle_test`, vérifie `GET /` → 200 `"Hello World!"`.

## Où voir les résultats

- **En local** : directement dans le terminal (sortie de `npm run test` / `npm run test:e2e`).
- **En CI** : onglet **Actions** du repo GitHub → workflow **backend-ci** → job **test**, un run par push/PR sur `main`/`dev`.

## Tests restant à écrire

- **E2e auth complet** — aujourd'hui seul `/` est testé en e2e ; rien ne couvre encore un vrai parcours signup → OTP → login via de vraies requêtes HTTP contre `mysentinelcircle_test`.
- **Module `sentinel`** (circles/memberships) — prochaine priorité dès qu'il y a du code à tester (règles "au moins un Lead Sentinel par 1er cercle", "un seul `LinkSentinels` actif par paire").
- **`alert` / `organization` / `messaging`** — encore des coquilles vides, pas de tests à écrire avant qu'il y ait du code.

La couverture unitaire de `AuthService` est maintenant complète (les 6 méthodes qui manquaient — `signupEmail`, `loginEmail`, `loginGoogle`, `verifyOtp`, `requestPasswordReset`, `confirmPasswordReset` — sont toutes couvertes).

## Infra de test (référence)

- DB de test : `mysentinelcircle_test`, créée une fois via `bash backend/scripts/create-test-db.sh` (ou `make db-test-init`) — utilise les identifiants root, jamais rejoué automatiquement.
- Config locale : `backend/.env.test` (gitignored) — à créer à partir de `backend/.env.test.example`.
- `npm run test:e2e` vérifie d'abord que `DATABASE_URL` pointe bien vers `mysentinelcircle_test` (refuse sinon), puis réinitialise le schéma (`prisma migrate reset --force`) avant de lancer les specs.
- Chaque test doit créer ses propres données (téléphone/email uniques via `backend/test/helpers/test-data.ts`) — pas de fixtures partagées.
