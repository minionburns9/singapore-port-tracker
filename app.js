async function initApp() {
  const configResponse = await fetch("/config");
  const config = await configResponse.json();

  if (!config.mapbox_token) {
    document.getElementById("map").innerHTML =
      "<div class='error-box'>Mapbox token missing. Add MAPBOX_TOKEN in Render Environment Variables and redeploy.</div>";
    return;
  }

  mapboxgl.accessToken = config.mapbox_token;

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/dark-v11",
    center: [103.82, 1.25],
    zoom: 9.5
  });

  map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

  async function loadMetrics() {
    const res = await fetch("/metrics");
    const data = await res.json();

    document.getElementById("total_ships").innerText = data.total_ships;
    document.getElementById("tankers").innerText = data.tankers;
    document.getElementById("cargo").innerText = data.cargo;
    document.getElementById("anchored").innerText = data.anchored;
    document.getElementById("congestion").innerText = data.congestion;
  }

  async function loadShips() {
    const res = await fetch("/ships");
    const ships = await res.json();

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
  }

  await loadMetrics();

  map.on("load", async () => {
    await loadShips();
  });
}

initApp();