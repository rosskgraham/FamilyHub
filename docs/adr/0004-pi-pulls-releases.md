# The Pi pulls its own releases and rolls back if unhealthy

Every merge to `main` builds a versioned release on GitHub. The Pi checks for a newer release every few minutes, installs it beside the current one, switches over, and switches back automatically if the new version fails its health check. Pushing from CI isn't possible because nothing outside the house can reach the Pi (ADR 0002), and running a GitHub Actions runner on the Pi would mean the wall display also runs build jobs.

## Considered Options

- **Self-hosted GitHub Actions runner on the Pi:** simpler, outbound-only, but builds run on the Hub and there's no built-in rollback.
- **Manual deploys over SSH:** fine for a hobby, but not the production-grade bar this project holds itself to.
