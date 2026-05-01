async function initApp() {
  appLog("app.js loaded");

  const mapContainer = document.getElementById("map");

  if (!mapContainer) {
    appLog("ERROR: #map container not found");
    return;
  }

  appLog("Map container width: " + mapContainer.offsetWidth);
  appLog("Map container height: " + mapContainer.offsetHeight);

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

  let map;

  try {
    appLog("Creating Mapbox map");

    map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [103.82, 1.23],
      zoom: 10.2,
      pitch: 0,
      bearing: 0
    });

    appLog("Mapbox map object created");

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
          "circle-radius": 12,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.20,
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

  } catch (error) {
    appLog("ERROR: Mapbox map creation failed: " + error);
    mapContainer.innerHTML = "<div class='error-box'>Mapbox map creation failed.</div>";
    return;
  }
}

async function refreshAll(map) {
  await loadStatus();
  await loadMetrics();
  await loadShips(map);
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

    appLog("AIS status: " + data.mode + ", messages: " + data.message_count);
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

    appLog("/metrics loaded");
  } catch (error) {
    appLog("ERROR: Could not load /metrics: " + error);
  }
}

async function loadShips(map) {
  try {
    const res = await fetch("/ships");
    const ships = await res.json();

    appLog("/ships loaded. Count: " + ships.length);

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
            type: ship.type || "Unknown",
            speed: ship.speed || 0,
            heading: ship.heading || 0,
            last_seen: ship.last_seen || "-",
            source: ship.source || "AISStream",
            color: getShipColor(ship.type)
          }
        };
      })
    };

    const source = map.getSource("ships-source");
    if (source) {
      source.setData(geojson);
    }

  } catch (error) {
    appLog("ERROR: Could not load ships: " + error);
  }
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