# Test the heating controls

Before the Hub can show or control the heating (AB#42), these tests check what the two thermostats really expose:

- the **Nest Learning Thermostat (3rd gen)**, through Google's Smart Device Management (SDM) API;
- the **ProWarm ProTouch iQ ST** that runs the bathroom's underfloor heating, through Tuya's local network protocol.

Nothing is installed on the Hub. Each test takes about 30 minutes. Do them on a PC at home, on the same network as the thermostats.

> [!CAUTION]
> These tests produce secrets: the Tuya device's local key, Tuya API keys, and Google OAuth tokens that can control the heating. Work in a folder **outside this repo** (for example `C:\heating-test`), never commit or paste them anywhere public, and delete the folder when you've finished. The results go on the card, without the secrets.

## A. The bathroom floor (ProWarm, Tuya local)

The ProWarm app is built on Tuya. Tuya devices also accept commands straight over the home network, protected by a per-device local key. The library `tinytuya` speaks that protocol. Getting the key needs a free Tuya developer account once.

### A1. Note the current settings

Re-pairing the thermostat (step A3) can lose its schedule. Before starting, write down or screenshot the thermostat's schedule and settings in the ProWarm app.

### A2. Create a Tuya developer project

1. Sign up at <https://iot.tuya.com/> (free).
2. **Cloud → Development → Create Cloud Project**:
   - Name: `FamilyHub`. Industry: Smart Home. Development method: **Smart Home**.
   - Data centre: **Central Europe**, which is where UK app accounts usually live. If the device doesn't show up in A3, add **Western Europe** in the project's settings as well.
3. When asked for API services, keep the defaults and make sure **IoT Core** and **Authorization Token Management** are included.
4. Open the project's **Overview** and note the **Access ID** and **Access Secret**.

> [!NOTE]
> IoT Core's free trial has to be extended every few months from the project's **Service API** page. That only matters for the one-time key fetch here. Local control doesn't use Tuya's cloud.

### A3. Link the thermostat to the project

Tuya's **Link App Account** only accepts the Tuya Smart and Smart Life apps, so first try the ProWarm app, then fall back to Smart Life.

1. In the project, go to **Devices → Link App Account → Add App Account**. A QR code appears.
2. **Try the ProWarm app first:** look for a scan button (often under **Me** or the **+** menu) and scan the code. If it links and the thermostat appears under **Devices → All Devices**, skip to A4.
3. **Otherwise use Smart Life:**
   1. Remove the thermostat from the ProWarm app.
   2. Install **Smart Life** and sign up.
   3. Put the thermostat into pairing mode as the ST Series instructions describe, and add it in Smart Life (**+ → Add Device**, or **Thermostat** under manual add).
   4. Check that you can change the temperature from Smart Life.
   5. In Smart Life go to **Me → scan icon**, scan the QR code, and confirm.
4. The thermostat should now appear under **Devices → All Devices**. Note its **Device ID**.

If it doesn't link through either app, stop here and note that on the card. The cloud API is the fallback, and it needs the same link.

### A4. Fetch the local key

In PowerShell, in your test folder:

```powershell
mkdir C:\heating-test; cd C:\heating-test
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install tinytuya
python -m tinytuya wizard
```

When the wizard asks, give it the Access ID, the Access Secret, the Device ID and the region (`eu`), and answer **Yes** to polling the devices. It writes `devices.json` (with the **local key**), `tuya-raw.json` and `snapshot.json` into the folder.

### A5. Find it on the network

```powershell
python -m tinytuya scan
```

Note the thermostat's **IP address** and protocol **version** (3.3, 3.4 or 3.5). If it isn't found, check that the PC and thermostat are on the same network. Guest Wi-Fi often isolates devices.

> [!TIP]
> Give the thermostat a fixed IP address (an address reservation) in the Deco app, so the Hub can always find it.

### A6. Read it

`devices.json` includes a `mapping` for the device: what each numbered data point (DP) means, such as `switch`, `temp_set` or `temp_current`, its type, and any scale (a scale of 1 means 21.5° is sent as 215). Then:

```powershell
python -c "import tinytuya; d = tinytuya.Device('DEVICE_ID', 'IP', 'LOCAL_KEY', version=3.3); print(d.status())"
```

Use the version from A5. Compare the output with the thermostat's screen, and note which DPs give:

- on or off;
- the target temperature;
- the floor temperature and, if it has one, the air temperature;
- the mode (manual, schedule, holiday);
- anything else, such as child lock, frost protection, or whether it's heating right now.

### A7. Control it

Change one thing at a time, using the DP numbers and scale from A6, and check the thermostat's screen after each:

```powershell
python -c "import tinytuya; d = tinytuya.Device('DEVICE_ID', 'IP', 'LOCAL_KEY', version=3.3); print(d.set_value(2, 230))"
```

1. Raise the target temperature by 1°, then put it back.
2. Turn it off, then on.
3. Switch from schedule to manual, then back.

### A8. Check it works without the internet (optional)

Unplug the Deco's internet cable for a minute and run A6 again. If it still answers, the Hub can control the floor with the internet down.

### A9. Check the Pi can reach it

The Pi is on Cat6 and the thermostat on Wi-Fi, so check from the Pi itself:

```sh
ssh hubadmin@familyhub.local
python3 -m venv ~/heating-test && . ~/heating-test/bin/activate
pip install tinytuya
python -m tinytuya scan
python -c "import tinytuya; d = tinytuya.Device('DEVICE_ID', 'IP', 'LOCAL_KEY', version=3.3); print(d.status())"
deactivate; rm -rf ~/heating-test
```

## B. The Nest (Google SDM API)

> [!NOTE]
> This was the one-off test, with a client of its own. To connect the Nest to the Hub for real, follow [Connect the Nest to the Hub](nest-setup.md).

The Nest must be in the Google Home app, signed in to the Google account that owns it. Device Access is registered on that account.

### B1. Register for Device Access

1. Go to <https://console.nest.google.com/device-access>, signed in to the account that owns the Nest.
2. Accept the terms and pay the one-time **US$5** fee.

### B2. Make an OAuth client

In the Hub's Google Cloud project (see [Google Cloud setup](google-cloud-setup.md)):

1. **APIs & Services → Library:** enable **Smart Device Management API**.
2. **Google Auth Platform → Clients → Create client:** type **Web application**, name `FamilyHub heating test`, and add `https://www.google.com` as an authorised redirect URI.
3. Note the **client ID** and **client secret**.
4. **Google Auth Platform → Audience → Test users:** add the Google account that owns the Nest, if it isn't listed already. Only needed while the app is in Testing: then any other account gets "Access blocked … has not completed the Google verification process" in B4.

This test uses its own client, so the Hub's sign-in isn't touched. If the app is still in Testing, its tokens last 7 days, which is plenty for a test.

### B3. Create a Device Access project

1. In the Device Access console, **Create project**, name it `FamilyHub`, and give it the OAuth client ID from B2.
2. Skip events (Pub/Sub) for now.
3. Note the **project ID** (a UUID).

### B4. Authorise

Open this URL in a browser, with your project ID and client ID filled in:

```text
https://nestservices.google.com/partnerconnections/PROJECT_ID/auth?redirect_uri=https://www.google.com&access_type=offline&prompt=consent&client_id=CLIENT_ID&response_type=code&scope=https://www.googleapis.com/auth/sdm.service
```

Choose the home, tick the thermostat, and allow access. Google redirects to `https://www.google.com/?code=...`. Copy the `code` value.

Swap it for tokens. In Git Bash:

```sh
curl -s https://oauth2.googleapis.com/token \
  -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET \
  -d code=CODE -d grant_type=authorization_code \
  -d redirect_uri=https://www.google.com
```

Note the `access_token`, which lasts an hour, and the `refresh_token`.

### B5. Read it

```sh
curl -s -H "Authorization: Bearer ACCESS_TOKEN" \
  https://smartdevicemanagement.googleapis.com/v1/enterprises/PROJECT_ID/devices
```

The first call also completes the authorisation. Note the device's `name` (`enterprises/.../devices/DEVICE_ID`) and which traits it reports:

- `sdm.devices.traits.Temperature`: the room temperature;
- `sdm.devices.traits.Humidity`;
- `sdm.devices.traits.ThermostatMode`: the current mode and the available modes;
- `sdm.devices.traits.ThermostatEco`;
- `sdm.devices.traits.ThermostatHvac`: `HEATING` or `OFF`;
- `sdm.devices.traits.ThermostatTemperatureSetpoint`: the heat setpoint;
- `sdm.devices.traits.Connectivity`.

### B6. Control it

With the thermostat in **Heat** mode, raise the setpoint by 1°, check the thermostat and the Nest app, then put it back:

```sh
curl -s -X POST -H "Authorization: Bearer ACCESS_TOKEN" -H "Content-Type: application/json" \
  https://smartdevicemanagement.googleapis.com/v1/enterprises/PROJECT_ID/devices/DEVICE_ID:executeCommand \
  -d '{"command":"sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat","params":{"heatCelsius":21.0}}'
```

Then note how long the change lasts. A manual change is expected to hold until the schedule's next change.

### B7. Tidy up

Delete the OAuth client from B2 when you've finished. Then, in the Google Home app or at <https://nestservices.google.com/partnerconnections>, remove FamilyHub's access. The Device Access project and the $5 registration stay for the real integration.

## C. Post the results on the card

Comment on AB#42 with:

- **Floor:** which app linked, protocol version, each DP (number, code, type, scale) and what it did, whether the controls worked, whether it worked offline, and whether the Pi reached it.
- **Nest:** the traits and values reported, whether SetHeat worked, and how long it held.
- Anything that failed, and what wasn't tried.

Never include local keys, API secrets or tokens.
