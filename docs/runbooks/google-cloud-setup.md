# Set up Google Cloud for the Hub

The Hub signs in to the Household's Google account to read the Calendars and the Shopping list. Google only lets a registered app do that, and a Google Cloud project is that registration. Nothing runs in Google Cloud and it costs nothing (see [ADR 0002](../adr/0002-everything-runs-on-the-pi.md)).

Do this once, signed in to the Household's Google account. It takes about 30 minutes. Google renames console pages from time to time, so a heading may not match exactly.

## 1. Create the project

1. Go to <https://console.cloud.google.com/>.
2. Open the project picker at the top, choose **New project**, name it `FamilyHub`, and create it.
3. Check that `FamilyHub` is selected in the project picker before going on.

## 2. Turn on the three APIs

1. Go to **APIs & Services → Library**.
2. Search for **Google Calendar API**, open it, and choose **Enable**.
3. Do the same for **Google Tasks API**.
4. Do the same for **Google Drive API**, for the nightly Chores backups.

## 3. Set up the sign-in screen

This is under **Google Auth Platform** (older consoles call it **OAuth consent screen**).

1. **Branding:** app name `FamilyHub`, and the Household's address as the support and developer contact email.
2. **Audience:** user type **External**.
3. **Data Access → Add or remove scopes:** add exactly these three:
   - `https://www.googleapis.com/auth/calendar.readonly` (read Calendars, never change them)
   - `https://www.googleapis.com/auth/tasks` (read and change the Shopping list)
   - `https://www.googleapis.com/auth/drive.file` (only the files the Hub creates itself: the Chores backups, in a "FamilyHub backups" folder)
4. **Audience → Test users → Add users:** add the Household's Google account. A new app starts in **Testing**, where only listed test users can sign in.

> [!NOTE]
> In **Testing**, Google ends the Hub's sign-in every 7 days. The Hub on the wall can't need signing in weekly, so the app doesn't stay there: once these steps are done, [publish the app](#publish-the-app).

## 4. Create the Hub's credentials

1. Go to **Clients → Create client**.
2. Application type: **Web application**. Name: `FamilyHub`.
3. Under **Authorised redirect URIs**, add:
   - `http://localhost:5173/auth/google/callback` (the app running on your PC)
   - `http://localhost:3000/auth/google/callback` (the Hub on the Pi, signed in through SSH from the PC: see [the Pi runbook](pi-setup.md), step 5)
4. Create it, then copy the **Client ID** and **Client secret**.

Put them in `app/.env`, which Git ignores. Never commit them, paste them into an issue, or put them anywhere else in the repo.

```
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
```

The Pi gets the same two from the Azure Key Vault, as `google-client-id` and `google-client-secret` ([the Azure runbook](azure-setup.md), step 3).

## 5. Note the Calendar IDs

The Hub needs to know which Calendar belongs to which Member.

1. Open [Google Calendar settings](https://calendar.google.com/calendar/r/settings).
2. For each Member calendar and the Family calendar, open it under **Settings for my calendars**, scroll to **Integrate calendar**, and copy the **Calendar ID**.

Calendar IDs aren't secret, but they're the Household's. Note them for now. They'll go into the Hub's settings file in the Google Calendar step.

| Calendar | Calendar ID |
|---|---|
| Ross | |
| Sam | |
| Maya | |
| Leo | |
| Family | |

## Publish the app

In **Testing**, Google ends the Hub's sign-in every 7 days. Published, it lasts until someone removes it. It stays **unverified**: don't submit it for verification, and don't add a logo, as a logo makes Google ask for verification.

Google won't publish an External app until its Branding page links a home page and a privacy policy. They're the two pages in [`site/`](../../site/), served by GitHub Pages and deployed by the `Pages` workflow whenever `site/` changes on main.

1. Check both pages load: <https://rosskgraham.github.io/FamilyHub/> and <https://rosskgraham.github.io/FamilyHub/privacy.html>. If they don't, check the repo's **Settings → Pages** has **Source: GitHub Actions**, and run the `Pages` workflow from the **Actions** tab.
2. **Google Auth Platform → Branding:**
   - **App home page:** `https://rosskgraham.github.io/FamilyHub/`
   - **App privacy policy link:** `https://rosskgraham.github.io/FamilyHub/privacy.html`
   - **Authorised domains → Add domain:** `rosskgraham.github.io`
   - Leave the logo empty, and save.
3. **Audience → Publish app**, and confirm. It should say **In production**.
4. Sign the Hub in to Google again, as in [the Pi runbook](pi-setup.md#sign-the-hub-in-to-google). A sign-in from Testing still expires after its 7 days, so the new one is what lasts. Google now shows a "Google hasn't verified this app" warning: choose **Advanced → Go to FamilyHub (unsafe)**. That's expected for a personal app, and it's shown once per account.

The privacy policy lists every scope the Hub asks for, including the Nest's `sdm.service`. If the Hub ever asks for another, add it to `site/privacy.html` first.

## If something goes wrong

- **"Access blocked: This app's request is invalid":** the redirect address doesn't match. Check it matches step 4 exactly, including `http` and the port.
- **The sign-in stops working after a week:** the app is still in Testing, or the Hub's sign-in is from before it was published. [Publish the app](#publish-the-app) if it isn't, then sign the Hub in again.
- **Publish app says "To publish your app, you must complete your configuration on the Branding page":** the home page or privacy policy link is missing, or its domain isn't under **Authorised domains** (see [Publish the app](#publish-the-app)). If all three are there and it still says so, Google doesn't say what's missing; a Google Cloud support case is the only way to find out.
- **Google won't accept `rosskgraham.github.io` as an authorised domain:** it may want proof of ownership. Verify `https://rosskgraham.github.io/FamilyHub/` in [Google Search Console](https://search.google.com/search-console) with its HTML file method, by adding the file it gives you to `site/`.
- **"Access blocked: FamilyHub has not completed the Google verification process":** the app is still in Testing and the account signing in isn't a test user. [Publish the app](#publish-the-app), or add the account (step 3.4).
- **"Access denied" with no warning screen:** the signed-in Google account isn't the Household's account.

## Adding the Drive permission to an existing setup

The Chores backups need the third scope. If the Hub was set up before it, turn on the **Google Drive API** (step 2), add the `drive.file` scope (step 3), then on the Hub's setup page choose **Sign out of Google** and sign in again. Until then, the setup page says the backups need a fresh sign-in, and everything else carries on as before.
