# JantaPortal AI

Mock-only autonomous CPGRAMS and RTI drafting gateway for the **Build What Moves India** hackathon.

## Run the API

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Set `OPENAI_API_KEY` before starting to enable `gpt-4o` structured outputs. Without one, the fully functional demo uses deterministic local routing and drafting.

## Run the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite proxy routes API requests to the FastAPI server.
