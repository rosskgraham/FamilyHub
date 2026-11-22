# FamilyHub Azure resources

The Hub's Azure resources, in Bicep, deployed by an Azure DevOps pipeline ([ADR 0008](../docs/adr/0008-azure-resources-from-bicep-through-azure-devops.md)). Setup, and what each resource costs, are in [the Azure runbook](../docs/runbooks/azure-setup.md).

Everything is on a free tier or inside a free allowance by default. Anything billable needs Ross's approval first.

## What's here

- `main.bicep`: everything, deployed at the scope of FamilyHub's own subscription. It creates the `rg-familyhub` resource group and deploys `resources.bicep` into it.
- `resources.bicep`: the resources in `rg-familyhub`:
  - `kv-familyhub-<suffix>`: Key Vault (Standard), the setup scripts' secrets, and the Hub's sign-in certificate. Ross can read and write both. The deployment writes the Application Insights connection string into it.
  - `log-familyhub`: the Log Analytics workspace, capped at 0.15 GB a day and keeping 30 days, so it stays free.
  - `appi-familyhub`: Application Insights, for the Hub's telemetry ([ADR 0005](../docs/adr/0005-telemetry-via-otel-collector-to-app-insights.md)), and the backend's.
  - `swa-familyhub-<suffix>`: Static Web Apps on the free plan, serving [`family-app/`](../family-app/README.md) at its `*.azurestaticapps.net` address ([ADR 0010](../docs/adr/0010-shared-lists-in-an-azure-backend-with-an-installable-family-app.md)). It's managed from West Europe, as it isn't offered in UK South, and its files are served from Azure's edge. The pipeline uploads the build with a deployment token it reads at the time, so the token isn't stored.
- `backend.bicep`: the family app's backend ([ADR 0011](../docs/adr/0011-backend-runs-on-functions-flex-consumption.md)), deployed by `resources.bicep`:
  - `asp-familyhub`: the Flex Consumption plan.
  - `func-familyhub-<suffix>`: the function app that runs [`backend/`](../backend/README.md): Python 3.12, 512 MB, at most 1 instance. It signs in to its storage account with its managed identity.
  - `stfamilyhub<suffix>`: its storage account, with no keys, holding the deployment package and the host's own state. The one billable part, approved at pennies a month.
  - `cosmos-familyhub-<suffix>`: Cosmos DB for NoSQL on the free tier, with its throughput capped at the free 1000 RU/s, and the `familyhub` database sharing it. Its `accounts` container holds the Household's accounts for sign-in ([ADR 0014](../docs/adr/0014-household-accounts-in-cosmos-db.md)), added by hand as the [sign-in runbook](../docs/runbooks/sign-in-setup.md) says. Its `lists` container holds the shared lists, one partition per list. Periodic backup runs once a day and keeps two days, the two copies that are free. No keys: the function app reads and writes with its managed identity, and the admin with the same data role, through Data Explorer.
  - `wps-familyhub-<suffix>`: Web PubSub on the free tier, which tells the Hub and open apps that something changed. No keys either.
- `budget-familyhub`, in `main.bicep`: a Cost Management budget of £5 a month on the subscription, which emails if it's passed.
- `main.bicepparam`: the parameters. `FAMILYHUB_ADMIN_OBJECT_ID` and `FAMILYHUB_BUDGET_EMAIL` come from the pipeline's `familyhub` variable group.
- `bicepconfig.json`: linter rules, as errors, so a pull request fails on them.
- `azure-pipelines.yml`: a pull request gets a lint, a what-if and the backend's tests, and a merge to `main` deploys the resources, then the backend, then checks it answers `/health`.
- `register-providers.sh`: turns on the Azure services the resources need, which a new subscription starts without. The pipeline runs it before each what-if and deploy.

## Check a change on the PC

```
az bicep lint --file infra/main.bicep
FAMILYHUB_ADMIN_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv) FAMILYHUB_BUDGET_EMAIL=<your email> \
  az deployment sub what-if --subscription FamilyHub --location uksouth --template-file infra/main.bicep --parameters infra/main.bicepparam
```
