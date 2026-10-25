# WARFRONT FIVE v2.9 — Road Dots Update

WARFRONT FIVE is a fictional five-player strategy browser game with real-world map imagery and fictional teams, bases, units, missile game effects, aircraft and traffic. It is not a tracking or weapon-control system.

## What's new in v2.9

- **Tiny moving dots:** Fictional cars are now small circles instead of car-shaped icons. Tap a dot to see its invented `SIM-####` license plate and simulated status.
- **A lot more traffic:** 100 cars by default, adjustable from 20 to 200 with the `ROAD DOTS` slider.
- **Cars follow mapped streets:** The server requests street *geometry* from public OpenStreetMap/Overpass data. The simulated dots move along those mapped road lines rather than randomly crossing land.
- **View-following traffic:** Panning the map to a different nearby neighborhood at street zoom automatically reloads street lines for the new area.
- **Performance:** Cars are rendered using Leaflet Canvas circles to keep many dots smoother on mobile.
- **Better fallback:** When real street-line data is unavailable, cars do not silently run on made-up lines. The status tells you the problem. `LOAD MAP ROADS` retries; `DEMO ROADS` explicitly activates a **fictional grid**, with dashed lines identifying it as simulated.
- Red-light stops and occasional traffic jams remain invented visual behaviors, not live traffic data.

## How to use

1. Upload the project files to GitHub and deploy your Render Web Service (start command `npm start`; no external Node packages are needed).
2. Open the HTTPS website and join a Red or Blue team.
3. Press **MY BASE** and zoom to a street-level map (zoom 11 or closer).
4. Switch **SIMULATED ROAD CARS** on. The site tries to load mapped roads near the visible map area.
5. Set **ROAD DOTS** to anywhere from **20** to **200**.
6. If the status reports mapped roads unavailable, press **LOAD MAP ROADS** to retry. Press **DEMO ROADS** only if you want fictional lines rather than actual mapped roads.

## Previous features kept

- Up to five players, Red/Blue teams, team chat and permission-controlled private voice/video calls and War Cam.
- Interactive internet-connected base map with Streets, Terrain and Satellite styles, plus RGB, Heat and Night Vision visual filters.
- Fictional U.S. team bases and simulated aircraft.
- Photo catalog selections for ATV, UAV, Jets, Tanks, Missiles and Other Vehicles; all 23 previously supplied vehicle photos remain present.
- Whole-UI and War Cam grit, grit size, hue, saturation, brightness and glitch effects.

## Limitations

- Real road **lines** and map tiles require internet. Road geometry comes from public Overpass providers, which may be busy, rate-limited or unavailable. The external road service was not reachable from the build/testing environment; only simulated road responses could be tested locally.
- Moving dots are **fictional traffic**. They are not real cars, GPS tracks, live road conditions, actual traffic lights or real license plates.
- This version uses real street geometry when available, not real driving decisions. Some dots reverse at the end of a mapped road segment instead of turning at a junction.
- Players' ambient traffic is rendered locally on each player's device; counts/individual positions are not synchronized among players.
- Real phone-to-phone WebRTC calls remain dependent on browser permissions and network conditions.

## Project structure

Keep `server.js`, `package.json`, `README.md` and the `public/` directory at the repository root. The server uses Node.js 18+ and has no npm dependencies. `npm start` runs the web server; `GET /health` checks that it is running.
