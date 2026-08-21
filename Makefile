.PHONY: all install back front dev db-up db-down db-logs

# Default target — `make` alone runs this
all: dev

install:
	cd backend && npm install
	cd frontend && npm install

db-up:
	docker compose up -d mariadb

db-down:
	docker compose down

db-logs:
	docker compose logs -f mariadb

back:
	cd backend && npm run start:dev

front:
	cd frontend && npm run dev

# Lance la DB, puis backend + frontend ensemble
dev: db-up
	@$(MAKE) -j2 back front
