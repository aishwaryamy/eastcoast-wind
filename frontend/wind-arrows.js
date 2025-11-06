// ---- config ----
const PROXY = "http://localhost:5055";            // your Flask backend
const CELL_KM = 10;                                // ~10 km spacing
const TILE_KM = 80;                                // request radius ~40 km
const TILE_R = TILE_KM/2;
const MAX_CELLS = 120;                             // cap per tile
const ARROW_ZOOM = 10;
const MAX_KT = 40;

const INIT_BOUNDS = [[24.0,-81.9],[45.5,-66.0]];  // East Coast

// ---- helpers ----
const scale = chroma.scale(['#e5f5ff','#b3e0ff','#66bfff','#1f93ff','#0a5dff','#083bba']).domain([0, MAX_KT]);

function colorForKt(k){ if (k == null) return '#cccccc'; return scale(Math.min(MAX_KT, Math.max(0,k))).hex(); }

// canvas renderer for arrows
const arrowLayer = L.layerGroup();
const paletteLayer = L.geoJSON(null, {
  style: (f) => ({
    fillColor: colorForKt(f.properties.speed_kt),
    fillOpacity: 0.85, color: "transparent", weight: 0
  })
});

const map = L.map("map", { preferCanvas: true });
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
map.fitBounds(INIT_BOUNDS, { padding:[20,20] });
paletteLayer.addTo(map);
arrowLayer.addTo(map);

// tile cache per hour
const tileCache = new Map(); // key: "z:x:y:hour" -> FeatureCollection

function km2degLat(km){ return km/110.574; }
function km2degLon(km, lat){ return km/(111.320 * Math.cos(lat*Math.PI/180)); }

function tileCentersForView(){
  const b = map.getBounds();
  const c = map.getCenter();
  const latStep = km2degLat(TILE_R);
  const lonStep = km2degLon(TILE_R, c.lat);
  const lats = []; for (let y = Math.floor((b.getSouth()-c.lat)/latStep)-1; y <= Math.ceil((b.getNorth()-c.lat)/latStep)+1; y++) lats.push(c.lat + y*latStep);
  const lons = []; for (let x = Math.floor((b.getWest() -c.lng)/lonStep)-1; x <= Math.ceil((b.getEast() -c.lng)/lonStep)+1; x++) lons.push(c.lng + x*lonStep);
  const centers = [];
  for (const lat of lats) for (const lon of lons) centers.push({lat, lon});
  return centers;
}

async function fetchTile(centerLat, centerLon){
  const hourKey = new Date().toISOString().slice(0,13); // YYYY-MM-DDTHH
  const key = `${centerLat.toFixed(2)}:${centerLon.toFixed(2)}:${hourKey}`;
  if (tileCache.has(key)) return tileCache.get(key);

  const url = new URL(`${PROXY}/nws/forecast/windgrid`);
  url.searchParams.set("centerLat", centerLat);
  url.searchParams.set("centerLon", centerLon);
  url.searchParams.set("radiusKm", TILE_R);
  url.searchParams.set("cellKm", CELL_KM);
  url.searchParams.set("maxCells", MAX_CELLS);

  const r = await fetch(url);
  if (!r.ok){ console.warn("tile fetch failed", r.status); return { type:"FeatureCollection", features:[] }; }
  const gj = await r.json();
  tileCache.set(key, gj);
  return gj;
}

function drawArrows(fc){
  // clear previous
  arrowLayer.clearLayers();
  // draw as canvas symbols
  fc.features.forEach(f => {
    const [lng,lat] = f.geometry.coordinates;
    const p = f.properties || {};
    if (p.bearing == null) return; // need direction to rotate
    const m = L.marker([lat,lng], {
      icon: L.divIcon({
        className: "",
        html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
                     style="transform:rotate(${p.bearing}deg)">
                 <polygon points="12,2 22,22 12,18 2,22" fill="${colorForKt(p.speed_kt)}"/>
               </svg>`,
        iconSize:[28,28], iconAnchor:[14,14]
      })
    });
    m.bindPopup(`<b>${(p.speed_kt??"—").toFixed ? p.speed_kt.toFixed(1) : p.speed_kt} kt</b><br>
                 Dir(from): ${p.dir_from_deg??"—"}°`);
    m.addTo(arrowLayer);
  });
}

function drawPalette(fc){
  // render small squares (~cell size) for smooth palette when zoomed out
  const cellLat = km2degLat(CELL_KM);
  const cellLon = km2degLon(CELL_KM, map.getCenter().lat);
  const polys = fc.features.map(f => {
    const [lng,lat] = f.geometry.coordinates;
    const halfLat = cellLat/2, halfLon = cellLon/2;
    return {
      type:"Feature",
      geometry:{
        type:"Polygon",
        coordinates:[[
          [lng-halfLon, lat-halfLat],[lng+halfLon, lat-halfLat],
          [lng+halfLon, lat+halfLat],[lng-halfLon, lat+halfLat],[lng-halfLon, lat-halfLat]
        ]]
      },
      properties:{ speed_kt: (f.properties||{}).speed_kt }
    };
  });
  paletteLayer.clearLayers().addData({type:"FeatureCollection", features:polys});
}

let inflight = 0;
async function refresh(){
  const centers = tileCentersForView();
  const tiles = await Promise.all(centers.map(c => fetchTile(c.lat, c.lon)));
  // merge all tile features
  const merged = { type:"FeatureCollection", features: tiles.flatMap(t => t.features) };
  const z = map.getZoom();
  drawPalette(merged);
  if (z >= ARROW_ZOOM) drawArrows(merged);
  else arrowLayer.clearLayers();
}

map.on("moveend zoomend", () => refresh());
refresh();

// Legend
(function legend(){
  const el = document.getElementById("legend");
  const ticks = [0,5,10,15,20,25,30,40];
  el.innerHTML = `<div><b>Wind (kt)</b></div><div class="scale"></div><div>${ticks.join('   ')}</div>`;
  const s = el.querySelector(".scale");
  for (let kt=0; kt<40; kt++){
    const d = document.createElement("div");
    d.className="box"; d.style.background = scale(kt).hex();
    s.appendChild(d);
  }
})();
