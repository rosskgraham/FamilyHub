# Azure resources are built from Bicep by an Azure DevOps pipeline, on free tiers unless approved

The Hub's few Azure resources (the Key Vault the setup scripts read secrets from, and the Log Analytics workspace and Application Insights that telemetry goes to, ADR 0005) are written in Bicep in `infra/` and deployed by an Azure DevOps pipeline that builds from the GitHub repo. A pull request gets a lint and a what-if, and a merge to `main` deploys. Azure DevOps and Bicep are what the project's owner uses at work, which is the same reason telemetry goes to Azure. The pipeline signs in through a workload identity federation service connection, so no Azure secret is stored anywhere.

Everything uses a free tier or stays inside a free allowance by default, and anything billable needs Ross's approval first. Key Vault has no free tier; Standard, at about 2p per 10,000 reads, was approved. Log Analytics has a daily cap that keeps it inside the 5 GB a month that's free, so data past the cap is dropped rather than charged. Alert rules have no free tier, so they wait for their own approval.

Everything in Azure is Bicep, the resource group included: nothing is made by hand. So FamilyHub has a subscription of its own, the one thing created by hand, once. The pipeline deploys at the scope of that subscription, as Contributor on it, so it can create the resource group, and its rights reach no other project's resources. On top of that, it may give out exactly one role, Key Vault Secrets Officer, which the deployment gives Ross on the vault. The secrets themselves are never in Bicep or the pipeline: Ross puts them in the Key Vault, apart from the Application Insights connection string, which the deployment writes there itself.

## Considered Options

- **GitHub Actions with OIDC:** simpler, since CI already runs there, but not the stack used at work.
- **Deploying by hand with `az`:** fine for four resources, but nothing would show a change before it happens, and the setup couldn't be rebuilt from the repo.
- **Terraform:** needs somewhere to keep its state, which is one more thing to secure and pay for.
- **The resource group created by hand, with the pipeline as Contributor on it alone:** the tightest rights, and what this ADR first chose, but it leaves a piece of Azure outside the code.
- **Contributor on the subscription that holds other projects:** no new subscription, but the pipeline could then change or delete their resources.
