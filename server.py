from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import random
import os

app = FastAPI(title="Singapore Port Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def serve_index():
    return FileResponse("index.html")


@app.get("/style.css")
def serve_css():
    return FileResponse("style.css")


@app.get("/app.js")
def serve_js():
    return FileResponse("app.js")


@app.get("/config")
def get_config():
    return {
        "mapbox_token": os.getenv("MAPBOX_TOKEN")
    }


@app.get("/health")
def health_check():
    return {
        "status": "running",
        "message": "Singapore Port Tracker API is live"
    }


@app.get("/metrics")
def metrics():
    return {
        "total_ships": random.randint(780, 920),
        "tankers": random.randint(80, 140),
        "cargo": random.randint(300, 480),
        "anchored": random.randint(120, 240),
        "congestion": random.choice(["Low", "Medium", "High"])
    }


@app.get("/ships")
def ships():
    data = []

    for i in range(60):
        data.append({
            "name": f"Vessel-{i + 1}",
            "lat": round(random.uniform(1.10, 1.35), 6),
            "lng": round(random.uniform(103.50, 104.10), 6),
            "speed": round(random.uniform(0, 18), 1),
            "type": random.choice(["Cargo", "Tanker", "Passenger", "Tug"])
        })

    return data