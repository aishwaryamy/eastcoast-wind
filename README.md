# East Coast Wind

Interactive Leaflet map that visualizes near-real-time National Weather Service (NWS) wind data for the US East Coast. Flask serves the API data, while the frontend renders wind dots/arrows over an OpenStreetMap basemap.

## Quick Start

1. **Install dependencies**
   ```bash
   pip install -r backend/requirements.txt
   npm install    # if you have frontend build tooling (optional)
   ```
2. **Set NWS User-Agent contact (required)**  
   NWS blocks anonymous traffic. Update `backend/app.py` → `USER_AGENT` with a real contact. For now we use the placeholder below until a permanent contact is approved:
   ```python
   USER_AGENT = "EastCoastWindMap/1.0 (Shruti Vasave, shruti.vasave@ithacacleanenergy.com, +1-315-278-1298)"
   ```
3. **Run the backend**
   ```bash
   cd backend
   FLASK_APP=app.py flask run --port 5055
   ```
4. **Open the frontend**  
   Serve the `frontend/` directory (e.g., `npx serve frontend`) and browse to `http://localhost:3000`.

## Current Fixes & Notes

- Added robust NWS `validTime` parsing plus wind speed unit conversion so `/ocean-wind-data` returns usable GeoJSON features.
- Added CORS to the Flask app so the frontend can call the backend directly.

## Known Bug

- **Wind arrows missing** – The Leaflet layer silently falls back to colored dots because the backend call is rejected by the NWS API when `USER_AGENT` lacks a real contact. Until the contact above is configured (or replaced with your own), arrow rendering will not show live data. See “Set NWS User-Agent contact” for the temporary credentials and instructions.

## Adding Your Own Contact

1. Edit `backend/app.py` line 13:
   ```python
   USER_AGENT = "EastCoastWindMap/1.0 (Your Name, your.email@example.com, +1-555-555-5555)"
   ```
2. Ensure the email and phone are reachable per [NWS API best practices](https://www.weather.gov/documentation/services-web-api).
3. Restart the Flask server so requests include the new header.

Once the user-agent uses a valid contact, the frontend’s fetch at `frontend/wind-grid.js:79` receives live wind vectors and the arrows render correctly when zoomed to level 9+.***
