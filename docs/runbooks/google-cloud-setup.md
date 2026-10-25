# Set up Google Cloud for the Hub

The Hub signs in to the Household's Google account to read the Calendars and the Shopping list. Google only lets a registered app do that, and a Google Cloud project is that registration. Nothing runs in Google Cloud and it costs nothing (see [ADR 0002](../adr/0002-everything-runs-on-the-pi.md)).

Do this once, signed in to the Household's Google account. It takes about 30 minutes. Google renames console pages from time to time, so a heading may not match exactly.

## 1. Create the project

1. Go to <https://console.cloud.google.com/>.
2. Open the project picker at the top, choose **New project**, name it `FamilyHub`, and create it.
3. Check that `FamilyHub` is selected in the project picker before going on.

## 2. Turn on the two APIs

1. Go to **APIs & Services → Library**.
2. Search for **Google Calendar API**, open it, and choose **Enable**.
3. Do the same for **Google Tasks API**.

## 3. Set up the sign-in screen

This is under **Google Auth Platform** (older consoles call it **OAuth consent screen**).

1. **Branding:** app name `FamilyHub`, and the Household's address as the support and developer contact email.
2. **Audience:** user type **External**.
3. **Data Access → Add or remove scopes:** add exactly these two:
   - `https://www.googleapis.com/auth/calendar.readonly` (read Calendars, never change them)
   - `https://www.googleapis.com/auth/tasks` (read and change the Shopping list)
4. **Audience → Publish app**, and confirm. The status must say **In production**.

> [!IMPORTANT]
> Don't leave the app in **Testing**. In Testing, Google ends the Hub's sign-in every 7 days. In production but unverified, the sign-in lasts, and Google shows a "Google hasn't verified this app" warning once when you sign in. Choose **Advanced → Go to FamilyHub (unsafe)** to continue. That warning is expected for a personal app and isn't a problem. Don't submit the app for verification.

## 4. Create the Hub's credentials

1. Go to **Clients → Create client**.
2. Application type: **Web application**. Name: `FamilyHub`.
3. Under **Authorised redirect URIs**, add:
   - `http://localhost:5173/auth/google/callback` (the app running on your PC)
4. Create it, then copy the **Client ID** and **Client secret**.

Put them in `app/.env`, which Git ignores. Never commit them, paste them into an issue, or put them anywhere else in the repo.

```
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
```

The Pi gets its own redirect address and its secrets come from Azure Key Vault. Both are set up in the Pi milestone.

## 5. Note the Calendar IDs

The Hub needs to know which Calendar belongs to which Member.

1. Open [Google Calendar settings](https://calendar.google.com/calendar/r/settings).
2. For each Member calendar and the Family calendar, open it under **Settings for my calendars**, scroll to **Integrate calendar**, and copy the **Calendar ID**.

Calendar IDs aren't secret, but they're the Household's. Note them for now. They'll go into the Hub's settings file in the Google Calendar step.

| Calendar | Calendar ID |
|---|---|
| Alex | |
| Sam | |
| Maya | |
| Leo | |
| Family | |

## If something goes wrong

- **"Access blocked: This app's request is invalid":** the redirect address doesn't match. Check it matches step 4 exactly, including `http` and the port.
- **The sign-in stops working after a week:** the app is still in Testing. Publish it (step 3.4) and sign in again.
- **"Access denied" with no warning screen:** the signed-in Google account isn't the Household's account.
