# The Pi pulls its own releases and rolls back if unhealthy

Every merge to `main` builds a versioned release on GitHub. The Pi checks for a newer release every few minutes, installs it beside the current one, switches over, and switches back automatically if the new version fails its health check. Pushing from CI isn't possible because nothing outside the house can reach the Pi (ADR 0002), and running a GitHub Actions runner on the Pi would mean the wall display also runs build jobs.

A release folder holds only the app. What the Hub writes (the Google sign-in, settings, saved answers and databases) and what Alex writes by hand (`household.json` and `chores.json`) live on the data partition, outside every release, in the folders `HUB_DATA_DIR` and `HUB_CONFIG_DIR` name. So switching releases, either way, never loses a sign-in or a Star.

## Considered Options

- **Self-hosted GitHub Actions runner on the Pi:** simpler, outbound-only, but builds run on the Hub and there's no built-in rollback.
- **Manual deploys over SSH:** fine for a hobby, but not the production-grade bar this project holds itself to.
