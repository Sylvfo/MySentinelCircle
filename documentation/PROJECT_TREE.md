# Arbre du projet

26 750 lignes dans 229 fichiers texte (lignes vides et commentaires inclus).

Exclusions : `.git`, `node_modules`, `dist`, `build`, `coverage`, fichiers de verrouillage, source maps et ce rapport. Les fichiers binaires sont indiqués sans comptage. Le nombre de fichiers par dossier inclut ses sous-dossiers et les fichiers binaires affichés.

```text
MySentinelCircle/ — 231 fichiers
├── .claude/ — 12 fichiers
│   ├── preferencesSyl/ — 1 fichier
│   │   └── etiquette.md — 7 lignes
│   ├── skills/ — 8 fichiers
│   │   ├── debug/ — 1 fichier
│   │   │   └── SKILL.md — 27 lignes
│   │   ├── docu/ — 1 fichier
│   │   │   └── SKILL.md — 75 lignes
│   │   ├── end-session/ — 1 fichier
│   │   │   └── SKILL.md — 11 lignes
│   │   ├── new-feature/ — 1 fichier
│   │   │   └── SKILL.md — 39 lignes
│   │   ├── new-session/ — 1 fichier
│   │   │   └── SKILL.md — 31 lignes
│   │   └── svg-verification/ — 3 fichiers
│   │       ├── check.sh — 0 lignes
│   │       ├── reference.md — 0 lignes
│   │       └── SKILL.md — 0 lignes
│   ├── lastupdate.md — 122 lignes
│   ├── settings.json — 51 lignes
│   └── settings.local.json.bak — 9 lignes
├── .github/ — 1 fichier
│   └── workflows/ — 1 fichier
│       └── backend-ci.yml — 73 lignes
├── .vscode/ — 1 fichier
│   └── settings.json — 3 lignes
├── backend/ — 139 fichiers
│   ├── prisma/ — 20 fichiers
│   │   ├── migrations/ — 17 fichiers
│   │   │   ├── 20260821132558_init_mariadb/ — 1 fichier
│   │   │   │   └── migration.sql — 224 lignes
│   │   │   ├── 20260824083202_add_password_reset/ — 1 fichier
│   │   │   │   └── migration.sql — 12 lignes
│   │   │   ├── 20260824143321_add_uncomplete_usertype/ — 1 fichier
│   │   │   │   └── migration.sql — 2 lignes
│   │   │   ├── 20260824151747_add_avatar_path/ — 1 fichier
│   │   │   │   └── migration.sql — 2 lignes
│   │   │   ├── 20260824181400_add_stepup_and_pending_email/ — 1 fichier
│   │   │   │   └── migration.sql — 14 lignes
│   │   │   ├── 20260825130914_add_reserve_circle_type/ — 1 fichier
│   │   │   │   └── migration.sql — 2 lignes
│   │   │   ├── 20260825154104_add_proposed_circle_id/ — 1 fichier
│   │   │   │   └── migration.sql — 2 lignes
│   │   │   ├── 20261021142020_add_messaging_settings/ — 1 fichier
│   │   │   │   └── migration.sql — 12 lignes
│   │   │   ├── 20261026153655_add_alert_attribution_fields/ — 1 fichier
│   │   │   │   └── migration.sql — 17 lignes
│   │   │   ├── 20261026164942_add_direct_messaging_settings/ — 1 fichier
│   │   │   │   └── migration.sql — 8 lignes
│   │   │   ├── 20261028141904_add_notifications/ — 1 fichier
│   │   │   │   └── migration.sql — 21 lignes
│   │   │   ├── 20261028202931_add_call_order_and_circle_reminder/ — 1 fichier
│   │   │   │   └── migration.sql — 5 lignes
│   │   │   ├── 20261029092757_add_alert_lead_claimed_notification_type/ — 1 fichier
│   │   │   │   └── migration.sql — 2 lignes
│   │   │   ├── 20261029102626_add_group_circles/ — 1 fichier
│   │   │   │   └── migration.sql — 40 lignes
│   │   │   ├── 20261029212930_add_death_notice_fields/ — 1 fichier
│   │   │   │   └── migration.sql — 24 lignes
│   │   │   ├── 20261102092129_drop_dead_circle_fields_and_paid_account/ — 1 fichier
│   │   │   │   └── migration.sql — 14 lignes
│   │   │   └── migration_lock.toml — 3 lignes
│   │   ├── DB_schema.md — 479 lignes
│   │   ├── schema.prisma — 440 lignes
│   │   └── seed.ts — 585 lignes
│   ├── script/ — 1 fichier
│   │   └── entrypoint.sh — 8 lignes
│   ├── scripts/ — 1 fichier
│   │   └── create-test-db.sh — 14 lignes
│   ├── src/ — 93 fichiers
│   │   ├── alert/ — 9 fichiers
│   │   │   ├── dto/ — 5 fichiers
│   │   │   │   ├── create-alert.dto.ts — 16 lignes
│   │   │   │   ├── request-circle.dto.ts — 12 lignes
│   │   │   │   ├── respond-alert.dto.ts — 8 lignes
│   │   │   │   ├── update-alert-label.dto.ts — 9 lignes
│   │   │   │   └── update-alert-status.dto.ts — 11 lignes
│   │   │   ├── alert.controller.ts — 103 lignes
│   │   │   ├── alert.module.ts — 12 lignes
│   │   │   ├── alert.service.spec.ts — 1 695 lignes
│   │   │   └── alert.service.ts — 1 107 lignes
│   │   ├── auth/ — 19 fichiers
│   │   │   ├── decorators/ — 1 fichier
│   │   │   │   └── current-user.decorator.ts — 10 lignes
│   │   │   ├── dto/ — 10 fichiers
│   │   │   │   ├── confirm-password-reset.dto.ts — 12 lignes
│   │   │   │   ├── dev-login.dto.ts — 7 lignes
│   │   │   │   ├── login-email.dto.ts — 12 lignes
│   │   │   │   ├── login-google.dto.ts — 8 lignes
│   │   │   │   ├── request-otp.dto.ts — 8 lignes
│   │   │   │   ├── request-password-reset.dto.ts — 8 lignes
│   │   │   │   ├── signup-email.dto.ts — 49 lignes
│   │   │   │   ├── signup-google.dto.ts — 46 lignes
│   │   │   │   ├── signup-phone.dto.ts — 18 lignes
│   │   │   │   └── verify-otp.dto.ts — 12 lignes
│   │   │   ├── guards/ — 1 fichier
│   │   │   │   └── jwt-auth.guard.ts — 5 lignes
│   │   │   ├── otp/ — 2 fichiers
│   │   │   │   ├── console-otp-sender.service.ts — 35 lignes
│   │   │   │   └── otp-sender.interface.ts — 5 lignes
│   │   │   ├── strategies/ — 1 fichier
│   │   │   │   └── jwt.strategy.ts — 19 lignes
│   │   │   ├── auth.controller.ts — 99 lignes
│   │   │   ├── auth.module.ts — 33 lignes
│   │   │   ├── auth.service.spec.ts — 708 lignes
│   │   │   └── auth.service.ts — 369 lignes
│   │   ├── email/ — 3 fichiers
│   │   │   ├── console-email-sender.service.ts — 31 lignes
│   │   │   ├── email-sender.interface.ts — 8 lignes
│   │   │   └── email.module.ts — 10 lignes
│   │   ├── messaging/ — 5 fichiers
│   │   │   ├── dto/ — 1 fichier
│   │   │   │   └── send-message.dto.ts — 8 lignes
│   │   │   ├── messaging.controller.ts — 95 lignes
│   │   │   ├── messaging.module.ts — 11 lignes
│   │   │   ├── messaging.service.spec.ts — 420 lignes
│   │   │   └── messaging.service.ts — 250 lignes
│   │   ├── notification/ — 6 fichiers
│   │   │   ├── console-push-sender.service.ts — 20 lignes
│   │   │   ├── notification.controller.ts — 25 lignes
│   │   │   ├── notification.module.ts — 20 lignes
│   │   │   ├── notification.service.spec.ts — 138 lignes
│   │   │   ├── notification.service.ts — 102 lignes
│   │   │   └── push-sender.interface.ts — 14 lignes
│   │   ├── organization/ — 3 fichiers
│   │   │   ├── organization.controller.ts — 4 lignes
│   │   │   ├── organization.module.ts — 9 lignes
│   │   │   └── organization.service.ts — 4 lignes
│   │   ├── prisma/ — 2 fichiers
│   │   │   ├── prisma.module.ts — 9 lignes
│   │   │   └── prisma.service.ts — 16 lignes
│   │   ├── realtime/ — 4 fichiers
│   │   │   ├── realtime-notifier.interface.ts — 10 lignes
│   │   │   ├── realtime.gateway.spec.ts — 70 lignes
│   │   │   ├── realtime.gateway.ts — 63 lignes
│   │   │   └── realtime.module.ts — 20 lignes
│   │   ├── sentinel/ — 14 fichiers
│   │   │   ├── dto/ — 9 fichiers
│   │   │   │   ├── accept-membership.dto.ts — 11 lignes
│   │   │   │   ├── create-circle.dto.ts — 10 lignes
│   │   │   │   ├── create-group.dto.ts — 10 lignes
│   │   │   │   ├── inbound-sms.dto.ts — 12 lignes
│   │   │   │   ├── invite-sentinel.dto.ts — 32 lignes
│   │   │   │   ├── invite-to-group.dto.ts — 8 lignes
│   │   │   │   ├── request-sentinel.dto.ts — 8 lignes
│   │   │   │   ├── update-circle.dto.ts — 21 lignes
│   │   │   │   └── update-membership.dto.ts — 50 lignes
│   │   │   ├── sentinel-sms.controller.ts — 16 lignes
│   │   │   ├── sentinel.controller.ts — 266 lignes
│   │   │   ├── sentinel.module.ts — 15 lignes
│   │   │   ├── sentinel.service.spec.ts — 2 020 lignes
│   │   │   └── sentinel.service.ts — 1 805 lignes
│   │   ├── sms/ — 4 fichiers
│   │   │   ├── console-sms-sender.service.ts — 31 lignes
│   │   │   ├── messages.ts — 188 lignes
│   │   │   ├── sms-sender.interface.ts — 8 lignes
│   │   │   └── sms.module.ts — 12 lignes
│   │   ├── user/ — 19 fichiers
│   │   │   ├── dto/ — 13 fichiers
│   │   │   │   ├── add-phone.dto.ts — 8 lignes
│   │   │   │   ├── change-email-request.dto.ts — 8 lignes
│   │   │   │   ├── change-password.dto.ts — 12 lignes
│   │   │   │   ├── confirm-email-change.dto.ts — 8 lignes
│   │   │   │   ├── dev-set-has-paid.dto.ts — 10 lignes
│   │   │   │   ├── set-death-notice-recipients.dto.ts — 31 lignes
│   │   │   │   ├── step-up-code-request.dto.ts — 8 lignes
│   │   │   │   ├── step-up-code-verify.dto.ts — 8 lignes
│   │   │   │   ├── step-up-google.dto.ts — 8 lignes
│   │   │   │   ├── step-up-password.dto.ts — 8 lignes
│   │   │   │   ├── update-death-notice.dto.ts — 11 lignes
│   │   │   │   ├── update-profile.dto.ts — 53 lignes
│   │   │   │   └── verify-add-phone.dto.ts — 8 lignes
│   │   │   ├── email-confirmation.controller.ts — 18 lignes
│   │   │   ├── user-status.util.ts — 17 lignes
│   │   │   ├── user.controller.ts — 189 lignes
│   │   │   ├── user.module.ts — 18 lignes
│   │   │   ├── user.service.spec.ts — 785 lignes
│   │   │   └── user.service.ts — 508 lignes
│   │   ├── app.controller.spec.ts — 22 lignes
│   │   ├── app.controller.ts — 12 lignes
│   │   ├── app.module.ts — 43 lignes
│   │   ├── app.service.ts — 8 lignes
│   │   └── main.ts — 29 lignes
│   ├── test/ — 10 fichiers
│   │   ├── helpers/ — 1 fichier
│   │   │   └── test-data.ts — 30 lignes
│   │   ├── alert.e2e-spec.ts — 1 262 lignes
│   │   ├── app.e2e-spec.ts — 29 lignes
│   │   ├── auth.e2e-spec.ts — 211 lignes
│   │   ├── global-setup.js — 26 lignes
│   │   ├── global-teardown.js — 3 lignes
│   │   ├── jest-e2e.json — 14 lignes
│   │   ├── messaging.e2e-spec.ts — 462 lignes
│   │   ├── sentinel.e2e-spec.ts — 612 lignes
│   │   └── user.e2e-spec.ts — 256 lignes
│   ├── .dockerignore — 3 lignes
│   ├── .env.example — 27 lignes
│   ├── .env.test.example — 6 lignes
│   ├── .gitignore — 12 lignes
│   ├── .prettierrc — 4 lignes
│   ├── Dockerfile — 17 lignes
│   ├── eslint.config.mjs — 47 lignes
│   ├── nest-cli.json — 8 lignes
│   ├── package.json — 98 lignes
│   ├── prisma.config.ts — 15 lignes
│   ├── README.md — 28 lignes
│   ├── recu — 0 lignes
│   ├── tsconfig.build.json — 4 lignes
│   └── tsconfig.json — 25 lignes
├── frontend/ — 57 fichiers
│   ├── public/ — 2 fichiers
│   │   ├── favicon.png — binaire
│   │   └── favicon.svg — 16 lignes
│   ├── src/ — 43 fichiers
│   │   ├── api/ — 7 fichiers
│   │   │   ├── alert.ts — 134 lignes
│   │   │   ├── auth.ts — 45 lignes
│   │   │   ├── client.ts — 106 lignes
│   │   │   ├── messaging.ts — 48 lignes
│   │   │   ├── notification.ts — 33 lignes
│   │   │   ├── sentinel.ts — 232 lignes
│   │   │   └── user.ts — 88 lignes
│   │   ├── assets/ — 2 fichiers
│   │   │   ├── logo.png — binaire
│   │   │   └── vite.svg — 1 lignes
│   │   ├── auth/ — 3 fichiers
│   │   │   ├── AuthContext.tsx — 83 lignes
│   │   │   ├── loadGoogleScript.ts — 33 lignes
│   │   │   └── ProtectedRoute.tsx — 11 lignes
│   │   ├── components/ — 9 fichiers
│   │   │   ├── AppShell.tsx — 50 lignes
│   │   │   ├── BottomNav.tsx — 38 lignes
│   │   │   ├── CircleRing.tsx — 105 lignes
│   │   │   ├── GoogleSignInButton.tsx — 48 lignes
│   │   │   ├── LanguageSwitcher.tsx — 19 lignes
│   │   │   ├── Modal.tsx — 52 lignes
│   │   │   ├── NotificationBell.tsx — 121 lignes
│   │   │   ├── StepUp.tsx — 153 lignes
│   │   │   └── Tile.tsx — 27 lignes
│   │   ├── i18n/ — 3 fichiers
│   │   │   ├── locales/ — 2 fichiers
│   │   │   │   ├── en.json — 398 lignes
│   │   │   │   └── fr.json — 398 lignes
│   │   │   └── index.ts — 27 lignes
│   │   ├── pages/ — 14 fichiers
│   │   │   ├── AlertsPage.tsx — 821 lignes
│   │   │   ├── CirclesPage.tsx — 792 lignes
│   │   │   ├── CompanionsPage.tsx — 263 lignes
│   │   │   ├── ConfirmEmailChangePage.tsx — 59 lignes
│   │   │   ├── DashboardPage.tsx — 105 lignes
│   │   │   ├── ForgotPasswordPage.tsx — 56 lignes
│   │   │   ├── HistoryPage.tsx — 50 lignes
│   │   │   ├── LoginPage.tsx — 180 lignes
│   │   │   ├── MessagesPage.tsx — 290 lignes
│   │   │   ├── OtpVerifyPage.tsx — 93 lignes
│   │   │   ├── ResetPasswordPage.tsx — 81 lignes
│   │   │   ├── RunningAlertPage.tsx — 62 lignes
│   │   │   ├── SettingsPage.tsx — 693 lignes
│   │   │   └── SignupPage.tsx — 179 lignes
│   │   ├── realtime/ — 1 fichier
│   │   │   └── socket.ts — 16 lignes
│   │   ├── App.tsx — 50 lignes
│   │   ├── index.css — 760 lignes
│   │   ├── main.tsx — 14 lignes
│   │   └── theme.ts — 32 lignes
│   ├── .dockerignore — 3 lignes
│   ├── .env.example — 6 lignes
│   ├── .gitignore — 24 lignes
│   ├── .oxlintrc.json — 8 lignes
│   ├── Dockerfile — 10 lignes
│   ├── index.html — 13 lignes
│   ├── package.json — 30 lignes
│   ├── README.md — 34 lignes
│   ├── tsconfig.app.json — 26 lignes
│   ├── tsconfig.json — 7 lignes
│   ├── tsconfig.node.json — 23 lignes
│   └── vite.config.ts — 19 lignes
├── nginx/ — 2 fichiers
│   ├── Dockerfile — 4 lignes
│   └── nginx.conf — 142 lignes
├── nosmsnow/ — 2 fichiers
│   ├── package.json — 10 lignes
│   └── server.js — 97 lignes
├── notes/ — 2 fichiers
│   ├── notesaeffacer.txt — 27 lignes
│   └── review.txt — 11 lignes
├── .env.example — 4 lignes
├── .gitignore — 9 lignes
├── API.md — 132 lignes
├── basedb.txt — 121 lignes
├── buildingCLaudeRules.md — 83 lignes
├── CLAUDE.md — 65 lignes
├── docker-compose.yml — 74 lignes
├── FEATURES.md — 63 lignes
├── Makefile — 51 lignes
├── NOSMSNOW.md — 91 lignes
├── PERMISSIONSCLAUDE.md — 39 lignes
├── plan.txt — 618 lignes
├── README.md — 69 lignes
├── STACK_SCHEMA.md — 119 lignes
└── TEST.md — 133 lignes
```
