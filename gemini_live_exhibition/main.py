import os
import asyncio
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import google.generativeai as genai
import edge_tts

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Mount static files
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# Load Exhibition Data
EXHIBITION_DATA = ""
try:
    with open(os.path.join(BASE_DIR, "exhibition_data.txt"), "r") as f:
        EXHIBITION_DATA = f.read()
except FileNotFoundError:
    logger.warning("exhibition_data.txt not found. Using empty context.")

# Configure Gemini
API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    logger.error("GEMINI_API_KEY environment variable not set!")

genai.configure(api_key=API_KEY)

# System Prompt
SYSTEM_PROMPT = f"""
You are an intelligent and friendly AI guide for a Computer Science Exhibition.
Your goal is to engage with visitors, answer their questions about the exhibition, and provide interesting facts.
You are helpful, concise, and enthusiastic.
Use the following information about the exhibition to answer questions:

{EXHIBITION_DATA}

If a user asks something outside this context, politely steer them back to the exhibition or answer briefly if it's a general CS question.
Keep your responses relatively short (1-3 sentences) as they will be spoken out loud.
"""

model = genai.GenerativeModel(
    model_name="gemini-2.5-flash-lite", # Using the requested model
    system_instruction=SYSTEM_PROMPT
)

chat = model.start_chat(history=[])

async def text_to_speech(text: str, voice: str = "en-US-AriaNeural") -> bytes:
    """Converts text to speech using Edge TTS."""
    communicate = edge_tts.Communicate(text, voice)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    return audio_data

@app.get("/")
async def get():
    with open(os.path.join(BASE_DIR, "static/index.html"), "r") as f:
        return HTMLResponse(f.read())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connected")
    
    try:
        while True:
            data = await websocket.receive_text()
            logger.info(f"Received: {data}")
            
            if not API_KEY:
                await websocket.send_json({"type": "error", "message": "API Key not set on server."})
                continue

            # 1. Send to Gemini
            try:
                response = await chat.send_message_async(data)
                ai_text = response.text
                logger.info(f"Gemini Response: {ai_text}")
                
                # Send text back immediately for UI
                await websocket.send_json({"type": "text", "content": ai_text})
                
                # 2. Convert to Audio
                audio_bytes = await text_to_speech(ai_text)
                
                # 3. Send Audio
                # We send it as bytes. The browser will handle it.
                await websocket.send_bytes(audio_bytes)
                
            except Exception as e:
                logger.error(f"Error processing request: {e}")
                await websocket.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
