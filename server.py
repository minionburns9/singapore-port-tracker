from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import asyncio
import json
import os
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
STATIC_CACHE = {}

AIS_STATUS = {
    "connected": False,
    "last_message_time": None,
    "message_count": 0,
    "position_messages": 0,
    "static_messages": 0,
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
    vessels = list_live_vessels()

    total = len(vessels)
    tankers = len([v for v in vessels if v.get("category") == "Tanker"])
    cargo = len([v for v in vessels if v.get("category") == "Cargo"])
    tug = len([v for v in vessels if v.get("category") == "Tug / Service"])
    passenger = len([v for v in vessels if v.get("category") == "Passenger"])
    other = len([v for v in vessels if v.get("category") == "Other / Unknown"])
    anchored = len([v for v in vessels if v.get("speed", 0) < 1])

    congestion = "Low"
    if total > 80:
        congestion = "Medium"
    if total > 150:
        congestion = "High"

    return {
        "total_ships": total,
        "tankers": tankers,
        "cargo": cargo,
        "tug_service": tug,
        "passenger": passenger,
        "other_unknown": other,
        "anchored": anchored,
        "congestion": congestion
    }


@app.get("/ships")
def ships():
    return list_live_vessels()


def list_live_vessels():
    now = time.time()
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
                    "FilterMessageTypes": [
                        "PositionReport",
                        "ShipStaticData"
                    ]
                }

                await websocket.send(json.dumps(subscription_message))

                while True:
                    raw_message = await websocket.recv()

                    AIS_STATUS["message_count"] += 1
                    AIS_STATUS["last_message_time"] = time.strftime(
                        "%Y-%m-%d %H:%M:%S UTC",
                        time.gmtime()
                    )

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
    message_type = message.get("MessageType")

    if message_type == "ShipStaticData":
        AIS_STATUS["static_messages"] += 1
        process_static_message(message)
        return

    if message_type == "PositionReport":
        AIS_STATUS["position_messages"] += 1
        process_position_message(message)
        return


def process_static_message(message):
    metadata = message.get("MetaData", {})
    static_data = message.get("Message", {}).get("ShipStaticData", {})

    mmsi = get_mmsi(metadata, static_data)
    if not mmsi:
        return

    ship_name = (
        metadata.get("ShipName")
        or static_data.get("Name")
        or static_data.get("ShipName")
        or f"MMSI {mmsi}"
    )

    ship_type_code = (
        static_data.get("Type")
        or static_data.get("ShipType")
        or static_data.get("TypeAndCargo")
    )

    category = map_ais_ship_type(ship_type_code, ship_name)

    STATIC_CACHE[mmsi] = {
        "mmsi": mmsi,
        "name": clean_text(ship_name),
        "ship_type_code": ship_type_code,
        "category": category,
        "last_static_seen": AIS_STATUS["last_message_time"]
    }

    if mmsi in VESSEL_CACHE:
        VESSEL_CACHE[mmsi]["name"] = STATIC_CACHE[mmsi]["name"]
        VESSEL_CACHE[mmsi]["ship_type_code"] = ship_type_code
        VESSEL_CACHE[mmsi]["category"] = category


def process_position_message(message):
    metadata = message.get("MetaData", {})
    position = message.get("Message", {}).get("PositionReport", {})

    lat = metadata.get("latitude") or position.get("Latitude")
    lng = metadata.get("longitude") or position.get("Longitude")

    if lat is None or lng is None:
        return

    lat = float(lat)
    lng = float(lng)

    if not (1.10 <= lat <= 1.35 and 103.50 <= lng <= 104.15):
        return

    mmsi = get_mmsi(metadata, position)
    if not mmsi:
        return

    static = STATIC_CACHE.get(mmsi, {})

    ship_name = (
        static.get("name")
        or metadata.get("ShipName")
        or f"MMSI {mmsi}"
    )

    speed = position.get("Sog")
    if speed is None:
        speed = position.get("SpeedOverGround", 0)

    heading = position.get("TrueHeading")
    if heading is None or heading == 511:
        heading = position.get("Cog", 0)

    category = static.get("category") or map_ais_ship_type(None, ship_name)
    ship_type_code = static.get("ship_type_code")

    VESSEL_CACHE[mmsi] = {
        "mmsi": mmsi,
        "name": clean_text(ship_name),
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "speed": round(float(speed or 0), 1),
        "heading": round(float(heading or 0), 1),
        "ship_type_code": ship_type_code,
        "category": category,
        "last_seen": AIS_STATUS["last_message_time"],
        "last_seen_epoch": time.time(),
        "source": "AISStream"
    }


def get_mmsi(metadata, payload):
    value = (
        metadata.get("MMSI")
        or metadata.get("MMSI_String")
        or payload.get("UserID")
        or payload.get("MMSI")
    )

    if value is None:
        return None

    return str(value)


def clean_text(value):
    if not value:
        return "Unknown vessel"

    return str(value).strip()


def map_ais_ship_type(ship_type_code, ship_name):
    name = str(ship_name or "").upper()

    if ship_type_code is not None:
        try:
            code = int(ship_type_code)

            if 30 <= code <= 39:
                return "Tug / Service"

            if 50 <= code <= 59:
                return "Tug / Service"

            if 60 <= code <= 69:
                return "Passenger"

            if 70 <= code <= 79:
                return "Cargo"

            if 80 <= code <= 89:
                return "Tanker"

        except Exception:
            pass

    if "TANKER" in name or "LNG" in name or "LPG" in name or "OIL" in name or "CHEM" in name:
        return "Tanker"

    if "MAERSK" in name or "MSC" in name or "CARGO" in name or "CONTAINER" in name or "EVER" in name:
        return "Cargo"

    if "TUG" in name or "TOW" in name or "PILOT" in name or "SUPPLY" in name:
        return "Tug / Service"

    if "FERRY" in name or "CRUISE" in name or "PASSENGER" in name:
        return "Passenger"

    return "Other / Unknown"