# Set up Azure for the Hub

The Hub's Azure resources are built by the pipeline in [`infra/`](../../infra/README.md) ([ADR 0008](../adr/0008-azure-resources-from-bicep-through-azure-devops.md)). Everything in Azure, the resource group included, is made by the pipeline, never by hand. This runbook covers the once-only setup around it: FamilyHub's own subscription, the Azure DevOps side, and putting the secrets in the Key Vault.

Do this signed in as Ross, with the Azure CLI on the PC (`az login`). It takes about 30 minutes. Azure DevOps renames its pages from time to time, so a heading may not match exactly.

## What it costs

| Resource | Tier | Expected cost |
|---|---|---|
| Key Vault | Standard. There's no free tier; about 2p per 10,000 reads | Under 1p a month |
| Log Analytics workspace | Pay-as-you-go, with 5 GB a month free, capped at 0.15 GB a day | £0. Data past the cap is dropped, not charged |
| Application Insights | Workspace-based, so it's billed through the workspace | £0 |
| Function app (the family app's backend) | Flex Consumption, 512 MB, at most 1 instance. 250,000 executions and 100,000 GB-seconds a month are free | £0. About 5% of the free grant is expected |
| Storage account (the function app's) | General-purpose v2, Standard LRS, Hot. No free tier | Pennies a month. Approved by Ross on 17 November 2026 ([ADR 0011](../adr/0011-backend-runs-on-functions-flex-consumption.md)) |
| Cosmos DB (the lists) | Free tier: 1000 RU/s and 25 GB for the account's lifetime, one account per subscription. Its throughput is capped at 1000 RU/s, so it can't go past the free tier | £0 |
| Web PubSub (live updates) | Free: 20 connections at once and 20,000 messages a day | £0 |
| Cost Management budget | £5 a month, emailing when it's passed | £0 |
| Azure DevOps | 1 free Microsoft-hosted parallel job (1,800 minutes a month) | £0 |

Nothing else is added without Ross's approval. Alert rules have no free tier, so they come later, with their own approval. The budget isn't an alert rule, and is free. Spending is expected never to go past the storage account's pennies, so its email means something is wrong.

## 1. Create FamilyHub's subscription

FamilyHub has an Azure subscription of its own, so the pipeline can create its resource group, and its rights reach nothing else on the account. A subscription costs nothing; only what's in it is billed.

1. In the Azure portal, **Subscriptions → + Add**, on the same billing account as the others.
2. Rename it `FamilyHub` (**Subscriptions → the new one → Rename**).

The pipeline turns on the Azure services it needs in it (`infra/register-providers.sh`), and creates `rg-familyhub` and everything in it.

## 2. Connect Azure DevOps to GitHub and Azure

In the Azure DevOps project:

1. **Project settings → Service connections → New service connection → Azure Resource Manager.**
   - Identity type: **App registration (automatic)**, with **Workload identity federation** as the credential.
   - Scope: **Subscription**, then choose the `FamilyHub` subscription, and leave the resource group empty.
   - Name: `familyhub-azure`. Leave **Grant access permission to all pipelines** off.

   This gives the connection **Contributor** on the `FamilyHub` subscription, with no secret to rotate. It can create the resource group, and can't reach any other subscription.

2. Let the connection give out five roles, and only those: **Key Vault Secrets Officer** and **Key Vault Certificates Officer**, which the deployment gives Ross on the vault, and **Storage Blob Data Owner**, **Web PubSub Service Owner** and **Key Vault Secrets User**, which it gives the function app on its storage account, Web PubSub, and the one secret it signs Members in with. (Cosmos DB's data role is Cosmos DB's own, not an Azure role, so Contributor already covers it.) Find the connection's app ID under **Manage App registration**, then, in Git Bash:

   ```
   sub=$(az account show --subscription FamilyHub --query id --output tsv)
   az role assignment create \
     --assignee <the connection's app ID> \
     --role "Role Based Access Control Administrator" \
     --scope "/subscriptions/$sub" \
     --condition-version 2.0 \
     --condition "((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {b86a8fe4-44ce-4948-aee5-eccb2c155cd7, b7e6dc6d-f1e8-4753-8033-0f276bb0955b, 12cf5a90-567b-43ae-8102-96cf46c7d9b4, a4417e6f-fecd-4de8-b567-7b0420556985, 4633458b-17de-408a-b874-0445c86b69e6})) AND ((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {b86a8fe4-44ce-4948-aee5-eccb2c155cd7, b7e6dc6d-f1e8-4753-8033-0f276bb0955b, 12cf5a90-567b-43ae-8102-96cf46c7d9b4, a4417e6f-fecd-4de8-b567-7b0420556985, 4633458b-17de-408a-b874-0445c86b69e6}))"
   ```

   Or in PowerShell:

   ```powershell
   $sub = az account show --subscription FamilyHub --query id --output tsv
   $condition = @'
   ((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {b86a8fe4-44ce-4948-aee5-eccb2c155cd7, b7e6dc6d-f1e8-4753-8033-0f276bb0955b, 12cf5a90-567b-43ae-8102-96cf46c7d9b4, a4417e6f-fecd-4de8-b567-7b0420556985, 4633458b-17de-408a-b874-0445c86b69e6})) AND ((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {b86a8fe4-44ce-4948-aee5-eccb2c155cd7, b7e6dc6d-f1e8-4753-8033-0f276bb0955b, 12cf5a90-567b-43ae-8102-96cf46c7d9b4, a4417e6f-fecd-4de8-b567-7b0420556985, 4633458b-17de-408a-b874-0445c86b69e6}))
   '@
   az role assignment create `
     --assignee <the connection's app ID> `
     --role "Role Based Access Control Administrator" `
     --scope "/subscriptions/$sub" `
     --condition-version 2.0 `
     --condition $condition.Trim()
   ```

   If the connection already has this role from an earlier setup, which allowed fewer roles, edit its condition instead: **Subscriptions → FamilyHub → Access control (IAM) → Role assignments**, then the connection's **Role Based Access Control Administrator**, and add the missing roles to the condition for both adding and removing role assignments. Web PubSub Service Owner was added on 17 November 2026, and Key Vault Certificates Officer (`a4417e6f-fecd-4de8-b567-7b0420556985`) on 22 November 2026, for the Hub's certificate ([the sign-in runbook](sign-in-setup.md), step 6). Key Vault Secrets User (`4633458b-17de-408a-b874-0445c86b69e6`) was added on 26 November 2026, so the function app can read `family-app-client-secret` (ADR 0016). Without it, the deploy fails with "does not have permission to perform action 'Microsoft.Authorization/roleAssignments/write'".

3. **Pipelines → Library → + Variable group.** Name it `familyhub`, and add two variables. Neither is secret, but the repo is public, so they're kept here:
   - `FAMILYHUB_ADMIN_OBJECT_ID`: the output of `az ad signed-in-user show --query id --output tsv`.
   - `FAMILYHUB_BUDGET_EMAIL`: where the £5 budget sends its email if it's passed.

4. **Pipelines → Environments → New environment:** `familyhub-azure`, with no resources. Adding an **Approvals** check here makes every deploy wait for a click. That's optional.

5. **Pipelines → New pipeline → GitHub (YAML)**, then choose the FamilyHub repo. If asked, install the Azure Pipelines app on that repo only. Choose **Existing Azure Pipelines YAML file**, and pick `/infra/azure-pipelines.yml`. Save it without running it, then rename it `familyhub-infra`.

6. In that pipeline: **Edit → ⋮ → Triggers → Pull request validation**, and turn off **Build pull requests from forks of this repository**. The repo is public, and fork builds must never reach the subscription. The pipeline skips the what-if for forks too, as a second guard.

7. Run the pipeline. The first run asks you to **Permit** the variable group, the service connection and the environment.

If the run waits with "No hosted parallelism has been purchased or granted", the organisation hasn't got its free hosted job yet. Request it, for free, at <https://aka.ms/azpipelines-parallelism-request>. It takes a few working days.

## 3. Put the secrets in the Key Vault

The deployment's output gives `keyVaultName`, and the Application Insights connection string is already in the vault. Add the rest, one at a time. `read -rs` keeps each value out of the shell history and off the screen:

```
vault=<keyVaultName>
for name in google-client-id google-client-secret nest-project-id octopus-account octopus-api-key zappi-glo-sn zappi-glo-api-key home-latitude home-longitude; do
  read -rsp "$name: " value; echo
  az keyvault secret set --vault-name "$vault" --name "$name" --value "$value" --output none
done
```

The values are the ones in `app/.env` on the PC. The Household and Chores aren't kept here: they live in the Hub's own database, and the Household is set up in Settings at the Hub ([ADR 0012](../adr/0012-household-and-settings-in-the-hub-database.md)). A vault made before that may still have `household-json` and `chores-json`. Once a release with ADR 0012 has started on the Pi, which imports them, delete both:

```
az keyvault secret delete --vault-name "$vault" --name household-json
az keyvault secret delete --vault-name "$vault" --name chores-json
```

The Pi's setup scripts copy the secrets to the Pi ([the Pi runbook](pi-setup.md), step 5). Any that are left out, the Hub shows sample data for. To change one later, set it again, then run the scripts with `--tags config`.

## Changing the resources

Change `infra/main.bicep` in a pull request. The pipeline's what-if lists what would change, and merging deploys it. Before adding anything billable, get Ross's approval and update the cost table above.
