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
    mapContainer.innerHTML = "<div class='error-box'>Could not fetch /config.</div>";
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
      style: "mapbox://styles/mapbox/dark-v11",
      center: [103.82, 1.25],
      zoom: 9.5
    });

    appLog("Mapbox map object created");

    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    map.on("load", async function () {
      appLog("Mapbox map LOAD event fired");
      await loadShips(map);
    });

    map.on("error", function (event) {
      appLog("MAPBOX ERROR: " + JSON.stringify(event.error || event));
    });

  } catch (error) {
    appLog("ERROR: Mapbox map creation failed: " + error);
    mapContainer.innerHTML = "<div class='error-box'>Mapbox map creation failed.</div>";
    return;
  }

  await loadMetrics();
}

async function loadMetrics() {
  try {
    appLog("Fetching /metrics");

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
    appLog("Fetching /ships");

    const res = await fetch("/ships");
    const ships = await res.json();

    appLog("/ships loaded. Count: " + ships.length);

    ships.forEach((ship) => {
      const color =
        ship.type === "Tanker" ? "#ff4d4d" :
        ship.type === "Cargo" ? "#3aa0ff" :
        ship.type === "Tug" ? "#ffd166" :
        "#9dff7a";

      const el = document.createElement("div");
      el.className = "ship-marker";
      el.style.background = color;
      el.style.boxShadow = `0 0 10px ${color}`;

      new mapboxgl.Marker(el)
        .setLngLat([ship.lng, ship.lat])
        .setPopup(
          new mapboxgl.Popup().setHTML(`
            <strong>${ship.name}</strong><br>
            Type: ${ship.type}<br>
            Speed: ${ship.speed} knots
          `)
        )
        .addTo(map);
    });

    appLog("Ship markers added");
  } catch (error) {
    appLog("ERROR: Could not load ships: " + error);
  }
}

initApp();