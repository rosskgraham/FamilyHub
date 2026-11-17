using 'main.bicep'

// Not secret, but personal, and the repo is public: the pipeline passes them in from variables.
param adminObjectId = readEnvironmentVariable('FAMILYHUB_ADMIN_OBJECT_ID')
param budgetEmail = readEnvironmentVariable('FAMILYHUB_BUDGET_EMAIL')
