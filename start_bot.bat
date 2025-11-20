@echo off
echo Starting Exhibition Voice Bot...
if "%GEMINI_API_KEY%"=="" (
    set GEMINI_API_KEY=
)

cd gemini_live_exhibition
echo Installing dependencies...
pip install -r requirements.txt
echo Starting Server...
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause
