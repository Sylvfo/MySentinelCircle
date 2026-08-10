.PHONY: install back front dev

install:
	cd backend && npm install
	cd frontend && npm install

back:
	cd backend && npm run start:dev

front:
	cd frontend && npm run dev

# Lance backend + frontend ensemble
dev:
	@$(MAKE) -j2 back front
