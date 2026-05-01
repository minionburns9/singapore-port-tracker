from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import random

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "running"}

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
    for i in range(50):
        data.append({
            "name": f"Vessel-{i}",
            "lat": random.uniform(1.1,1.35),
            "lng": random.uniform(103.5,104.1)
        })
    return data