# Migrations

Versioned, reversible MikroORM migrations live here. Each migration exposes an `up()`
and a `down()` method so every change can be rolled back.

Common commands (see `package.json` scripts):

```bash
bun run migration:create   # generate a new migration from entity diff
bun run migration:up       # apply pending migrations
bun run migration:down     # revert the last migration
bun run migration:pending  # list migrations not yet applied
bun run migration:list     # list all executed migrations
```
