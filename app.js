let previousFeatures = {};
let currentFeatures = {};
let trailHistory = {};
let animationFrameId = null;

const SEA_ROUTES = [
  {
    id: "india",
    name: "India / Colombo Corridor",
    color: "#ff3b30",
    coordinates: [
      [103.82, 1.23],
      [103.45, 1.15],
      [102.20, 2.00],
      [100.40, 4.60],
      [97.50, 7.50],
      [92.50, 8.50],
      [85.00, 10.50],
      [80.30, 13.00]
    ]
  },
  {
    id: "malaysia",
    name: "Malaysia / Port Klang Corridor",
    color: "#ff9500",
    coordinates: [
      [103.82, 1.23],
      [103.30, 1.35],
      [102.40, 2.20],
      [101.60, 3.00],
      [101.30, 3.05]
    ]
  },
  {
    id: "thailand",
    name: "Thailand / Laem Chabang Corridor",
    color: "#ffd60a",
    coordinates: [
      [103.82, 1.23],
      [104.80, 2.20],
      [105.60, 5.00],
      [102.80, 8.00],
      [101.10, 12.70],
      [100.90, 13.10]
    ]
  },
  {
    id: "vietnam",
    name: "Vietnam / Cai Mep Corridor",
    color: "#32d74b",
    coordinates: [
      [103.82, 1.23],
      [104.90, 2.00],
      [106.00, 4.00],
      [107.20, 6.80],
      [107.00, 10.50]
    ]
  },
  {
    id: "indonesia",
    name: "Indonesia / Jakarta Corridor",
    color: "#64d2ff",
    coordinates: [
      [103.82, 1.23],
      [104.50, 0.60],
      [105.80, -1.50],
      [106.80, -4.00],
      [106.85, -6.10]
    ]
  },
  {
    id: "philippines",
    name: "Philippines / Manila Corridor",
    color: "#bf5af2",
    coordinates: [
      [103.82, 1.23],
      [105.20, 3.20],
      [108.00, 7.00],
      [112.00, 11.00],
      [117.50, 13.00],
      [120.90, 14.60]
    ]
  }
];

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
    addSeaRouteLayers(map);

    map.addSource("ships-source", {
      type: "geojson",
      data: emptyFeatureCollection()
    });

    map.addSource("trails-source", {
      type: "geojson",
      data: emptyFeatureCollection()
    });

    map.addSource("projection-source", {
      type: "geojson",
      data: emptyFeatureCollection()
    });

    map.addLayer({
      id: "ship-trails",
      type: "line",
      source: "trails-source",
      paint: {
        "line-color": ["get", "color"],
        "line-width": 2,
        "line-opacity": 0.55
      }
    });

    map.addLayer({
      id: "ship-projections",
      type: "line",
      source: "projection-source",
      paint: {
        "line-color": ["get", "color"],
        "line-width": 2,
        "line-opacity": 0.75,
        "line-dasharray": [2, 2]
      }
    });

    map.addLayer({
      id: "ships-glow",
      type: "circle",
      source: "ships-source",
      paint: {
        "circle-radius": 18,
        "circle-color": ["get", "color"],
        "circle-opacity": 0.16,
        "circle-blur": 0.85
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
          8, 14,
          11, 22,
          14, 30
        ],
        "text-rotate": ["get", "heading"],
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        "text-color": ["get", "color"],
        "text-halo-color": "#000000",
        "text-halo-width": 1.8,
        "text-opacity": 0.98
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
          8, 9,
          11, 14,
          14, 19
        ],
        "text-offset": [0, 1],
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        "text-color": ["get", "color"],
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.1,
        "text-opacity": 0.95
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

    map.on("click", "sea-route-lines", function (event) {
      const props = event.features[0].properties;
      const coords = event.lngLat;

      new mapboxgl.Popup()
        .setLngLat(coords)
        .setHTML(`
          <strong>${props.name}</strong><br>
          Route type: SEA shipping corridor<br>
          Note: illustrative macro-route overlay
        `)
        .addTo(map);
    });

    await refreshAll(map);

    setInterval(async function () {
      await refreshAll(map);
    }, 10000);
  });
}

function addSeaRouteLayers(map) {
  const routeFeatures = SEA_ROUTES.map(function (route) {
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: route.coordinates
      },
      properties: {
        id: route.id,
        name: route.name,
        color: route.color
      }
    };
  });

  const routeArrowFeatures = [];

  SEA_ROUTES.forEach(function (route) {
    for (let i = 1; i < route.coordinates.length; i++) {
      const from = route.coordinates[i - 1];
      const to = route.coordinates[i];

      routeArrowFeatures.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: midpoint(from, to)
        },
        properties: {
          id: route.id,
          name: route.name,
          color: route.color,
          bearing: bearingBetween(from, to)
        }
      });
    }
  });

  const routeLabelFeatures = SEA_ROUTES.map(function (route) {
    const middleIndex = Math.floor(route.coordinates.length / 2);

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: route.coordinates[middleIndex]
      },
      properties: {
        id: route.id,
        name: route.name,
        color: route.color
      }
    };
  });

  map.addSource("sea-routes-source", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: routeFeatures
    }
  });

  map.addSource("sea-route-arrows-source", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: routeArrowFeatures
    }
  });

  map.addSource("sea-route-labels-source", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: routeLabelFeatures
    }
  });

  map.addLayer({
    id: "sea-route-glow",
    type: "line",
    source: "sea-routes-source",
    paint: {
      "line-color": ["get", "color"],
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5, 5,
        10, 10,
        13, 14
      ],
      "line-opacity": 0.18,
      "line-blur": 4
    }
  });

  map.addLayer({
    id: "sea-route-lines",
    type: "line",
    source: "sea-routes-source",
    paint: {
      "line-color": ["get", "color"],
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5, 1.5,
        10, 3,
        13, 5
      ],
      "line-opacity": 0.72
    }
  });

  map.addLayer({
    id: "sea-route-arrows",
    type: "symbol",
    source: "sea-route-arrows-source",
    layout: {
      "text-field": "➤",
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5, 12,
        10, 18,
        13, 24
      ],
      "text-rotate": ["get", "bearing"],
      "text-allow-overlap": true,
      "text-ignore-placement": true
    },
    paint: {
      "text-color": ["get", "color"],
      "text-halo-color": "#000000",
      "text-halo-width": 1.6,
      "text-opacity": 0.85
    }
  });

  map.addLayer({
    id: "sea-route-labels",
    type: "symbol",
    source: "sea-route-labels-source",
    minzoom: 6,
    layout: {
      "text-field": ["get", "name"],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        6, 10,
        10, 12,
        13, 15
      ],
      "text-anchor": "top",
      "text-offset": [0, 1],
      "text-allow-overlap": false
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 1.5,
      "text-opacity": 0.95
    }
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
    const heading = normalizeHeading(ship.heading || 0);
    const category = ship.category || "Other / Unknown";

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
        category: category,
        ship_type_code: ship.ship_type_code || "",
        speed: ship.speed || 0,
        heading: heading,
        last_seen: ship.last_seen || "-",
        source: ship.source || "AISStream",
        color: getColor(category),
        shape: getShape(category)
      }
    };

    updateTrailHistory(id, ship.lng, ship.lat, getColor(category));
  });

  if (Object.keys(currentFeatures).length === 0) {
    currentFeatures = nextFeatures;
    setShipSourceData(map, currentFeatures);
    setTrailSourceData(map);
    setProjectionSourceData(map, currentFeatures);
    return;
  }

  previousFeatures = currentFeatures;
  currentFeatures = nextFeatures;

  animateTransition(map, previousFeatures, currentFeatures, 9000);

  setTrailSourceData(map);
  setProjectionSourceData(map, currentFeatures);
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

    setShipSourceData(map, frameFeatures);

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      setShipSourceData(map, toFeatures);
    }
  }

  animationFrameId = requestAnimationFrame(step);
}

function updateTrailHistory(id, lng, lat, color) {
  if (!trailHistory[id]) {
    trailHistory[id] = {
      color: color,
      coordinates: []
    };
  }

  const coords = trailHistory[id].coordinates;
  const last = coords[coords.length - 1];

  if (!last || last[0] !== lng || last[1] !== lat) {
    coords.push([lng, lat]);
  }

  if (coords.length > 8) {
    coords.shift();
  }

  trailHistory[id].color = color;
}

function setTrailSourceData(map) {
  const features = [];

  Object.keys(trailHistory).forEach(function (id) {
    const trail = trailHistory[id];

    if (trail.coordinates.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: trail.coordinates
        },
        properties: {
          id: id,
          color: trail.color
        }
      });
    }
  });

  const source = map.getSource("trails-source");
  if (source) {
    source.setData({
      type: "FeatureCollection",
      features: features
    });
  }
}

function setProjectionSourceData(map, featureObject) {
  const features = [];

  Object.keys(featureObject).forEach(function (id) {
    const feature = featureObject[id];
    const coords = feature.geometry.coordinates;
    const props = feature.properties;

    const speed = Number(props.speed || 0);

    if (speed < 1) {
      return;
    }

    const projected = projectPoint(coords[0], coords[1], props.heading, speed);

    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          coords,
          projected
        ]
      },
      properties: {
        id: id,
        color: props.color
      }
    });
  });

  const source = map.getSource("projection-source");
  if (source) {
    source.setData({
      type: "FeatureCollection",
      features: features
    });
  }
}

function projectPoint(lng, lat, heading, speed) {
  const headingRadians = heading * Math.PI / 180;
  const distanceFactor = Math.min(Math.max(speed, 1), 18) * 0.0012;

  const deltaLat = Math.cos(headingRadians) * distanceFactor;
  const deltaLng = Math.sin(headingRadians) * distanceFactor;

  return [
    lng + deltaLng,
    lat + deltaLat
  ];
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

function setShipSourceData(map, featureObject) {
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

function midpoint(from, to) {
  return [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2
  ];
}

function bearingBetween(from, to) {
  const lng1 = from[0] * Math.PI / 180;
  const lat1 = from[1] * Math.PI / 180;
  const lng2 = to[0] * Math.PI / 180;
  const lat2 = to[1] * Math.PI / 180;

  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);

  const bearing = Math.atan2(y, x) * 180 / Math.PI;

  return (bearing + 360) % 360;
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