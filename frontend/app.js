mapboxgl.accessToken = "PASTE_YOUR_MAPBOX_PUBLIC_TOKEN_HERE";

const API_BASE = "https://YOUR_RENDER_URL_HERE.onrender.com";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [103.82, 1.25],
  zoom: 9.5
});

map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

async function loadMetrics() {
  const response = await fetch(`${API_BASE}/metrics`);
  const data = await response.json();

  document.getElementById("total_ships").innerText = data.total_ships;
  document.getElementById("tankers").innerText = data.tankers;
  document.getElementById("cargo").innerText = data.cargo;
  document.getElementById("anchored").innerText = data.anchored;
  document.getElementById("congestion").innerText = data.congestion;
}

async function loadShips() {
  const response = await fetch(`${API_BASE}/ships`);
  const ships = await response.json();

  ships.forEach(ship => {
    const color =
      ship.type === "Tanker" ? "#ff4d4d" :
      ship.type === "Cargo" ? "#3aa0ff" :
      ship.type === "Tug" ? "#ffd166" :
      "#9dff7a";

    const markerElement = document.createElement("div");
    markerElement.style.width = "12px";
    markerElement.style.height = "12px";
    markerElement.style.borderRadius = "50%";
    markerElement.style.background = color;
    markerElement.style.border = "1px solid white";
    markerElement.style.boxShadow = "0 0 10px " + color;

    new mapboxgl.Marker(markerElement)
      .setLngLat([ship.lng, ship.lat])
      .setPopup(
        new mapboxgl.Popup().setHTML(`
          <b>${ship.name}</b><br>
          Type: ${ship.type}<br>
          Speed: ${ship.speed} knots
        `)
      )
      .addTo(map);
  });
}

loadMetrics();
loadShips();