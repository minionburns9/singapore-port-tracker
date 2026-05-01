async function initMap() {

  const configRes = await fetch("/config");
  const config = await configRes.json();

  mapboxgl.accessToken = config.mapbox_token;

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/dark-v11",
    center: [103.82, 1.25],
    zoom: 9.5
  });

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

    ships.forEach(ship => {
      const el = document.createElement("div");
      el.style.width = "10px";
      el.style.height = "10px";
      el.style.background = "red";
      el.style.borderRadius = "50%";

      new mapboxgl.Marker(el)
        .setLngLat([ship.lng, ship.lat])
        .addTo(map);
    });
  }

  loadMetrics();
  loadShips();
}

initMap();

const API_BASE = "https://singapore-port-tracker.onrender.com";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [103.82, 1.25],
  zoom: 9.5
});

async function loadMetrics() {
  const res = await fetch(API_BASE + "/metrics");
  const data = await res.json();

  document.getElementById("total_ships").innerText = data.total_ships;
  document.getElementById("tankers").innerText = data.tankers;
  document.getElementById("cargo").innerText = data.cargo;
  document.getElementById("anchored").innerText = data.anchored;
  document.getElementById("congestion").innerText = data.congestion;
}

async function loadShips() {
  const res = await fetch(API_BASE + "/ships");
  const ships = await res.json();

  ships.forEach(ship => {
    const el = document.createElement("div");
    el.style.width = "10px";
    el.style.height = "10px";
    el.style.background = "red";
    el.style.borderRadius = "50%";

    new mapboxgl.Marker(el)
      .setLngLat([ship.lng, ship.lat])
      .addTo(map);
  });
}

loadMetrics();
loadShips();