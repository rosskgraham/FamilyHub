// FamilyHub's Azure resources: a Key Vault for the setup scripts' secrets, and Log Analytics with
// Application Insights for the Hub's telemetry (ADR 0005). Everything is on a free tier or inside a
// free allowance, apart from Key Vault, which has no free tier and was approved at a few pence a year.
// Deployed to an existing resource group by infra/azure-pipelines.yml.

targetScope = 'resourceGroup'

@description('Where the resources live.')
param location string = resourceGroup().location

@description('The Entra object ID of the person who runs the setup scripts. They can read and write the secrets.')
param adminObjectId string

@description('The most the Log Analytics workspace takes in a day, in GB. 0.15 a day stays inside the 5 GB a month that is free; past it, data is dropped rather than charged. A string, because Bicep has no decimals.')
param dailyCapGb string = '0.15'

@description('How long telemetry is kept. Up to 31 days is free.')
@minValue(30)
@maxValue(31)
param retentionDays int = 30

// Key Vault names are global, so a short suffix from the resource group keeps this one unique.
var suffix = take(uniqueString(resourceGroup().id), 6)
var tags = {
  project: 'familyhub'
}

// Built-in role: read and write secrets, nothing else.
var keyVaultSecretsOfficer = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

resource vault 'Microsoft.KeyVault/vaults@2026-05-15' = {
  name: 'kv-familyhub-${suffix}'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    // Standard: per-operation billing, about 2p per 10,000 reads. Premium (HSM-backed) would be paid monthly.
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    // Soft delete can't be turned off; the shortest window keeps a deleted vault's name free again soonest.
    // No purge protection, so the vault can always be removed for good.
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

resource adminCanUseSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, adminObjectId, keyVaultSecretsOfficer)
  scope: vault
  properties: {
    principalId: adminObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsOfficer)
  }
}

resource workspace 'Microsoft.OperationalInsights/workspaces@2026-03-01' = {
  name: 'log-familyhub'
  location: location
  tags: tags
  properties: {
    // Pay-as-you-go is the only SKU new workspaces can have; the first 5 GB a month are free, and the cap keeps it there.
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionDays
    workspaceCapping: {
      dailyQuotaGb: json(dailyCapGb)
    }
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-familyhub'
  location: location
  tags: tags
  kind: 'other'
  properties: {
    Application_Type: 'other'
    WorkspaceResourceId: workspace.id
    RetentionInDays: retentionDays
  }
}

// The setup scripts copy this to the Pi; it's the only Azure credential the Pi holds.
resource insightsConnectionString 'Microsoft.KeyVault/vaults/secrets@2026-05-15' = {
  parent: vault
  name: 'appinsights-connection-string'
  properties: {
    value: insights.properties.ConnectionString
  }
}

output keyVaultName string = vault.name
output keyVaultUri string = vault.properties.vaultUri
output appInsightsName string = insights.name
