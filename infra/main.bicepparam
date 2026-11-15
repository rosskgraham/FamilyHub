using 'main.bicep'

// Not secret, but personal, and the repo is public: the pipeline passes it in from a variable.
param adminObjectId = readEnvironmentVariable('FAMILYHUB_ADMIN_OBJECT_ID')
