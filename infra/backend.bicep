// The family app's backend (ADR 0010): a function app on Azure Functions Flex Consumption that runs the
// FastAPI app in backend/ (ADR 0011), and the storage account Flex needs for its deployment package and the
// host's own state. The function app is inside Flex's free grant; the storage account is billed at standard
// rates, pennies a month, which Ross approved on 17 November 2026 (ADR 0008). resources.bicep deploys this.

targetScope = 'resourceGroup'

@description('Where the resources live.')
param location string = resourceGroup().location

@description('A short suffix that keeps the globally unique names unique.')
param suffix string

@description('The Application Insights resource the function app sends its telemetry to.')
param appInsightsName string

var tags = {
  project: 'familyhub'
}

// The container Flex reads the app's zip package from. The pipeline deploys into it.
var deploymentContainer = 'deployments'

// Built-in role: full access to blobs, which the Functions host needs for its own state, and for reading the
// deployment package.
var storageBlobDataOwner = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'

resource insights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: appInsightsName
}

resource storage 'Microsoft.Storage/storageAccounts@2025-06-01' = {
  name: 'stfamilyhub${suffix}'
  location: location
  tags: tags
  // General-purpose v2, locally redundant: the cheapest kind Flex accepts.
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    // No keys: the function app signs in with its managed identity, so there's no secret to leak.
    allowSharedKeyAccess: false
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    defaultToOAuthAuthentication: true
  }

  resource blobs 'blobServices' = {
    name: 'default'

    resource deployments 'containers' = {
      name: deploymentContainer
    }
  }
}

resource plan 'Microsoft.Web/serverfarms@2025-03-01' = {
  name: 'asp-familyhub'
  location: location
  tags: tags
  kind: 'functionapp'
  sku: {
    tier: 'FlexConsumption'
    name: 'FC1'
  }
  properties: {
    // Linux.
    reserved: true
  }
}

resource api 'Microsoft.Web/sites@2025-03-01' = {
  name: 'func-familyhub-${suffix}'
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        // The host's own state, reached with the managed identity rather than a connection string.
        {
          name: 'AzureWebJobsStorage__accountName'
          value: storage.name
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: insights.properties.ConnectionString
        }
      ]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainer}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        // One instance is plenty for a family, and keeps a bug that loops from costing much (ADR 0011).
        maximumInstanceCount: 1
        // The smallest size. Each execution is billed as at least 1 second of this.
        instanceMemoryMB: 512
      }
      runtime: {
        name: 'python'
        version: '3.12'
      }
    }
  }
}

resource apiCanUseBlobs 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, api.id, storageBlobDataOwner)
  scope: storage
  properties: {
    principalId: api.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwner)
  }
}

output functionAppName string = api.name
output apiUrl string = 'https://${api.properties.defaultHostName}'
