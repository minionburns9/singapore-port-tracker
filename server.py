from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import asyncio
import json
import os
import random
import time
import websockets

app = FastAPI(title="Singapore Port Tracker - AISStream Live")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

VESSEL_CACHE = {}
AIS_STATUS = {
    "connected": False,
    "last_message_time": None,
    "message_count": 0,
    "error": None,
    "mode": "waiting"
}

SINGAPORE_BBOX = [[1.10, 103.50], [1.35, 104.15]]


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(aisstream_worker())


@app.get("/")
def serve_index():
    return FileResponse("index.html", media_type="text/html")


@app.get("/app.js")
def serve_js():
    return FileResponse("app.js", media_type="application/javascript")


@app.get("/health")
def health_check():
    return {
        "status": "running",
        "message": "Singapore Port Tracker API is live"
    }


@app.get("/config")
def get_config():
    return JSONResponse({
        "mapbox_token": os.getenv("MAPBOX_TOKEN")
    })


@app.get("/ais-status")
def get_ais_status():
    return AIS_STATUS


@app.get("/metrics")
def metrics():
    vessels = list(VESSEL_CACHE.values())

    if not vessels:
        return {
            "total_ships": 0,
            "tankers": 0,
            "cargo": 0,
            "anchored": 0,
            "congestion": "Waiting for AIS data"
        }

    total = len(vessels)
    tankers = len([v for v in vessels if v.get("type") == "Tanker"])
    cargo = len([v for v in vessels if v.get("type") == "Cargo"])
    anchored = len([v for v in vessels if v.get("speed", 0) < 1])

    congestion = "Low"
    if total > 40:
        congestion = "Medium"
    if total > 80:
        congestion = "High"

    return {
        "total_ships": total,
        "tankers": tankers,
        "cargo": cargo,
        "anchored": anchored,
        "congestion": congestion
    }


@app.get("/ships")
def ships():
    now = time.time()

    # Keep only vessels seen in last 20 minutes
    live_vessels = []
    expired_keys = []

    for mmsi, vessel in VESSEL_CACHE.items():
        if now - vessel.get("last_seen_epoch", 0) <= 1200:
            live_vessels.append(vessel)
        else:
            expired_keys.append(mmsi)

    for key in expired_keys:
        VESSEL_CACHE.pop(key, None)

    return live_vessels


async def aisstream_worker():
    api_key = os.getenv("AISSTREAM_API_KEY")

    if not api_key:
        AIS_STATUS["mode"] = "missing_api_key"
        AIS_STATUS["error"] = "AISSTREAM_API_KEY missing in Render environment variables"
        return

    while True:
        try:
            AIS_STATUS["mode"] = "connecting"
            AIS_STATUS["error"] = None

            async with websockets.connect("wss://stream.aisstream.io/v0/stream") as websocket:
                AIS_STATUS["connected"] = True
                AIS_STATUS["mode"] = "connected"

                subscription_message = {
                    "APIKey": api_key,
                    "BoundingBoxes": [SINGAPORE_BBOX],
                    "FilterMessageTypes": ["PositionReport"]
                }

                await websocket.send(json.dumps(subscription_message))

                while True:
                    raw_message = await websocket.recv()
                    AIS_STATUS["message_count"] += 1
                    AIS_STATUS["last_message_time"] = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())

                    try:
                        message = json.loads(raw_message)
                        process_ais_message(message)
                    except Exception as parse_error:
                        AIS_STATUS["error"] = f"Parse error: {str(parse_error)}"

        except Exception as connection_error:
            AIS_STATUS["connected"] = False
            AIS_STATUS["mode"] = "reconnecting"
            AIS_STATUS["error"] = str(connection_error)
            await asyncio.sleep(10)


def process_ais_message(message):
    if message.get("MessageType") != "PositionReport":
        return

    metadata = message.get("MetaData", {})
    position = message.get("Message", {}).get("PositionReport", {})

    lat = metadata.get("latitude")
    lng = metadata.get("longitude")

    if lat is None or lng is None:
        return

    if not (1.10 <= lat <= 1.35 and 103.50 <= lng <= 104.15):
        return

    mmsi = str(metadata.get("MMSI") or metadata.get("MMSI_String") or position.get("UserID") or random.randint(100000000, 999999999))

    ship_name = metadata.get("ShipName")
    if not ship_name:
        ship_name = f"MMSI {mmsi}"
    ship_name = ship_name.strip()

    speed = position.get("Sog")
    if speed is None:
        speed = 0

    heading = position.get("TrueHeading")
    if heading is None:
        heading = position.get("Cog", 0)

    vessel_type = infer_vessel_type(ship_name)

    VESSEL_CACHE[mmsi] = {
        "mmsi": mmsi,
        "name": ship_name,
        "lat": round(float(lat), 6),
        "lng": round(float(lng), 6),
        "speed": round(float(speed), 1),
        "heading": round(float(heading), 1),
        "type": vessel_type,
        "last_seen": AIS_STATUS["last_message_time"],
        "last_seen_epoch": time.time(),
        "source": "AISStream"
    }


def infer_vessel_type(ship_name):
    name = ship_name.upper()

    if "TANKER" in name or "OIL" in name or "LNG" in name or "LPG" in name:
        return "Tanker"

    if "CARGO" in name or "CONTAINER" in name or "MAERSK" in name or "MSC" in name or "EVER" in name:
        return "Cargo"

    if "TUG" in name or "TOW" in name:
        return "Tug"

    return "Passenger"