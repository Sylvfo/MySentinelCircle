# MySentinelCircle — backend

NestJS + Prisma/PostgreSQL (Neon). See `../plan.txt` for the product design
and `prisma/schema.prisma` for the data model (mirrors plan.txt's DATA MODEL
sketch).

## Setup

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL with your Neon connection string
npx prisma migrate dev --name init
npm run start:dev
```

`DATABASE_URL` needs a real Postgres instance (Neon dashboard -> Connection
Details -> Prisma-formatted string) before the app can boot past module
init — until then it fails at `PrismaService.onModuleInit` trying to reach
the placeholder host.

## Structure

One NestJS module per plan.txt's BACKEND MODULES section: `auth`, `user`,
`sentinel` (circles/memberships), `alert`, `organization`, `messaging`.
Each is currently a skeleton (empty controller/service) — logic gets filled
in module by module.
