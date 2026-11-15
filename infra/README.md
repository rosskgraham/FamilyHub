# FamilyHub Azure resources

The Hub's Azure resources, in Bicep, deployed by an Azure DevOps pipeline ([ADR 0008](../docs/adr/0008-azure-resources-from-bicep-through-azure-devops.md)). Setup, and what each resource costs, are in [the Azure runbook](../docs/runbooks/azure-setup.md).

Everything is on a free tier or inside a free allowance by default. Anything billable needs Ross's approval first.

## What's here

- `main.bicep`: the resources, in the `rg-familyhub` resource group:
  - `kv-familyhub-<suffix>`: Key Vault (Standard), the setup scripts' secrets. Ross can read and write them. The deployment writes the Application Insights connection string into it.
  - `log-familyhub`: the Log Analytics workspace, capped at 0.15 GB a day and keeping 30 days, so it stays free.
  - `appi-familyhub`: Application Insights, for the Hub's telemetry ([ADR 0005](../docs/adr/0005-telemetry-via-otel-collector-to-app-insights.md)).
- `main.bicepparam`: the parameters. `FAMILYHUB_ADMIN_OBJECT_ID` comes from the pipeline's `familyhub` variable group.
- `bicepconfig.json`: linter rules, as errors, so a pull request fails on them.
- `azure-pipelines.yml`: a pull request gets a lint and a what-if, and a merge to `main` deploys.

## Check a change on the PC

```
az bicep lint --file infra/main.bicep
FAMILYHUB_ADMIN_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv) \
  az deployment group what-if --resource-group rg-familyhub --template-file infra/main.bicep --parameters infra/main.bicepparam
```
