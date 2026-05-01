let previousShipFeatures = {};
let currentShipFeatures = {};
let animationFrameId = null;

async function initApp() {
  appLog("app.js loaded");

  const mapContainer = document.getElementById("map");

  if (!mapContainer) {
    appLog("ERROR: #map container not found");
    return;
  }

  if (typeof mapboxgl === "undefined") {
    appLog("ERROR: Mapbox GL JS is not loaded");
    mapContainer.innerHTML = "<div class='error-box'>Mapbox library failed to load.</div>";
    return;
  }

  let config;

  try {
    appLog("Fetching /config");
    const configResponse = await fetch("/config");
    config = await configResponse.json();
    appLog("/config loaded");
  } catch (error) {
    appLog("ERROR: Could not fetch /config: " + error);
    return;
  }

  if (!config.mapbox_token) {
    appLog("ERROR: MAPBOX_TOKEN missing from Render environment");
    mapContainer.innerHTML =
      "<div class='error-box'>Mapbox token missing. Add MAPBOX_TOKEN in Render Environment Variables and redeploy.</div>";
    return;
  }

  appLog("Mapbox token received");

  mapboxgl.accessToken = config.mapbox_token;

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/satellite-streets-v12",
    center: [103.82, 1.23],
    zoom: 10.2,
    pitch: 0,
    bearing: 0
  });

  map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

  map.on("load", async function () {
    appLog("Mapbox map LOAD event fired");

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
        "circle-opacity": 0.22,
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
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.95
      }
    });

    map.on("click", "ships", function (event) {
      const feature = event.features[0];
      const props = feature.properties;
      const coords = feature.geometry.coordinates.slice();

      new mapboxgl.Popup()
        .setLngLat(coords)
        .setHTML(`
          <strong>${props.name}</strong><br>
          MMSI: ${props.mmsi}<br>
          Type: ${props.type}<br>
          Speed: ${props.speed} knots<br>
          Heading: ${props.heading}°<br>
          Source: ${props.source}<br>
          Last seen: ${props.last_seen}
        `)
        .addTo(map);
    });

    map.on("mouseenter", "ships", function () {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "ships", function () {
      map.getCanvas().style.cursor = "";
    });

    await refreshAll(map);

    setInterval(async function () {
      await refreshAll(map);
    }, 10000);
  });

  map.on("error", function (event) {
    appLog("MAPBOX ERROR: " + JSON.stringify(event.error || event));
  });
}

async function refreshAll(map) {
  await loadStatus();
  await loadMetrics();
  await loadShipsAnimated(map);
}

async function loadStatus() {
  try {
    const res = await fetch("/ais-status");
    const data = await res.json();

    document.getElementById("ais_mode").innerText = data.mode || "-";
    document.getElementById("ais_connected").innerText = data.connected ? "Yes" : "No";
    document.getElementById("ais_messages").innerText = data.message_count || 0;
    document.getElementById("ais_last_message").innerText = data.last_message_time || "-";
    document.getElementById("ais_error").innerText = data.error || "-";
  } catch (error) {
    appLog("ERROR: Could not load /ais-status: " + error);
  }
}

async function loadMetrics() {
  try {
    const res = await fetch("/metrics");
    const data = await res.json();

    document.getElementById("total_ships").innerText = data.total_ships;
    document.getElementById("tankers").innerText = data.tankers;
    document.getElementById("cargo").innerText = data.cargo;
    document.getElementById("anchored").innerText = data.anchored;
    document.getElementById("congestion").innerText = data.congestion;
  } catch (error) {
    appLog("ERROR: Could not load /metrics: " + error);
  }
}

async function loadShipsAnimated(map) {
  try {
    const res = await fetch("/ships");
    const ships = await res.json();

    appLog("/ships loaded. Count: " + ships.length);

    const nextFeatures = {};

    ships.forEach(function (ship) {
      const id = String(ship.mmsi || ship.name);

      nextFeatures[id] = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [ship.lng, ship.lat]
        },
        properties: {
          id: id,
          mmsi: ship.mmsi || "-",
          name: ship.name || "Unknown vessel",
          type: ship.type || "Unknown",
          speed: ship.speed || 0,
          heading: ship.heading || 0,
          last_seen: ship.last_seen || "-",
          source: ship.source || "AISStream",
          color: getShipColor(ship.type)
        }
      };
    });

    if (Object.keys(currentShipFeatures).length === 0) {
      currentShipFeatures = nextFeatures;
      setMapSourceData(map, objectToFeatureCollection(currentShipFeatures));
      appLog("Initial ship layer rendered");
      return;
    }

    previousShipFeatures = currentShipFeatures;
    currentShipFeatures = nextFeatures;

    animateShipTransition(map, previousShipFeatures, currentShipFeatures, 9000);

  } catch (error) {
    appLog("ERROR: Could not load ships: " + error);
  }
}

function animateShipTransition(map, fromFeatures, toFeatures, durationMs) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const easedProgress = easeInOutCubic(progress);

    const animatedFeatures = {};

    Object.keys(toFeatures).forEach(function (id) {
      const toFeature = toFeatures[id];
      const fromFeature = fromFeatures[id];

      if (!fromFeature) {
        animatedFeatures[id] = toFeature;
        return;
      }

      const fromCoords = fromFeature.geometry.coordinates;
      const toCoords = toFeature.geometry.coordinates;

      const lng = interpolate(fromCoords[0], toCoords[0], easedProgress);
      const lat = interpolate(fromCoords[1], toCoords[1], easedProgress);

      animatedFeatures[id] = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lng, lat]
        },
        properties: toFeature.properties
      };
    });

    setMapSourceData(map, objectToFeatureCollection(animatedFeatures));

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      setMapSourceData(map, objectToFeatureCollection(toFeatures));
      appLog("Ship animation completed");
    }
  }

  animationFrameId = requestAnimationFrame(step);
}

function setMapSourceData(map, geojson) {
  const source = map.getSource("ships-source");

  if (source) {
    source.setData(geojson);
  }
}

function objectToFeatureCollection(featureObject) {
  return {
    type: "FeatureCollection",
    features: Object.values(featureObject)
  };
}

function interpolate(start, end, progress) {
  return start + (end - start) * progress;
}

function easeInOutCubic(x) {
  return x < 0.5
    ? 4 * x * x * x
    : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function getShipColor(type) {
  if (type === "Tanker") return "#ff4d4d";
  if (type === "Cargo") return "#3aa0ff";
  if (type === "Tug") return "#ffd166";
  return "#9dff7a";
}

function emptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: []
  };
}

initApp();