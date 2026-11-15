// Everything FamilyHub has in Azure, in its own FamilyHub subscription (ADR 0008): the rg-familyhub resource
// group, and the resources in resources.bicep inside it. Deployed at subscription scope by
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
  }
}

output resourceGroupName string = group.name
output keyVaultName string = resources.outputs.keyVaultName
output keyVaultUri string = resources.outputs.keyVaultUri
output appInsightsName string = resources.outputs.appInsightsName
