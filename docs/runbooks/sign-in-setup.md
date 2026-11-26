# Set up sign-in for the family app and the backend

Each Member signs in to the family app with their own Google account, through Microsoft Entra External ID ([ADR 0010](../adr/0010-shared-lists-in-an-azure-backend-with-an-installable-family-app.md)). The Hub signs in to the backend as itself, with a certificate. This runbook is the setup that has to be done by hand, once: an External ID tenant, a Google sign-in client, the app registrations, and the list of which accounts are the Household's. The backend's code checks the tokens; this gives it something to check them against.

Do this signed in as Ross, on the PC, with the Azure CLI (`az login`). It takes about an hour. Microsoft and Google rename their pages from time to time, so a heading may not match exactly.

## Why this isn't Bicep

Everything else in Azure is built by the pipeline ([ADR 0008](../adr/0008-azure-resources-from-bicep-through-azure-devops.md)). The External ID tenant is a separate directory, and its app registrations live inside it, where the pipeline's service connection can't reach. A tenant made by the pipeline would also have the service connection, not Ross, as its first administrator. So the tenant, its Google sign-in and its app registrations are made by hand, here. Only the values the backend needs go back into the pipeline (step 7).

## What it costs

| Part | Tier | Expected cost |
|---|---|---|
| Entra External ID | The first 50,000 monthly active users are free. Add-ons, such as SMS, have no free allowance and aren't used | £0 |
| Google sign-in client | A Google Cloud project with nothing running in it | £0 |
| The Hub's certificate | Self-signed, in the existing Key Vault | Under 1p a year |

## 1. Create the External ID tenant

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com) in Ross's usual directory.
2. Go to **Entra ID → Overview → Manage tenants → Create**, and choose **External**.
3. **Basics:**
   - Tenant name: `FamilyHub`.
   - Domain name: `familyhub` with something after it to make it unique, such as `familyhubgraham`. This becomes the tenant's **subdomain**, as in `<subdomain>.onmicrosoft.com` and `<subdomain>.ciamlogin.com`.
   - Location: the United Kingdom or Europe, whichever the list offers.
4. **Add a subscription**, if it asks: the `FamilyHub` subscription, and a new resource group, `rg-familyhub-identity`. This keeps the one hand-made resource apart from `rg-familyhub`, which the pipeline owns.
5. Create it. It takes a few minutes.
6. Switch to the new tenant (**Settings → Directories + subscriptions**, or the tenant switcher at the top right). Ross is its first administrator.
7. On **Entra ID → Overview**, note the **Tenant ID**, and check the **Primary domain** is `<subdomain>.onmicrosoft.com`.

Everything from step 3 on happens in this tenant. Check the tenant switcher before each step.

## 2. Create the Google sign-in client

This is a new Google Cloud project, separate from the Hub's `FamilyHub` project in [the Google Cloud runbook](google-cloud-setup.md). That one asks for Calendar, Tasks and Drive access, so it's published unverified, and signing in to it shows a "Google hasn't verified this app" warning. This one asks only for a name and email address, so it's published without Google's verification and without that warning: no Member sees it.

Do this signed in to the Household's Google account.

1. In the [Google Cloud console](https://console.cloud.google.com/), open the project picker, choose **New project**, name it `FamilyHub Sign-in`, and create it. Check it's selected before going on.
2. **Google Auth Platform** (older consoles call it **OAuth consent screen**):
   - **Branding:** app name `FamilyHub`, and the Household's address as the support and developer contact email. Under **Authorised domains**, add `ciamlogin.com` and `microsoftonline.com`.
   - **Audience:** user type **External**. Then **Publish app**, so it's **In production**.
   - **Data Access:** add nothing. Signing in only needs `openid`, `email` and `profile`, which every app gets.
3. **Clients → Create client:**
   - Application type: **Web application**. Name: `Entra External ID`.
   - **Authorised redirect URIs:** all seven of these, with `<tenant-ID>` and `<subdomain>` from step 1:

     ```
     https://login.microsoftonline.com
     https://login.microsoftonline.com/te/<tenant-ID>/oauth2/authresp
     https://login.microsoftonline.com/te/<subdomain>.onmicrosoft.com/oauth2/authresp
     https://<tenant-ID>.ciamlogin.com/<tenant-ID>/federation/oidc/accounts.google.com
     https://<tenant-ID>.ciamlogin.com/<subdomain>.onmicrosoft.com/federation/oidc/accounts.google.com
     https://<subdomain>.ciamlogin.com/<tenant-ID>/federation/oauth2
     https://<subdomain>.ciamlogin.com/<subdomain>.onmicrosoft.com/federation/oauth2
     ```

4. Create it, and keep the page open for the **Client ID** and **Client secret**. Step 3 is the only place they go. If the secret is ever lost, make a new one here and enter it again in step 3.

The redirect URIs are from [Microsoft's Google federation guide](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers) (checked 17 November 2026).

## 3. Let the tenant sign in with Google

1. In the Entra admin center, in the FamilyHub tenant: **Entra ID → External Identities → All identity providers**.
2. On the **Built-in** tab, next to **Google**, choose **Configure**.
3. Name: `Google`. Paste the **Client ID** and **Client secret** from step 2, and save.

## 4. Create the sign-in user flow

The user flow is the sign-in page the family app sends people to.

1. **Entra ID → External Identities → User flows → New user flow.**
2. Name: `signup-signin`.
3. **Identity providers:** tick **Google**. Leave **Email accounts** unticked if the page allows it. If it insists on one, choose **Email one-time passcode**: an account that isn't on the Household's list (step 8) gets nothing from the backend anyway.
4. **User attributes:** **Display Name**.
5. Create it.

## 5. Register the API and the family app

Three app registrations: the backend's API, the family app, and the Hub (step 6). For each one: **Entra ID → App registrations → New registration**, with **Accounts in this organizational directory only**.

**The API: `FamilyHub API`.** No redirect URI.

1. **Expose an API → Application ID URI → Add**, and keep the suggested `api://<its client ID>`.
2. **Add a scope:** name `Lists.ReadWrite`, **Admins only** can consent, display name "Read and change the lists", and the same as its description.
3. **App roles → Create app role:** display name `The Hub`, allowed member types **Applications**, value `Hub`, description "The Hub on the kitchen wall, reading and changing the lists".
4. **Manifest:** set `"requestedAccessTokenVersion": 2` (in older manifests, `"accessTokenAcceptedVersion": 2`), and save.

**The family app: `FamilyHub app`.**

1. **Authentication → Add a platform → Single-page application**, with two redirect URIs: `http://localhost:5173/`, for the app running on the PC, and the family app's Static Web Apps address, `https://<its address>/`. The address is the Bicep's `familyAppUrl` output, or `az staticwebapp show --name swa-familyhub-<suffix> --resource-group rg-familyhub --query defaultHostname`. The app no longer signs in here (the backend does, below), but signing out of the tenant comes back to these. A tenant set up before AB#94 also has `/auth/bridge` at both addresses: remove those two, as nothing uses them now.
   Then **Add a platform → Mobile and desktop applications**, with the custom redirect URI `http://localhost`, for `backend/scripts/whoami.py`, which checks sign-in by hand (step 8).
   Then, still on **Authentication** (its **Settings** tab, or **Advanced settings** in older portals), set **Allow public client flows** to **Yes**, and save. `whoami.py` has no secret, and without this its sign-in fails with `AADSTS7000218`.
   Then **Add a platform → Web**, with the redirect URI `https://<the API's address>/auth/callback`, where the backend signs Members in (ADR 0016). The address is the Bicep's `apiUrl` output. Add `http://localhost:8000/auth/callback` too, for the backend running on the PC. Leave both token boxes unticked.
2. **API permissions → Add a permission:**
   - **My APIs → FamilyHub API → Delegated permissions → `Lists.ReadWrite`.**
   - **Microsoft Graph → Delegated permissions → `openid` and `offline_access`.**
3. **Grant admin consent for FamilyHub**, so no Member is asked.
4. In **External Identities → User flows → `signup-signin` → Applications → Add application**, add `FamilyHub app`.
5. **The backend's secret.** Do this before a pipeline run deploys with `FAMILYHUB_APP_CLIENT_ID` set (step 7), as the Bicep gives the function app read access to this one secret, and the deploy fails if it isn't there yet.
   1. **Certificates & secrets → Client secrets → New client secret**, with the description `Key Vault family-app-client-secret` and an expiry of 12 months. Copy its **Value**: the portal shows it once.
   2. Put it in the Key Vault, in Ross's usual directory, without it going into the shell's history. In Git Bash or WSL:

      ```bash
      read -rs secret   # paste the value, then Enter; nothing shows
      az keyvault secret set --vault-name kv-familyhub-<suffix> --name family-app-client-secret \
        --expires <the secret's expiry, such as 2027-11-26T00:00:00Z> --value "$secret" --output none
      unset secret
      ```

      The function app reads it through a Key Vault reference, so it's never in the repo, the pipeline or the app's settings as text.
   3. **To renew it,** a month before it expires: make a new one the same way, set it in the Key Vault again (a new version), and restart the function app (`az functionapp restart --name func-familyhub-<suffix> --resource-group rg-familyhub`) so it reads the new version. Then delete the old one in **Certificates & secrets**. If it runs out first, new sign-ins fail, but phones already signed in stay in: the backend lets them in and tries again later.

## 6. Register the Hub, with a certificate

The Hub signs in as itself, with a certificate kept in the Key Vault. The Pi's setup scripts copy it to the Pi, and `app/scripts/backend-env.mjs` to the PC (step 9).

1. In Git Bash, in Ross's usual directory, make the certificate in the Key Vault, and download its public half:

   ```
   az login
   az account set --subscription FamilyHub
   vault=<keyVaultName>
   az keyvault certificate create --vault-name "$vault" --name hub-entra-certificate \
     --policy "$(az keyvault certificate get-default-policy | sed -e 's/CN=CLIGetDefaultPolicy/CN=FamilyHub Hub/' -e 's#application/x-pkcs12#application/x-pem-file#')"
   az keyvault certificate download --vault-name "$vault" --name hub-entra-certificate --file hub.cer
   ```

   Key Vault's default policy makes a self-signed certificate valid for 12 months, and renews it 90 days before it expires. The `sed` gives it a subject that says what it's for, instead of the default `CN=CLIGetDefaultPolicy`, and keeps it as PEM rather than PKCS#12, as the Hub reads it with Node's own crypto, which can't read PKCS#12. A certificate made before 24 November 2026 is PKCS#12: run the same `create` again, which makes a PEM version under the same name, then step 3 with the new `hub.cer`, and remove the old certificate from `FamilyHub Hub` once the Hub signs in with the new one.

   The deployment gives Ross **Key Vault Certificates Officer** on the vault for this, as well as Secrets Officer. If the vault says `ForbiddenByRbac` for `certificates`, the pipeline hasn't deployed that role yet, or the service connection isn't allowed to give it out ([the Azure runbook](azure-setup.md), step 2). `az account set` matters if the CLI is also signed in to the FamilyHub tenant: the vault is in Ross's usual directory.

2. Back in the FamilyHub tenant, register **`FamilyHub Hub`**, with no redirect URI.
3. **Certificates & secrets → Certificates → Upload certificate:** upload `hub.cer`, with the description `Key Vault hub-entra-certificate`. Then delete `hub.cer` from the PC. It's only the public half, but it has no reason to stay.
4. **API permissions → Add a permission → My APIs → FamilyHub API → Application permissions → `Hub`**, then **Grant admin consent for FamilyHub**.

A lost Pi means deleting this certificate from `FamilyHub Hub`, and making a new one.

When Key Vault renews the certificate, the new version has to be uploaded the same way (steps 1 and 3, with `download` alone) before the old one expires. Entra only accepts the certificates it has been given.

## 7. Give the backend the tenant's details

None of these is secret, but the repo is public, so they're kept in the `familyhub` variable group in Azure DevOps, with the others ([the Azure runbook](azure-setup.md), step 2.3):

| Variable | Value |
|---|---|
| `FAMILYHUB_ENTRA_TENANT_ID` | The FamilyHub tenant's **Tenant ID** (step 1) |
| `FAMILYHUB_ENTRA_SUBDOMAIN` | Its subdomain, such as `familyhubgraham` (step 1) |
| `FAMILYHUB_API_CLIENT_ID` | `FamilyHub API`'s **Application (client) ID** (step 5) |
| `FAMILYHUB_APP_CLIENT_ID` | `FamilyHub app`'s **Application (client) ID** (step 5), which the backend signs Members in as, and the pipeline builds into the family app. Make the backend's secret first (step 5, step 5) |

The pipeline passes them to the function app as app settings on its next deploy. If the sign-in pull request has already merged, run the pipeline again from Azure DevOps. Until they're set, the API answers `/me` and anything else that needs sign-in with a 503, "Sign-in isn't set up yet".

The pipeline also builds the first three, `FAMILYHUB_APP_CLIENT_ID` and the API's address into the family app, which signs in with them. Until all are set, the app says sign-in isn't set up. The Hub's client ID isn't needed by either: the Pi gets it in slice 4.

## 8. Let the Household in

The backend lets in only the accounts in Cosmos DB's `accounts` container ([ADR 0014](../adr/0014-household-accounts-in-cosmos-db.md)). Anyone else can sign up through the user flow, but gets a 403 from the backend. Each item is one account: its `id` is the account's **Object ID** in the FamilyHub tenant, which never changes, and its `memberId` is the Member's id on the Hub, which also never changes, even when they're renamed in Settings.

`backend/scripts/whoami.py` signs in and asks the API who you are. Doing this with each Member, before and after adding them, also checks that sign-in works.

1. In Git Bash, in the repo's `backend` folder, set what the script needs (the values are from steps 1, 5 and 6, and the function app's name is in the Azure portal, in `rg-familyhub`):

   ```
   export FAMILYHUB_API_URL=https://<function app>.azurewebsites.net
   export FAMILYHUB_ENTRA_TENANT_ID=<tenant ID>
   export FAMILYHUB_ENTRA_SUBDOMAIN=<subdomain>
   export FAMILYHUB_API_CLIENT_ID=<FamilyHub API's client ID>
   export FAMILYHUB_APP_CLIENT_ID=<FamilyHub app's client ID>
   ```

2. Sign in as the Member: `uv run python scripts/whoami.py member`. A browser opens: choose **Google** and sign in with the Member's Google account. The first time, that signs them up. It prints `403` and "This account isn't one of the Household's", which is right: they aren't on the list yet. Start with Ross's account. The children's accounts wait for the Family Link check (AB#7, and the [design notes](../../design/family-app/notes.md#open-questions)).
3. The Member now has a user in the FamilyHub tenant, with their Google address. `scripts/accounts.py` finds it by that address in step 5, so there's nothing to copy. (It's under **Entra ID → Users** in the Entra admin center, for the fallback.)
4. Find the Member's id on the Hub. It's made from their name when they were first added, but check rather than guess. On the PC, `ssh hubadmin@familyhub.local`, then on the Pi run this. It asks for hubadmin's password, as `hub.db` is only readable by the Hub:

   ```
   sudo node -e "const {DatabaseSync} = require('node:sqlite'); console.table(new DatabaseSync('/var/lib/familyhub/hub.db', {readOnly: true}).prepare('SELECT id, name FROM members').all())"
   ```

   Then `exit`. It's two steps because the quotes needed to do it in one line from the PC break in PowerShell. The database is in `HUB_DATA_DIR` (`hub_data_dir` in `ansible/group_vars/all.yml`).

5. Add the account with `scripts/accounts.py`, signed in to the Azure CLI as Ross. It reads Graph in the FamilyHub tenant to find the account, and writes to Cosmos DB with the Data Contributor role Bicep gives Ross. Set what it needs (the Cosmos DB account is `cosmos-familyhub-…` in `rg-familyhub`), then add the account:

   ```
   export FAMILYHUB_COSMOS_ENDPOINT=https://<Cosmos DB account>.documents.azure.com:443/
   uv run python scripts/accounts.py add <their Google address> <the Member's id from step 4>
   ```

   If it can't get a token for the FamilyHub tenant, run `az login --tenant <tenant ID> --allow-no-subscriptions` once, then `az account set --subscription FamilyHub`. It refuses an address that hasn't signed in yet, one that more than one user has, and an account already on the list. `uv run python scripts/accounts.py list` shows everyone on the list, with their Member and address.

6. Run `uv run python scripts/whoami.py member` again, with the same account. It prints `200` and `{'kind': 'member', 'member_id': '<their id>'}`.

To take an account out, `uv run python scripts/accounts.py remove <their Google address or Object ID>`. To point it at another Member, remove it and add it again. Each change counts from the next request.

**The fallback, by hand:** in the [Azure portal](https://portal.azure.com), open the Cosmos DB account, then **Data Explorer**. The account has no keys, so Data Explorer signs in as Ross: if it says it can't read the data, open its **Settings** (the cog) and choose **Entra ID** for authentication. Then **familyhub → accounts → Items → New Item**, replace what's there with `{"id": "<the user's Object ID>", "memberId": "<the Member's id>"}`, and **Save**. An item's `id` must be the Object ID exactly.

To check the Hub's sign-in, add `export FAMILYHUB_HUB_CLIENT_ID=<FamilyHub Hub's client ID>` and `export FAMILYHUB_KEY_VAULT=<keyVaultName>`, sign in to the Azure CLI as Ross (`az login`, then `az account set --subscription FamilyHub`), and run `uv run python scripts/whoami.py hub`. It prints `200` and `{'kind': 'hub', 'member_id': None}`. The script reads the certificate into memory only.

## 9. Give the Hub the backend's details

The Hub signs in with the certificate from step 6 and these settings, all kept in the Key Vault, as the Pi's other secrets are. Only the certificate is secret; the rest are there so the Pi and the PC get them in one place, and out of the public repo.

| Secret | Value | The Hub's variable |
|---|---|---|
| `backend-url` | The function app's address, `https://<function app>.azurewebsites.net` | `BACKEND_URL` |
| `entra-tenant-id` | The FamilyHub tenant's **Tenant ID** (step 1) | `ENTRA_TENANT_ID` |
| `entra-subdomain` | Its subdomain (step 1) | `ENTRA_SUBDOMAIN` |
| `api-client-id` | `FamilyHub API`'s **Application (client) ID** (step 5) | `BACKEND_API_CLIENT_ID` |
| `hub-client-id` | `FamilyHub Hub`'s **Application (client) ID** (step 6) | `HUB_CLIENT_ID` |
| `hub-entra-certificate` | The certificate itself, made in step 6: nothing to add | `HUB_CERTIFICATE`, as base64 of the PEM |

1. Add the first five, in Git Bash, signed in as Ross. The first three are also the function app's own settings, `ENTRA_TENANT_ID`, `ENTRA_SUBDOMAIN` and `API_CLIENT_ID`:

   ```
   vault=<keyVaultName>
   az keyvault secret set --vault-name "$vault" --name hub-client-id --value <FamilyHub Hub's client ID> --output none
   ```

   and the same for each of the others.
2. **The Pi:** run the playbook with `--tags config` ([the Pi runbook](pi-setup.md)). It puts them in `/etc/familyhub/hub.env` and restarts the Hub.
3. **The PC:** in the main checkout's `app/`, run `node scripts/backend-env.mjs`. It puts them in `app/.env` without printing them. Restart the dev server.

When the Hub starts with them, its log says "Signed in to the backend as the Hub", or why not: `journalctl -u familyhub` on the Pi, `data/dev-server.log` on the PC. Without them, it doesn't try. Nothing on screen changes yet: the Shopping list stays on Google Tasks until the switch (slice 5). When Key Vault renews the certificate, run the playbook and the script again, after uploading its public half (step 6).

## If something goes wrong

- **Google says "Error 400: redirect_uri_mismatch":** a redirect URI in step 2 doesn't match. Check the tenant ID and subdomain in all seven.
- **"AADSTS700016: Application … was not found in the directory":** something was set up in Ross's usual directory instead of the FamilyHub tenant. Check the tenant switcher.
- **Google isn't offered on the sign-in page:** it isn't ticked in the user flow (step 4), or the app isn't added to the user flow (step 5).
- **A child's account can't sign in:** Family Link may need a parent to allow "Sign in with Google" for that account first. That's the open question in the design notes.
- **Signing in works, but the backend says 403:** the account has no item in `accounts`, or its Object ID was copied wrongly (step 8). An item's `id` must be the Object ID exactly.
- **The backend says 503, "Sign-in isn't set up yet":** the variables in step 7 are missing, or the pipeline hasn't deployed since they were added.
- **`whoami.py member` fails with "AADSTS7000218: The request body must contain the following parameter: 'client_assertion' or 'client_secret'":** **Allow public client flows** is off on `FamilyHub app` (step 5).
- **The Hub's log says "Backend sign-in refused: 401 invalid_client 700027":** `FamilyHub Hub` doesn't have this certificate's public half. Upload it (step 6, step 3). The same after Key Vault renews the certificate, until the new one is uploaded.
- **The Hub's log says "HUB_CERTIFICATE is not a PEM private key and certificate":** the certificate is still PKCS#12 (step 6, step 1), or `HUB_CERTIFICATE` was put in by hand, not as base64.
- **The `hub.db` command says "unable to open database file":** the path is wrong. It's `/var/lib/familyhub/hub.db` on the Pi (step 8).
- **`whoami.py member` says the redirect URI isn't valid:** `http://localhost` is missing from `FamilyHub app`'s **Mobile and desktop applications** platform (step 5).
- **The family app's silent sign-in fails with Google's "400 invalid_request" about a `username` parameter:** a [known issue](https://learn.microsoft.com/en-us/answers/questions/5822108/entra-external-id-google-federation-username-param) with External ID and Google. It's why sign-in moved into the backend (ADR 0016).
- **The pipeline's Bicep deploy fails on `apiCanReadClientSecret` with "SecretNotFound" or similar:** `family-app-client-secret` isn't in the Key Vault yet (step 5, step 5). Add it and run the pipeline again.
- **`/auth/sign-in` says 503, "Signing in isn't set up yet":** `APP_CLIENT_ID` or `APP_CLIENT_SECRET` is missing, or the Key Vault reference hasn't resolved. In the portal, the function app's **Environment variables** show a green tick on `APP_CLIENT_SECRET` when it has. The log says "APP_CLIENT_SECRET is an unresolved Key Vault reference" when it hasn't.
- **Signing in through the backend ends on the tenant's "AADSTS50011: The redirect URI … does not match":** the Web redirect URI is missing or different (step 5). It must be the API's address exactly, with `/auth/callback`.
- **It ends on `/auth/done?error=failed`:** the backend couldn't redeem the code. The function app's log says why: often "AADSTS7000215: Invalid client secret", a wrong or expired secret (step 5, step 5).
