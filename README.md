# Distributed Wagering Processor

A NestJS service scaffold built with a strict, production-oriented stack. Business
domain modules are not implemented yet — this repository currently provides the
project's foundation (infrastructure, tooling, and conventions) so feature work
can start on top of it.

## Stack

- **Runtime / package manager / test runner:** [Bun](https://bun.sh) 1.x
- **Language:** TypeScript (strict mode)
- **Framework:** [NestJS](https://nestjs.com)
- **Database:** PostgreSQL
- **ORM:** [MikroORM](https://mikro-orm.io) (versioned, reversible migrations)
- **Messaging:** AWS SQS, emulated locally via LocalStack
- **Local orchestration:** Docker Compose
- **Validation:** [Zod](https://zod.dev)
- **Code style:** ESLint + Prettier (format-on-save configured in `.vscode/`)
- **Health checks:** separate liveness/readiness endpoints (`@nestjs/terminus`)

## Prerequisites

- [Bun](https://bun.sh) 1.x
- Docker + Docker Compose

## Project setup

Install dependencies:

```bash
bun install
```

Copy the example environment file and adjust it if needed:

```bash
cp .env.example .env
```

Start local infrastructure (PostgreSQL + LocalStack/SQS):

```bash
bun run docker:up
```

Apply database migrations:

```bash
bun run migration:up
```

## Running the app

```bash
# development
bun run start

# watch mode
bun run start:dev

# debug mode (watch + inspector)
bun run start:debug

# build for production
bun run build

# production mode (runs the compiled output)
bun run start:prod
```

Once running, health checks are available at:

- `GET /health/live` — liveness, no dependency checks.
- `GET /health/ready` — readiness, verifies PostgreSQL and SQS connectivity.

## Tests

```bash
# unit tests
bun run test

# unit tests in watch mode
bun run test:watch

# unit test coverage
bun run test:cov

# integration tests (spin up real PostgreSQL/LocalStack via testcontainers)
bun run test:e2e
```

## Migrations

Versioned, reversible MikroORM migrations (see [migrations/README.md](migrations/README.md)):

```bash
bun run migration:create   # generate a new migration
bun run migration:up       # apply pending migrations
bun run migration:down     # revert the last migration
bun run migration:pending  # list migrations not yet applied
bun run migration:list     # list all executed migrations
```

## Local infrastructure

```bash
bun run docker:up    # start PostgreSQL + LocalStack (SQS)
bun run docker:down  # stop and remove containers/volumes
```

## Code style

```bash
bun run lint    # eslint --fix
bun run format  # prettier --write
```

## Project structure

```
src/
  modules/    # feature modules wired into AppModule (e.g. health)
  shared/     # infrastructure providers injected into modules (database, sqs)
  config/     # environment validation (Zod)
  common/     # cross-cutting utilities (pipes, filters, ...)
  app.module.ts
  main.ts
test/
  integration/  # real integration tests (testcontainers: Postgres + LocalStack)
  support/      # shared test helpers
migrations/     # MikroORM migrations
docker/         # LocalStack bootstrap scripts
```

- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
