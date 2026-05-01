from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import random

app = FastAPI(title="Singapore Port Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {
        "status": "running",
        "message": "Singapore Port Tracker API is live"
    }

@app.get("/metrics")
def get_metrics():
    return {
        "total_ships": random.randint(780, 920),
        "tankers": random.randint(80, 140),
        "cargo": random.randint(300, 480),
        "anchored": random.randint(120, 240),
        "congestion": random.choice(["Low", "Medium", "High"])
    }

@app.get("/ships")
def get_ships():
    ships = []

    for i in range(60):
        ships.append({
            "name": f"Vessel-{i+1}",
            "lat": round(random.uniform(1.12, 1.34), 6),
            "lng": round(random.uniform(103.55, 104.12), 6),
            "speed": round(random.uniform(0, 18), 1),
            "type": random.choice(["Cargo", "Tanker", "Passenger", "Tug"])
        })

    return ships