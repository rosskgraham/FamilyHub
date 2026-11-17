# FamilyHub Azure resources

The Hub's Azure resources, in Bicep, deployed by an Azure DevOps pipeline ([ADR 0008](../docs/adr/0008-azure-resources-from-bicep-through-azure-devops.md)). Setup, and what each resource costs, are in [the Azure runbook](../docs/runbooks/azure-setup.md).

Everything is on a free tier or inside a free allowance by default. Anything billable needs Ross's approval first.

## What's here

- `main.bicep`: everything, deployed at the scope of FamilyHub's own subscription. It creates the `rg-familyhub` resource group and deploys `resources.bicep` into it.
- `resources.bicep`: the resources in `rg-familyhub`:
  - `kv-familyhub-<suffix>`: Key Vault (Standard), the setup scripts' secrets. Ross can read and write them. The deployment writes the Application Insights connection string into it.
  - `log-familyhub`: the Log Analytics workspace, capped at 0.15 GB a day and keeping 30 days, so it stays free.
  - `appi-familyhub`: Application Insights, for the Hub's telemetry ([ADR 0005](../docs/adr/0005-telemetry-via-otel-collector-to-app-insights.md)), and the backend's.
- `backend.bicep`: the family app's backend ([ADR 0011](../docs/adr/0011-backend-runs-on-functions-flex-consumption.md)), deployed by `resources.bicep`:
  - `asp-familyhub`: the Flex Consumption plan.
  - `func-familyhub-<suffix>`: the function app that runs [`backend/`](../backend/README.md): Python 3.12, 512 MB, at most 1 instance. It signs in to its storage account with its managed identity.
  - `stfamilyhub<suffix>`: its storage account, with no keys, holding the deployment package and the host's own state. The one billable part, approved at pennies a month.
  - `cosmos-familyhub-<suffix>`: Cosmos DB for NoSQL on the free tier, with its throughput capped at the free 1000 RU/s, and the `familyhub` database sharing it. No keys: the function app reads and writes with its managed identity.
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
