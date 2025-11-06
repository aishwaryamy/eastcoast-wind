// Configuration
const PROXY = "http://localhost:5055";
const ARROW_ZOOM_LEVEL = 9;

// Initialize Map
const map = L.map('map').setView([35.0, -75.0], 6);

// Add Base Map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
}).addTo(map);

// Set East Coast bounds
const eastCoastBounds = L.latLngBounds(
    [24.0, -82.0], // SW corner
    [45.0, -65.0]  // NE corner
);
map.setMaxBounds(eastCoastBounds);

// Wind Layer
const windLayer = L.layerGroup().addTo(map);

// Fishweather Color Palette
function getWindColor(speedKt) {
    if (!speedKt) return '#cccccc';
    if (speedKt < 1) return '#f0f8ff';
    if (speedKt < 5) return '#e6f3ff';
    if (speedKt < 10) return '#b3d9ff';
    if (speedKt < 15) return '#66b3ff';
    if (speedKt < 20) return '#3385ff';
    if (speedKt < 25) return '#0066cc';
    if (speedKt < 30) return '#004d99';
    if (speedKt < 35) return '#ffcc00';
    if (speedKt < 40) return '#ff9900';
    if (speedKt < 50) return '#ff6600';
    return '#ff3300';
}

// Create Wind Arrow Icon
function createWindArrow(speed, direction) {
    const color = getWindColor(speed);
    const rotation = direction || 0;
    
    return L.divIcon({
        className: 'wind-arrow',
        html: `
            <div style="transform: rotate(${rotation}deg); transform-origin: center; width: 40px; height: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <!-- Arrow shaft and head -->
                <div style="width: 2px; height: 20px; background: ${color}; position: relative; margin-bottom: 2px;">
                    <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 10px solid ${color}; position: absolute; top: -4px; left: 50%; transform: translateX(-50%);"></div>
                </div>
                <!-- Speed label -->
                <div style="font-size: 10px; font-weight: bold; color: #000; background: rgba(255,255,255,0.9); border-radius: 3px; padding: 1px 4px; border: 1px solid #ccc; min-width: 20px; text-align: center; font-family: Arial, sans-serif;">
                    ${speed ? Math.round(speed) : '?'}kt
                </div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });
}

// Create Color Dot Icon
function createColorDot(speed) {
    const color = getWindColor(speed);
    return L.divIcon({
        className: 'wind-dot',
        html: `<div style="width: 14px; height: 14px; background: ${color}; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });
}

// Fetch Wind Data
async function fetchWindData() {
    try {
        console.log('Fetching ocean wind data...');
        const response = await fetch(`${PROXY}/ocean-wind-data`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Received ${data.features.length} wind data points`);
        return data.features;
    } catch (error) {
        console.error('Error fetching wind data:', error);
        // Fallback to test data
        const testResponse = await fetch(`${PROXY}/test-wind-data`);
        const testData = await testResponse.json();
        return testData.features;
    }
}

// Display Wind Data on Map
async function displayWindData() {
    // Clear existing data
    windLayer.clearLayers();
    
    const features = await fetchWindData();
    const currentZoom = map.getZoom();
    
    features.forEach(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;
        const latlng = [coords[1], coords[0]];
        
        let icon, popupContent;
        
        if (currentZoom >= ARROW_ZOOM_LEVEL && props.dir_from_deg) {
            // Show arrows when zoomed in
            icon = createWindArrow(props.speed_kt, props.dir_from_deg);
            popupContent = `
                <div style="min-width: 180px; font-family: Arial, sans-serif;">
                    <h4 style="margin: 0 0 12px 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px;">Wind Information</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
                        <div><strong>Speed:</strong></div>
                        <div>${Math.round(props.speed_kt)} knots</div>
                        <div><strong>Direction:</strong></div>
                        <div>${Math.round(props.dir_from_deg)}°</div>
                        <div><strong>MPH:</strong></div>
                        <div>${Math.round(props.speed_mph)} mph</div>
                        <div><strong>KM/H:</strong></div>
                        <div>${Math.round(props.speed_kmh)} km/h</div>
                    </div>
                    <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #666;">
                        Source: NWS Forecast Data
                    </div>
                </div>
            `;
        } else {
            // Show color dots when zoomed out
            icon = createColorDot(props.speed_kt);
            popupContent = `
                <div style="min-width: 120px; font-family: Arial, sans-serif;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
                        <div><strong>Speed:</strong></div>
                        <div>${Math.round(props.speed_kt)} knots</div>
                        <div><strong>MPH:</strong></div>
                        <div>${Math.round(props.speed_mph)} mph</div>
                    </div>
                </div>
            `;
        }
        
        const marker = L.marker(latlng, { icon: icon });
        marker.bindPopup(popupContent);
        windLayer.addLayer(marker);
    });
}

// Create Legend
function createLegend() {
    const legend = document.getElementById('legend');
    const windSpeeds = [0, 1, 5, 10, 15, 20, 25, 30, 35, 40, 50];
    
    let legendHTML = `
        <h4 style="margin: 0 0 10px 0; font-size: 14px;">Wind Speed (knots)</h4>
        <div class="scale" style="display: flex; height: 20px; border-radius: 4px; overflow: hidden; margin-bottom: 5px;">
    `;
    
    windSpeeds.forEach((speed, index) => {
        if (index < windSpeeds.length - 1) {
            const color = getWindColor(speed + 1);
            legendHTML += `<div style="flex: 1; background: ${color};"></div>`;
        }
    });
    
    legendHTML += `</div>`;
    legendHTML += `
        <div class="labels" style="display: flex; justify-content: space-between; font-size: 10px; color: #666;">
            <span>0</span>
            <span>10</span>
            <span>20</span>
            <span>30</span>
            <span>40+</span>
        </div>
    `;
    
    legend.innerHTML = legendHTML;
}

// Add CSS for wind elements
const style = document.createElement('style');
style.textContent = `
    .wind-arrow, .wind-dot {
        background: none !important;
        border: none !important;
    }
    .leaflet-popup-content {
        margin: 15px 18px !important;
    }
`;
document.head.appendChild(style);

// Event Listeners
map.on('moveend', displayWindData);
map.on('zoomend', displayWindData);

// Initialize
createLegend();
displayWindData();

// Auto-refresh every 10 minutes
setInterval(displayWindData, 600000);
