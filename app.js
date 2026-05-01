let previousShipFeatures = {};
let currentShipFeatures = {};
let animationFrameId = null;

async function initApp() {

  const configResponse = await fetch("/config");
  const config = await configResponse.json();

  mapboxgl.accessToken = config.mapbox_token;

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/satellite-streets-v12",
    center: [103.82, 1.23],
    zoom: 10.2
  });

  map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

  map.on("load", async function () {

    map.addSource("ships-source", {
      type: "geojson",
      data: emptyFeatureCollection()
    });

    map.addLayer({
      id: "ships-glow",
      type: "circle",
      source: "ships-source",
      paint: {
        "circle-radius": 14,
        "circle-color": ["get", "color"],
        "circle-opacity": 0.2,
        "circle-blur": 0.9
      }
    });

    map.addLayer({
      id: "ships",
      type: "circle",
      source: "ships-source",
      paint: {
        "circle-radius": 6,
        "circle-color": ["get", "color"],
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff"
      }
    });

    await refreshAll(map);

    setInterval(async function () {
      await refreshAll(map);
    }, 10000);
  });
}

async function refreshAll(map) {
  await loadMetrics();
  await loadStatus();
  await loadShipsAnimated(map);
}

async function loadMetrics() {
  const res = await fetch("/metrics");
  const data = await res.json();

  document.getElementById("total_ships").innerText = data.total_ships;
  document.getElementById("tankers").innerText = data.tankers;
  document.getElementById("cargo").innerText = data.cargo;
  document.getElementById("anchored").innerText = data.anchored;
  document.getElementById("congestion").innerText = data.congestion;
}

async function loadStatus() {
  const res = await fetch("/ais-status");
  const data = await res.json();

  document.getElementById("ais_mode").innerText = data.mode;
  document.getElementById("ais_connected").innerText = data.connected ? "Yes" : "No";
  document.getElementById("ais_messages").innerText = data.message_count;
}

async function loadShipsAnimated(map) {
  const res = await fetch("/ships");
  const ships = await res.json();

  const next = {};

  ships.forEach(ship => {
    const id = String(ship.mmsi || ship.name);

    next[id] = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [ship.lng, ship.lat] },
      properties: {
        color: getColor(ship.type)
      }
    };
  });

  if (Object.keys(currentShipFeatures).length === 0) {
    currentShipFeatures = next;
    setData(map, currentShipFeatures);
    return;
  }

  previousShipFeatures = currentShipFeatures;
  currentShipFeatures = next;

  animate(map, previousShipFeatures, currentShipFeatures, 9000);
}

function animate(map, from, to, duration) {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  const start = performance.now();

  function step(now) {
    const p = Math.min((now - start) / duration, 1);

    const frame = {};

    Object.keys(to).forEach(id => {
      const a = from[id];
      const b = to[id];

      if (!a) {
        frame[id] = b;
        return;
      }

      const lng = a.geometry.coordinates[0] + (b.geometry.coordinates[0] - a.geometry.coordinates[0]) * p;
      const lat = a.geometry.coordinates[1] + (b.geometry.coordinates[1] - a.geometry.coordinates[1]) * p;

      frame[id] = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: b.properties
      };
    });

    setData(map, frame);

    if (p < 1) {
      animationFrameId = requestAnimationFrame(step);
    }
  }

  animationFrameId = requestAnimationFrame(step);
}

function setData(map, obj) {
  map.getSource("ships-source").setData({
    type: "FeatureCollection",
    features: Object.values(obj)
  });
}

function getColor(type) {
  if (type === "Tanker") return "#ff4d4d";
  if (type === "Cargo") return "#3aa0ff";
  if (type === "Tug") return "#ffd166";
  return "#9dff7a";
}

function emptyFeatureCollection() {
  return { type: "FeatureCollection", features: [] };
}

initApp();