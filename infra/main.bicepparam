using 'main.bicep'

// Not secret, but personal, and the repo is public: the pipeline passes them in from variables.
param adminObjectId = readEnvironmentVariable('FAMILYHUB_ADMIN_OBJECT_ID')
param budgetEmail = readEnvironmentVariable('FAMILYHUB_BUDGET_EMAIL')

// The sign-in tenant's details (the sign-in runbook, step 7). Empty until it's set up.
param entraTenantId = readEnvironmentVariable('FAMILYHUB_ENTRA_TENANT_ID', '')
param entraSubdomain = readEnvironmentVariable('FAMILYHUB_ENTRA_SUBDOMAIN', '')
param apiClientId = readEnvironmentVariable('FAMILYHUB_API_CLIENT_ID', '')
