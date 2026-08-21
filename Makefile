.PHONY: all install back front dev db-up db-down db-logs certs docker-up docker-down

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
