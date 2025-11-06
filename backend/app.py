from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import math
from datetime import datetime, timezone, timedelta
import re
import os

app = Flask(__name__)
CORS(app)

# NWS API Configuration
NWS_BASE = "https://api.weather.gov"
USER_AGENT = "EastCoastWindMap/1.0 (your-email@example.com)"

# East Coast ocean area bounds (from Florida to Maine, extending into ocean)
EAST_COAST_BOUNDS = {
    'north': 45.0,  # Maine
    'south': 24.0,  # Florida
    'west': -82.0,  # Offshore
    'east': -65.0   # Further offshore
}

def get_headers():
    return {"User-Agent": USER_AGENT, "Accept": "application/geo+json"}

def km_to_deg_lat(km):
    return km / 111.32

def km_to_deg_lon(km, lat):
    return km / (111.32 * math.cos(math.radians(lat)))

VALID_TIME_DURATION = re.compile(
    r"P(?:(?P<days>\d+)D)?"
    r"(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?"
)


def parse_valid_time(valid_time):
    """Return (start_datetime, end_datetime) for an NWS validTime string."""
    if not valid_time or "/" not in valid_time:
        return None, None

    start_str, duration_str = valid_time.split("/", 1)
    try:
        start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
    except ValueError:
        return None, None

    match = VALID_TIME_DURATION.fullmatch(duration_str)
    if not match:
        return start_dt, None

    parts = {key: int(value) if value else 0 for key, value in match.groupdict().items()}
    duration_delta = timedelta(
        days=parts.get("days", 0),
        hours=parts.get("hours", 0),
        minutes=parts.get("minutes", 0),
        seconds=parts.get("seconds", 0),
    )

    if duration_delta == timedelta(0):
        return None, None

    return start_dt, start_dt + duration_delta


def to_knots(speed_value, unit_code):
    """Convert NWS wind speed value to knots using the provided unit code."""
    if speed_value is None:
        return None

    unit_multipliers = {
        "wmoUnit:km_h-1": 0.539957,
        "wmoUnit:m_s-1": 1.94384,
        "wmoUnit:knot": 1.0,
        "unit:km_h": 0.539957,
        "unit:m_s": 1.94384,
        "unit:kt": 1.0,
    }

    multiplier = unit_multipliers.get(unit_code)
    if multiplier is None:
        # Default to knots if unit is missing/unknown
        return speed_value

    return speed_value * multiplier

def create_ocean_grid():
    """Create grid points covering East Coast ocean areas"""
    grid_spacing_km = 10
    points = []
    
    # Create dense grid over ocean areas
    lat_step = km_to_deg_lat(grid_spacing_km)
    current_lat = EAST_COAST_BOUNDS['south']
    
    while current_lat <= EAST_COAST_BOUNDS['north']:
        lon_step = km_to_deg_lon(grid_spacing_km, current_lat)
        current_lon = EAST_COAST_BOUNDS['west']
        
        while current_lon <= EAST_COAST_BOUNDS['east']:
            # Focus on ocean areas (east of coastlines)
            if current_lon < -75.0 or (current_lat > 35.0 and current_lon < -70.0):
                points.append((current_lat, current_lon))
            
            current_lon += lon_step
        current_lat += lat_step
    
    print(f"Created {len(points)} ocean grid points")
    return points

def get_wind_data(lat, lon):
    """Get wind data from NWS API for a specific point"""
    try:
        # Get gridpoint data
        points_url = f"{NWS_BASE}/points/{lat:.4f},{lon:.4f}"
        response = requests.get(points_url, headers=get_headers(), timeout=10)
        
        if response.status_code != 200:
            return None
            
        points_data = response.json()
        grid_url = points_data['properties']['forecastGridData']
        
        # Get forecast data
        grid_response = requests.get(grid_url, headers=get_headers(), timeout=10)
        if grid_response.status_code != 200:
            return None
            
        grid_data = grid_response.json()
        properties = grid_data['properties']
        
        # Get current wind values
        now = datetime.now(timezone.utc)
        
        def find_current_value(values):
            for item in values:
                start_dt, end_dt = parse_valid_time(item.get('validTime', ''))
                if not start_dt or not end_dt:
                    continue
                if start_dt <= now < end_dt:
                    return item.get('value')
            return None

        wind_speed_value = find_current_value(properties.get('windSpeed', {}).get('values', []))
        wind_speed_uom = properties.get('windSpeed', {}).get('uom')
        wind_direction = find_current_value(properties.get('windDirection', {}).get('values', []))

        wind_speed_kt = to_knots(wind_speed_value, wind_speed_uom)
            
        return {
            'speed_kt': wind_speed_kt,
            'direction': wind_direction,
            'lat': lat,
            'lon': lon
        }
        
    except Exception as e:
        print(f"Error getting wind data for {lat},{lon}: {e}")
        return None

@app.route('/health')
def health():
    return jsonify({"status": "healthy"})

@app.route('/ocean-wind-data')
def ocean_wind_data():
    """Endpoint to get wind data for East Coast ocean areas"""
    try:
        grid_points = create_ocean_grid()
        wind_features = []
        
        # Get wind data for each point (limit for demo)
        for i, (lat, lon) in enumerate(grid_points[:100]):  # Limit to 100 points for performance
            if i % 5 == 0:  # Sample every 5th point for faster response
                wind_data = get_wind_data(lat, lon)
                
                if wind_data and wind_data['speed_kt'] is not None:
                    feature = {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [lon, lat]
                        },
                        "properties": {
                            "speed_kt": wind_data['speed_kt'],
                            "dir_from_deg": wind_data['direction'],
                            "speed_mph": wind_data['speed_kt'] * 1.15078,
                            "speed_kmh": wind_data['speed_kt'] * 1.852
                        }
                    }
                    wind_features.append(feature)
        
        return jsonify({
            "type": "FeatureCollection",
            "features": wind_features
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/test-wind-data')
def test_wind_data():
    """Test endpoint with sample data"""
    return jsonify({
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [-75.0, 35.0]
                },
                "properties": {
                    "speed_kt": 15.5,
                    "dir_from_deg": 270,
                    "speed_mph": 17.8,
                    "speed_kmh": 28.7
                }
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [-74.0, 36.0]
                },
                "properties": {
                    "speed_kt": 22.3,
                    "dir_from_deg": 245,
                    "speed_mph": 25.7,
                    "speed_kmh": 41.3
                }
            }
        ]
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5055, debug=True)
