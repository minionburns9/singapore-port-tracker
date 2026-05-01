let previousFeatures = {};
let currentFeatures = {};
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
        "circle-radius": 16,
        "circle-color": ["get", "color"],
        "circle-opacity": 0.16,
        "circle-blur": 0.8
      }
    });

    map.addLayer({
      id: "ship-direction-arrows",
      type: "symbol",
      source: "ships-source",
      layout: {
        "text-field": "➤",
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8, 12,
          11, 18,
          14, 24
        ],
        "text-rotate": ["get", "heading"],
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        "text-color": ["get", "color"],
        "text-halo-color": "#000000",
        "text-halo-width": 1.5,
        "text-opacity": 0.95
      }
    });

    map.addLayer({
      id: "ship-category-symbols",
      type: "symbol",
      source: "ships-source",
      layout: {
        "text-field": ["get", "shape"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8, 10,
          11, 15,
          14, 20
        ],
        "text-offset": [0, 0.85],
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        "text-color": ["get", "color"],
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.1,
        "text-opacity": 0.98
      }
    });

    map.on("click", "ship-direction-arrows", function (event) {
      showShipPopup(map, event);
    });

    map.on("click", "ship-category-symbols", function (event) {
      showShipPopup(map, event);
    });

    map.on("mouseenter", "ship-direction-arrows", function () {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "ship-direction-arrows", function () {
      map.getCanvas().style.cursor = "";
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
  document.getElementById("tug_service").innerText = data.tug_service;
  document.getElementById("passenger").innerText = data.passenger;
  document.getElementById("other_unknown").innerText = data.other_unknown;
  document.getElementById("anchored").innerText = data.anchored;
  document.getElementById("congestion").innerText = data.congestion;
}

async function loadStatus() {
  const res = await fetch("/ais-status");
  const data = await res.json();

  document.getElementById("ais_mode").innerText = data.mode || "-";
  document.getElementById("ais_connected").innerText = data.connected ? "Yes" : "No";
  document.getElementById("ais_messages").innerText = data.message_count || 0;
  document.getElementById("ais_position_messages").innerText = data.position_messages || 0;
  document.getElementById("ais_static_messages").innerText = data.static_messages || 0;
}

async function loadShipsAnimated(map) {
  const res = await fetch("/ships");
  const ships = await res.json();

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
        category: ship.category || "Other / Unknown",
        ship_type_code: ship.ship_type_code || "",
        speed: ship.speed || 0,
        heading: normalizeHeading(ship.heading || 0),
        last_seen: ship.last_seen || "-",
        source: ship.source || "AISStream",
        color: getColor(ship.category),
        shape: getShape(ship.category)
      }
    };
  });

  if (Object.keys(currentFeatures).length === 0) {
    currentFeatures = nextFeatures;
    setSourceData(map, currentFeatures);
    return;
  }

  previousFeatures = currentFeatures;
  currentFeatures = nextFeatures;

  animateTransition(map, previousFeatures, currentFeatures, 9000);
}

function animateTransition(map, fromFeatures, toFeatures, durationMs) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const eased = easeInOutCubic(progress);

    const frameFeatures = {};

    Object.keys(toFeatures).forEach(function (id) {
      const toFeature = toFeatures[id];
      const fromFeature = fromFeatures[id];

      if (!fromFeature) {
        frameFeatures[id] = toFeature;
        return;
      }

      const fromCoords = fromFeature.geometry.coordinates;
      const toCoords = toFeature.geometry.coordinates;

      const lng = interpolate(fromCoords[0], toCoords[0], eased);
      const lat = interpolate(fromCoords[1], toCoords[1], eased);

      frameFeatures[id] = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lng, lat]
        },
        properties: toFeature.properties
      };
    });

    setSourceData(map, frameFeatures);

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      setSourceData(map, toFeatures);
    }
  }

  animationFrameId = requestAnimationFrame(step);
}

function showShipPopup(map, event) {
  const feature = event.features[0];
  const props = feature.properties;
  const coords = feature.geometry.coordinates.slice();

  new mapboxgl.Popup()
    .setLngLat(coords)
    .setHTML(`
      <strong>${props.name}</strong><br>
      MMSI: ${props.mmsi}<br>
      Category: ${props.category}<br>
      AIS Type Code: ${props.ship_type_code || "unknown"}<br>
      Speed: ${props.speed} knots<br>
      Heading: ${props.heading}°<br>
      Source: ${props.source}<br>
      Last seen: ${props.last_seen}
    `)
    .addTo(map);
}

function setSourceData(map, featureObject) {
  const source = map.getSource("ships-source");

  if (!source) {
    return;
  }

  source.setData({
    type: "FeatureCollection",
    features: Object.values(featureObject)
  });
}

function interpolate(start, end, progress) {
  return start + (end - start) * progress;
}

function easeInOutCubic(x) {
  return x < 0.5
    ? 4 * x * x * x
    : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function normalizeHeading(heading) {
  const value = Number(heading);

  if (Number.isNaN(value)) {
    return 0;
  }

  return value % 360;
}

function getColor(category) {
  if (category === "Tanker") return "#ff4d4d";
  if (category === "Cargo") return "#3aa0ff";
  if (category === "Tug / Service") return "#ffd166";
  if (category === "Passenger") return "#b86cff";
  return "#9dff7a";
}

function getShape(category) {
  if (category === "Tanker") return "▲";
  if (category === "Cargo") return "■";
  if (category === "Tug / Service") return "★";
  if (category === "Passenger") return "◆";
  return "●";
}

function emptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: []
  };
}

initApp();