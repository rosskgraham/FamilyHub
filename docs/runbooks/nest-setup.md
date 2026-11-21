# Connect the Nest to the Hub

The Hub shows the house's heating beside the weather, from the Nest thermostat, through Google's Smart Device Management (SDM) API ([ADR 0013](../adr/0013-the-nest-through-googles-sdm-api.md)). It uses the Hub's own Google Cloud project and OAuth client ([Google Cloud setup](google-cloud-setup.md)), with a sign-in of its own.

Do this once, signed in to the Household's Google account, the one that owns the Nest in the Google Home app. It takes about 20 minutes. Google renames console pages from time to time, so a heading may not match exactly.

> [!CAUTION]
> The Nest's sign-in can change the heating. The project ID isn't a secret on its own, but with a token it's enough to reach the thermostat, so it's kept in the Key Vault with the secrets, not in the repo.

## 1. Register for Device Access

Done on 21 November 2026. For a new account: go to <https://console.nest.google.com/device-access>, accept the terms, and pay the one-time **US$5** fee.

## 2. Turn on the SDM API and its scope

In the Hub's Google Cloud project, `FamilyHub`:

1. **APIs & Services → Library:** search for **Smart Device Management API**, open it, and choose **Enable**.
2. **Google Auth Platform → Data Access → Add or remove scopes:** add `https://www.googleapis.com/auth/sdm.service`. The privacy policy, `site/privacy.html`, already lists it.
3. **Google Auth Platform → Clients → FamilyHub:** under **Authorised redirect URIs**, add the Nest's sign-in addresses, beside the Google ones:
   - `http://localhost:5173/auth/nest/callback` (the app running on your PC)
   - `http://localhost:3000/auth/nest/callback` (the Hub on the Pi, reached through SSH)

## 3. Switch the Device Access project to the Hub's client

The test in [Test the heating controls](heating-device-tests.md) made a Device Access project called `FamilyHub` with a test client of its own.

1. In the [Device Access console](https://console.nest.google.com/device-access), open the `FamilyHub` project.
2. Under **OAuth client ID**, choose **Edit**, and put in the Hub's client ID: `GOOGLE_CLIENT_ID` in `app/.env`.
3. Leave events (Pub/Sub) off. The Hub asks the Nest every 2 minutes instead.
4. Note the **Project ID**, a UUID.
5. If the test's client still exists, delete it in **Google Auth Platform → Clients**, and remove the test's access at <https://nestservices.google.com/partnerconnections>.

## 4. Give the Hub the project ID

On the PC, add it to `app/.env`:

```
NEST_PROJECT_ID=…
```

For the Pi, add it to the Key Vault as `nest-project-id`, as in [the Azure runbook](azure-setup.md), step 3:

```
read -rsp "nest-project-id: " value; echo
az keyvault secret set --vault-name "$vault" --name nest-project-id --value "$value" --output none
```

Then run the Pi's setup scripts with `--tags config` ([the Pi runbook](pi-setup.md)), which put it in the Hub's environment as `NEST_PROJECT_ID` and restart the Hub.

## 5. Connect the Nest

On the Pi, reach the Hub from the PC through SSH, as in [Sign the Hub in to Google](pi-setup.md#sign-the-hub-in-to-google):

```
ssh -N -L 3000:localhost:3000 hubadmin@$FAMILYHUB_PI_HOST
```

1. Open <http://localhost:3000/settings> in the PC's browser and hold **Hold to change** under Household and Google.
2. Choose **Connect the Nest**. Nest's Partner Connections page opens.
3. Choose the home, tick the **thermostat**, and allow access. Then sign in with the Household's Google account and allow FamilyHub to see and control the Nest. Google warns that it hasn't verified the app: choose **Advanced → Go to FamilyHub (unsafe)**, as for the Google sign-in.
4. Settings says the Nest is connected. Within 2 minutes the header on the wall shows the inside temperature. Check it matches the thermostat.
5. Stop the SSH command with Ctrl+C.

To disconnect, choose **Disconnect the Nest** in the same place, and tap again to confirm. The Calendars and lists keep their own sign-in. To remove the Hub's access on Google's side too, use <https://nestservices.google.com/partnerconnections>.

## If something goes wrong

- **Settings doesn't offer Connect the Nest:** the Hub has no `NEST_PROJECT_ID`. Check `app/.env`, or on the Pi the Key Vault and `--tags config`.
- **"Access blocked: This app's request is invalid", or `redirect_uri_mismatch`:** the address in step 2.3 is missing or different. It must match exactly, including `http` and the port.
- **Settings says "Google turned the Nest down":** usually the Device Access project still has the test's client (step 3), or the SDM API isn't enabled (step 2.1). The Hub's log has a line starting `Connecting the Nest failed:`.
- **The header says "Not reporting since …":** the Hub hasn't heard from the Nest for 15 minutes. Check the thermostat is online in the Google Home app. The log has one line for the run, starting `Heating sync failing, since`. If it says no thermostat is shared, connect again and tick the thermostat.
- **Settings says Google has ended the Nest's sign-in:** disconnect it, then connect it again.
