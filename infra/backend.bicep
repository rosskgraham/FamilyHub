// The family app's backend (ADR 0010): a function app on Azure Functions Flex Consumption that runs the
// FastAPI app in backend/ (ADR 0011), the storage account Flex needs for its deployment package and the
// host's own state, Cosmos DB for the lists, and Web PubSub to tell clients something changed. The function app
// is inside Flex's free grant, and Cosmos DB and Web PubSub are on free tiers; the storage account is billed at
// standard rates, pennies a month, which Ross approved on 17 November 2026 (ADR 0008). resources.bicep deploys
// this.

targetScope = 'resourceGroup'

@description('Where the resources live.')
param location string = resourceGroup().location

@description('A short suffix that keeps the globally unique names unique.')
param suffix string

@description('The Application Insights resource the function app sends its telemetry to.')
param appInsightsName string

@description('The Entra object ID of the person who runs the setup. They can read and write items in Cosmos DB, to add the Household accounts in Data Explorer.')
param adminObjectId string

@description('The ID of the FamilyHub External ID tenant, which signs in Members and the Hub (the sign-in runbook). Empty until that is set up, and while it is empty the API refuses anything that needs sign-in.')
param entraTenantId string = ''

@description('The subdomain of the External ID tenant, as in <subdomain>.ciamlogin.com.')
param entraSubdomain string = ''

@description('The client ID of the FamilyHub API app registration: the audience its access tokens are for.')
param apiClientId string = ''

var tags = {
  project: 'familyhub'
}

// The container Flex reads the app's zip package from. The pipeline deploys into it.
var deploymentContainer = 'deployments'

// Built-in role: full access to blobs, which the Functions host needs for its own state, and for reading the
// deployment package.
var storageBlobDataOwner = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'

// Built-in role: send messages and hand out client access tokens through Web PubSub.
var webPubSubServiceOwner = '12cf5a90-567b-43ae-8102-96cf46c7d9b4'

// Cosmos DB's own built-in data role, not an Azure role: read and write items, nothing else.
var cosmosDataContributor = '00000000-0000-0000-0000-000000000002'

// The one database, which the containers share.
var databaseName = 'familyhub'

// Cosmos DB's free tier covers 1000 RU/s for the account's lifetime.
var freeThroughput = 1000

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

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2025-10-15' = {
  name: 'cosmos-familyhub-${suffix}'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    // Free tier: one account per subscription, and it can only be chosen when the account is created.
    enableFreeTier: true
    // The account can never be given more than the free tier's throughput, so it can't start costing money.
    capacity: {
      totalThroughputLimit: freeThroughput
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    // No keys: the function app signs in with its managed identity.
    disableLocalAuth: true
    disableKeyBasedMetadataWriteAccess: true
    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Enabled'
    // Periodic backup's two copies are free. Whether the Household's lists need more is an open question.
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: 240
        backupRetentionIntervalInHours: 8
        backupStorageRedundancy: 'Local'
      }
    }
  }

  resource database 'sqlDatabases' = {
    name: databaseName
    properties: {
      resource: {
        id: databaseName
      }
      // Provisioned throughput shared by the database's containers: serverless accounts can't use the free tier.
      options: {
        throughput: freeThroughput
      }
    }

    // The Household's accounts: which Member each account in the External ID tenant is (ADR 0014). Items are
    // added by hand, as the sign-in runbook says. On the database's shared throughput.
    resource accounts 'containers' = {
      name: 'accounts'
      properties: {
        resource: {
          id: 'accounts'
          // Each item's id is the account's Object ID, so a sign-in's lookup is a point read.
          partitionKey: {
            paths: ['/id']
            kind: 'Hash'
          }
        }
      }
    }
  }
}

resource webPubSub 'Microsoft.SignalRService/webPubSub@2024-03-01' = {
  name: 'wps-familyhub-${suffix}'
  location: location
  tags: tags
  // Free: 20 connections at once and 20,000 messages a day, which is plenty for the Hub and a few phones.
  sku: {
    name: 'Free_F1'
    tier: 'Free'
    capacity: 1
  }
  properties: {
    // No keys: the function app signs in with its managed identity.
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
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
        {
          name: 'COSMOS_ENDPOINT'
          value: cosmos.properties.documentEndpoint
        }
        {
          name: 'COSMOS_DATABASE'
          value: databaseName
        }
        {
          name: 'WEBPUBSUB_ENDPOINT'
          value: 'https://${webPubSub.properties.hostName}'
        }
        // Sign-in (ADR 0010). None of these is secret.
        {
          name: 'ENTRA_TENANT_ID'
          value: entraTenantId
        }
        {
          name: 'ENTRA_SUBDOMAIN'
          value: entraSubdomain
        }
        {
          name: 'API_CLIENT_ID'
          value: apiClientId
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
        triggers: {
          http: {
            // How many requests the one instance takes at once. Python's default is 1, and with only one instance
            // that left requests waiting up to a minute, or failing with a 503 after 60 seconds, even one at a time
            // (measured 17 November 2026). FastAPI handles many at once, so 16 is well within it.
            perInstanceConcurrency: 16
          }
        }
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

resource apiCanUseWebPubSub 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(webPubSub.id, api.id, webPubSubServiceOwner)
  scope: webPubSub
  properties: {
    principalId: api.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', webPubSubServiceOwner)
  }
}

resource apiCanUseCosmos 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-10-15' = {
  parent: cosmos
  name: guid(cosmos.id, api.id, cosmosDataContributor)
  properties: {
    principalId: api.identity.principalId
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributor}'
    scope: cosmos.id
  }
}

// Ross adds the Household's accounts by hand in Data Explorer (the sign-in runbook, step 8). With keys off, Data
// Explorer signs in as him, so he needs the same data role.
resource adminCanUseCosmos 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-10-15' = {
  parent: cosmos
  name: guid(cosmos.id, adminObjectId, cosmosDataContributor)
  properties: {
    principalId: adminObjectId
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributor}'
    scope: cosmos.id
  }
}

output functionAppName string = api.name
output apiUrl string = 'https://${api.properties.defaultHostName}'
