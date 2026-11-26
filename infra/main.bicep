// Everything FamilyHub has in Azure, in its own FamilyHub subscription (ADR 0008): the rg-familyhub resource
// group, the resources in resources.bicep inside it, and a monthly cost budget. Deployed at subscription scope by
// infra/azure-pipelines.yml, so nothing in Azure is made by hand.

targetScope = 'subscription'

@description('Where the resource group and its resources live.')
param location string = 'uksouth'

@description('The Entra object ID of the person who runs the setup scripts. They can read and write the secrets.')
param adminObjectId string

@description('The most the Log Analytics workspace takes in a day, in GB. 0.15 a day stays inside the 5 GB a month that is free; past it, data is dropped rather than charged. A string, because Bicep has no decimals.')
param dailyCapGb string = '0.15'

@description('How long telemetry is kept. Up to 31 days is free.')
@minValue(30)
@maxValue(31)
param retentionDays int = 30

@description('The most FamilyHub is expected to cost in a month, in the billing currency (pounds). Spending should never go past the backend storage account\'s pennies, so passing this means something is wrong (ADR 0011).')
param monthlyBudget int = 5

@description('The first month the budget counts from: the first of a month.')
param budgetStartDate string = '2026-11-01'

@description('Who the budget emails when it is passed. Kept out of the public repo.')
param budgetEmail string

@description('The ID of the FamilyHub External ID tenant, which signs in Members and the Hub (the sign-in runbook). Empty until that is set up, and while it is empty the API refuses anything that needs sign-in.')
param entraTenantId string = ''

@description('The subdomain of the External ID tenant, as in <subdomain>.ciamlogin.com.')
param entraSubdomain string = ''

@description('The client ID of the FamilyHub API app registration: the audience its access tokens are for.')
param apiClientId string = ''

@description('The client ID of the FamilyHub app registration, which the backend signs Members in as, a confidential client (ADR 0016). Its secret is family-app-client-secret in the Key Vault (the sign-in runbook).')
param appClientId string = ''

resource group 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: 'rg-familyhub'
  location: location
  tags: {
    project: 'familyhub'
  }
}

module resources 'resources.bicep' = {
  name: 'familyhub-resources'
  scope: group
  params: {
    location: location
    adminObjectId: adminObjectId
    dailyCapGb: dailyCapGb
    retentionDays: retentionDays
    entraTenantId: entraTenantId
    entraSubdomain: entraSubdomain
    apiClientId: apiClientId
    appClientId: appClientId
  }
}

// A guard, not a limit: Azure carries on past it, but sends an email. Budgets are free.
resource budget 'Microsoft.Consumption/budgets@2026-06-01' = {
  name: 'budget-familyhub'
  properties: {
    category: 'Cost'
    amount: monthlyBudget
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    notifications: {
      passed: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: [
          budgetEmail
        ]
      }
    }
  }
}

output resourceGroupName string = group.name
output keyVaultName string = resources.outputs.keyVaultName
output keyVaultUri string = resources.outputs.keyVaultUri
output appInsightsName string = resources.outputs.appInsightsName
output functionAppName string = resources.outputs.functionAppName
output apiUrl string = resources.outputs.apiUrl
output familyAppName string = resources.outputs.familyAppName
output familyAppUrl string = resources.outputs.familyAppUrl
