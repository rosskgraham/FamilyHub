#!/usr/bin/env bash
# Turns on the Azure services FamilyHub's resources need, in its subscription. A new subscription starts with
# them off, and a what-if or deploy fails until they're on. Already on, it changes nothing. The pipeline runs it
# before every what-if and deploy, as the service connection, which as Contributor is allowed to.
set -euo pipefail

for namespace in Microsoft.KeyVault Microsoft.OperationalInsights Microsoft.Insights Microsoft.Storage \
  Microsoft.Web Microsoft.Consumption; do
  if [[ $(az provider show --namespace "$namespace" --query registrationState --output tsv) != Registered ]]; then
    echo "Turning on $namespace"
    az provider register --namespace "$namespace" --wait
  fi
done
