// Sunrise and sunset worked out from where home is and the date, with the sunrise equation, so the theme never
// depends on the internet. Good to a minute or two, which is plenty for when the wall changes theme.
import type { SunTimes } from './theme.ts';
import { formatTime, type DayKey } from './time.ts';

const DAY_MS = 24 * 3600_000;
// Julian days count from noon on 1 January 4713 BC; this is 1 January 1970.
const UNIX_EPOCH_JD = 2440587.5;
const J2000 = 2451545;
// Where the Sun's centre is when it rises: the refraction near the horizon and the Sun's own size.
const HORIZON = -0.833;
const TILT = 23.4397;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Sunrise and sunset on `day` at a latitude and longitude (east positive), as UK wall-clock times. */
export function sunTimesOn(day: DayKey, latitude: number, longitude: number): SunTimes {
	const noon = Date.parse(`${day}T12:00:00Z`) / DAY_MS + UNIX_EPOCH_JD;
	const n = Math.round(noon - J2000 + 0.0008);
	const meanNoon = n - longitude / 360;
	const anomaly = (357.5291 + 0.98560028 * meanNoon) % 360;
	const centre =
		1.9148 * Math.sin(rad(anomaly)) + 0.02 * Math.sin(rad(2 * anomaly)) + 0.0003 * Math.sin(rad(3 * anomaly));
	const eclipticLongitude = (anomaly + centre + 180 + 102.9372) % 360;
	const transit = J2000 + meanNoon + 0.0053 * Math.sin(rad(anomaly)) - 0.0069 * Math.sin(rad(2 * eclipticLongitude));
	const declination = Math.asin(Math.sin(rad(eclipticLongitude)) * Math.sin(rad(TILT)));
	const cosHourAngle =
		(Math.sin(rad(HORIZON)) - Math.sin(rad(latitude)) * Math.sin(declination)) /
		(Math.cos(rad(latitude)) * Math.cos(declination));
	// Clamped, for midsummer and midwinter far enough north that the Sun never quite sets or rises.
	const hourAngle = deg(Math.acos(Math.min(1, Math.max(-1, cosHourAngle))));
	const at = (jd: number) => formatTime(new Date((jd - UNIX_EPOCH_JD) * DAY_MS));
	return { sunrise: at(transit - hourAngle / 360), sunset: at(transit + hourAngle / 360) };
}
