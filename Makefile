.PHONY: all setup env install back front dev db-up db-down db-logs db-migrate db-seed db-test-init certs docker-up docker-down nosmsnow nosmsnow-docker demo

# Default target — `make` alone runs this
all: dev

# First install on a new machine — safe to re-run, keeps existing env files and data
setup: env install certs db-up db-migrate db-test-init db-seed

# Creates missing env files from their examples, DB credentials taken from the root .env
env:
	@[ -f .env ] || cp .env.example .env
	@[ -f backend/.env ] || cp backend/.env.example backend/.env
	@[ -f backend/.env.test ] || cp backend/.env.test.example backend/.env.test
	@set -a; . ./.env; set +a; \
	sed -i "s|<MARIADB_USER>|$$MARIADB_USER|g; s|<MARIADB_PASSWORD>|$$MARIADB_PASSWORD|g; s|<MARIADB_DATABASE>|$$MARIADB_DATABASE|g" \
		backend/.env backend/.env.test

install:
	cd backend && npm install
	cd frontend && npm install

db-up:
	docker compose up -d --wait mariadb

db-down:
	docker compose stop mariadb

db-logs:
	docker compose logs -f mariadb

# Applies pending migrations to the dev DB — never drops data
db-migrate:
	cd backend && npx prisma generate && npx prisma migrate deploy

# Demo accounts, idempotent — dev DB only
db-seed:
	cd backend && npm run seed:dev

db-test-init:
	bash backend/scripts/create-test-db.sh

back:
	cd backend && npm run start:dev

front:
	cd frontend && npm run dev

# Lance la DB, puis backend + frontend ensemble
dev: db-up
	@$(MAKE) -j2 back front

certs:
	@mkdir -p nginx/ssl
	@if [ -f nginx/ssl/cert.pem ] && [ -f nginx/ssl/key.pem ]; then \
		echo "nginx/ssl/cert.pem and key.pem already exist, skipping"; \
	else \
		openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
			-keyout nginx/ssl/key.pem -out nginx/ssl/cert.pem \
			-subj "/C=CH/ST=Vaud/L=Lausanne/O=MySentinelCircle/CN=localhost"; \
	fi

docker-up: certs
	docker compose up -d --build

docker-down:
	docker compose down

# One-command demo from a fresh clone — only Docker, make, openssl and curl
# needed (no Node on the host). Starts the whole stack, waits for it, loads
# the demo accounts + their profile photos (seed run inside the backend
# container, idempotent), then prints where to log in. Safe to re-run.
DEMO_URL := https://localhost:4444

demo: env docker-up
	@printf "Waiting for the backend"; \
	for i in $$(seq 1 90); do \
		code=$$(curl -sk -o /dev/null -w '%{http_code}' $(DEMO_URL)/user/me); \
		[ "$$code" = "401" ] && break; \
		printf "."; sleep 2; \
	done; echo; \
	if [ "$$code" != "401" ]; then \
		echo "Backend didn't come up — see: docker compose logs backend"; exit 1; \
	fi
	@printf "Waiting for the frontend"; \
	for i in $$(seq 1 60); do \
		code=$$(curl -sk -o /dev/null -w '%{http_code}' $(DEMO_URL)/); \
		[ "$$code" = "200" ] && break; \
		printf "."; sleep 2; \
	done; echo
	docker compose exec -T backend npm run seed:dev
	@echo ""
	@echo "  MySentinelCircle is ready: $(DEMO_URL)"
	@echo "  (local self-signed certificate: accept the browser warning)"
	@echo ""
	@echo "  Log in with phone + password:"
	@echo "    Phone            Password        Account"
	@echo "    +41791112233     TestPass1234!   Léa Dubois"
	@echo "    +41761445566     TestPass1234!   Gabriel Rochat"
	@echo "    +41791556677     TestPass1234!   Chloé Morel"
	@echo "    +41781667788     TestPass1234!   Mathis Perrin"
	@echo ""
	@echo "  Feedback inbox (reads every Give feedback message, in Messages):"
	@echo "    +41790000001     TestPass1234!   Équipe MySentinelCircle"
	@echo ""
	@echo "  SMS codes (OTP) are printed in: docker compose logs -f backend"
	@echo "  Stop: make docker-down"

# Optional, opt-in — terminal stand-in for a real SMS/email provider.
# Not wired into dev/all; run it in its own terminal when you want it.
nosmsnow:
	cd nosmsnow && npm start

# Same, when the backend runs through docker-up: it is only reachable through
# nginx, whose local certificate is self-signed.
nosmsnow-docker:
	cd nosmsnow && BACKEND_URL=https://localhost:4444 NODE_TLS_REJECT_UNAUTHORIZED=0 npm start
