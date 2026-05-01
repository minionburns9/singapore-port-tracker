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
        "circle-opacity": 0.20,
        "circle-blur": 0.9
      }
    });

    map.addLayer({
      id: "ships-symbols",
      type: "symbol",
      source: "ships-source",
      layout: {
        "text-field": ["get", "shape"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8, 12,
          11, 18,
          14, 24
        ],
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        "text-color": ["get", "color"],
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.2,
        "text-opacity": 0.98
      }
    });

    map.on("click", "ships-symbols", function (event) {
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
    });

    map.on("mouseenter", "ships-symbols", function () {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "ships-symbols", function () {
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
  await loadShips(map);
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

async function loadShips(map) {
  const res = await fetch("/ships");
  const ships = await res.json();

  const geojson = {
    type: "FeatureCollection",
    features: ships.map(function (ship) {
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [ship.lng, ship.lat]
        },
        properties: {
          mmsi: ship.mmsi || "-",
          name: ship.name || "Unknown vessel",
          category: ship.category || "Other / Unknown",
          ship_type_code: ship.ship_type_code || "",
          speed: ship.speed || 0,
          heading: ship.heading || 0,
          last_seen: ship.last_seen || "-",
          source: ship.source || "AISStream",
          color: getColor(ship.category),
          shape: getShape(ship.category)
        }
      };
    })
  };

  const source = map.getSource("ships-source");
  if (source) {
    source.setData(geojson);
  }
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