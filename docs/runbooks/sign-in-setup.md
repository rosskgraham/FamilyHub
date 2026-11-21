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

1. **Authentication → Add a platform → Single-page application**, with the redirect URI `http://localhost:5173/`, for the app running on the PC. Its Static Web Apps address is added in slice 3, when it exists.
   Then **Add a platform → Mobile and desktop applications**, with the custom redirect URI `http://localhost`, for `backend/scripts/whoami.py`, which checks sign-in by hand (step 8).
2. **API permissions → Add a permission:**
   - **My APIs → FamilyHub API → Delegated permissions → `Lists.ReadWrite`.**
   - **Microsoft Graph → Delegated permissions → `openid` and `offline_access`.**
3. **Grant admin consent for FamilyHub**, so no Member is asked.
4. In **External Identities → User flows → `signup-signin` → Applications → Add application**, add `FamilyHub app`.

## 6. Register the Hub, with a certificate

The Hub signs in as itself, with a certificate kept in the Key Vault. The Pi's setup scripts copy it to the Pi when the Hub moves to the backend (slice 4).

1. In Git Bash, in Ross's usual directory, make the certificate in the Key Vault, and download its public half:

   ```
   az login
   vault=<keyVaultName>
   az keyvault certificate create --vault-name "$vault" --name hub-entra-certificate \
     --policy "$(az keyvault certificate get-default-policy)"
   az keyvault certificate download --vault-name "$vault" --name hub-entra-certificate --file hub.cer
   ```

   Key Vault's default policy makes a self-signed certificate valid for 12 months, and renews it 90 days before it expires.

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

The pipeline passes them to the function app as app settings on its next deploy. If the sign-in pull request has already merged, run the pipeline again from Azure DevOps. Until they're set, the API answers `/me` and anything else that needs sign-in with a 503, "Sign-in isn't set up yet".

The family app's and the Hub's client IDs aren't needed by the backend. The family app gets its own in slice 3, and the Pi gets the Hub's in slice 4.

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
3. In the Entra admin center, in the FamilyHub tenant: **Entra ID → Users**. The Member now has a user, with their Google address. Note its **Object ID**.
4. Find the Member's id on the Hub. It's made from their name when they were first added, but check rather than guess. On the PC, this asks for hubadmin's password, as `hub.db` is only readable by the Hub:

   ```
   ssh -t hubadmin@familyhub.local "sudo node -e \"const {DatabaseSync} = require('node:sqlite'); console.table(new DatabaseSync('/var/lib/familyhub/data/hub.db', {readOnly: true}).prepare('SELECT id, name FROM members').all())\""
   ```

5. In the [Azure portal](https://portal.azure.com), open the Cosmos DB account in `rg-familyhub` (`cosmos-familyhub-…`), then **Data Explorer**. The account has no keys, so Data Explorer signs in as Ross: if it says it can't read the data, open its **Settings** (the cog) and choose **Entra ID** for authentication. Bicep gives Ross Cosmos DB's Data Contributor role for this.
6. **familyhub → accounts → Items → New Item**, replace what's there with this, and **Save**:

   ```json
   {
     "id": "<the Object ID from step 3>",
     "memberId": "<the Member's id from step 4>"
   }
   ```

7. Run `uv run python scripts/whoami.py member` again, with the same account. It prints `200` and `{'kind': 'member', 'member_id': '<their id>'}`.

To let another account in later, add its item. To take one out, delete its item. Either counts from the next request.

To check the Hub's sign-in, add `export FAMILYHUB_HUB_CLIENT_ID=<FamilyHub Hub's client ID>` and `export FAMILYHUB_KEY_VAULT=<keyVaultName>`, sign in to the Azure CLI as Ross (`az login`), and run `uv run python scripts/whoami.py hub`. It prints `200` and `{'kind': 'hub', 'member_id': None}`. The script downloads the certificate to a temporary folder and deletes it when it finishes.

## If something goes wrong

- **Google says "Error 400: redirect_uri_mismatch":** a redirect URI in step 2 doesn't match. Check the tenant ID and subdomain in all seven.
- **"AADSTS700016: Application … was not found in the directory":** something was set up in Ross's usual directory instead of the FamilyHub tenant. Check the tenant switcher.
- **Google isn't offered on the sign-in page:** it isn't ticked in the user flow (step 4), or the app isn't added to the user flow (step 5).
- **A child's account can't sign in:** Family Link may need a parent to allow "Sign in with Google" for that account first. That's the open question in the design notes.
- **Signing in works, but the backend says 403:** the account has no item in `accounts`, or its Object ID was copied wrongly (step 8). An item's `id` must be the Object ID exactly.
- **The backend says 503, "Sign-in isn't set up yet":** the variables in step 7 are missing, or the pipeline hasn't deployed since they were added.
- **`whoami.py member` says the redirect URI isn't valid:** `http://localhost` is missing from `FamilyHub app`'s **Mobile and desktop applications** platform (step 5).
- **The family app's silent sign-in fails with Google's "400 invalid_request" about a `username` parameter:** a [known issue](https://learn.microsoft.com/en-us/answers/questions/5822108/entra-external-id-google-federation-username-param) with External ID and Google. It's for slice 3 to handle.
