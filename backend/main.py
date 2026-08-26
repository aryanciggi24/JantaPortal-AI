import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI

from pdf_generator import build_rti_pdf
from schemas import CaseAnalysis, CustomCaseInput, RTIDownloadRequest

BASE_DIR = Path(__file__).resolve().parent
CASES = json.loads((BASE_DIR / "mock_cases.json").read_text(encoding="utf-8"))
CASE_LOOKUP = {item["case_id"]: item for item in CASES}

app = FastAPI(title="JantaPortal AI API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    # Vite switches to the next port (for example 5174) when 5173 is busy.
    # Keep this restricted to localhost while supporting that normal dev flow.
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_case(case_id: str) -> dict:
    case = CASE_LOOKUP.get(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Synthetic case not found")
    return case


def register_custom_case(case_id: str, payload: CustomCaseInput) -> dict:
    """Store a demo form case for this process so it can subsequently generate a PDF."""
    if not case_id.startswith("CASE-2026-CUSTOM-"):
        raise HTTPException(status_code=400, detail="Only CASE-2026-CUSTOM-* IDs may be created from the demo form")
    case = {
        "case_id": case_id,
        "applicant_name": "Demo Custom Citizen",
        "address": "Demo address withheld — hackathon prototype",
        "category": payload.category,
        "prompt_text": payload.prompt_text,
        "days_pending": payload.days_pending,
        "state": "India",
        "district": payload.location,
    }
    CASE_LOOKUP[case_id] = case
    return case


def fallback_analysis(case: dict) -> CaseAnalysis:
    is_scholarship = "scholarship" in case["category"].lower()
    overdue = case["days_pending"] > 21
    ministry = "Ministry of Education" if is_scholarship else "Ministry of Road Transport and Highways"
    department = "Department of Higher Education" if is_scholarship else "Public Works / Urban Local Body"
    authority = "Central Public Information Officer, concerned public authority" if is_scholarship else "Nodal Grievance Officer, concerned public authority"
    issue = case["prompt_text"]
    cpgrams = (
        f"Subject: Request for action on {case['category']}\n\n"
        f"I request timely action on the following public-service issue in {case['district']}, {case['state']}:\n"
        f"{issue}\n\n"
        "The issue affects public safety/service delivery. Kindly register the grievance, assign it to the competent authority, "
        "communicate the action taken, and provide an expected completion date."
    )
    ref = case.get("previous_grievance_reference", "the related application/grievance")
    rti = (
        "1. Please provide a certified copy of the current status record for " + ref + ".\n"
        "2. Please provide certified copies of the note sheets and file movement register entries relating to this matter.\n"
        "3. Please provide the name, designation and office address of each officer with whom the file was pending, with dates of movement.\n"
        "4. Please provide certified copies of any inspection report, work order, sanction, correspondence, or action-taken report available on record.\n"
        "5. Please provide the prescribed timeline and the relevant rules/circulars governing disposal of this matter."
    )
    return CaseAnalysis(
        case_type="RTI_APPLICATION" if overdue or is_scholarship else "CPGRAMS_GRIEVANCE",
        target_ministry=ministry,
        target_department=department,
        nodal_authority=authority,
        issue_summary=issue,
        formatted_cpgrams_text=cpgrams,
        formatted_rti_text=rti,
        readiness_score=96 if overdue else (92 if is_scholarship else 90),
        suggested_action=(
            "Escalate now: the grievance is overdue by more than 21 days. Submit the RTI application for certified records."
            if overdue
            else ("Prepare a Section 6(1) RTI application for official records." if is_scholarship else "Submit this factual CPGRAMS grievance to the routed authority.")
        ),
    )


async def ai_analysis(case: dict) -> CaseAnalysis:
    """Use structured outputs when an OPENAI_API_KEY exists; retain an offline demo path."""
    if not os.getenv("OPENAI_API_KEY"):
        return fallback_analysis(case)

    client = AsyncOpenAI()
    instructions = """You are JantaPortal AI, an Indian civic drafting assistant. Map this synthetic case to an official-looking ministry/department and concise nodal authority. Draft factual, respectful CPGRAMS text. Draft a Section 6(1) RTI request as numbered requests for existing records: certified copies, note sheets, file-movement logs, action-taken reports, rules and status. Never ask 'why', demand opinions, accuse anyone, invent a fact, or request personal data. If days_pending is greater than 21, set case_type to RTI_APPLICATION and recommend escalation. Otherwise use CPGRAMS_GRIEVANCE unless it is explicitly an RTI records request. Return only the requested schema."""
    completion = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": instructions},
            {"role": "user", "content": json.dumps(case)},
        ],
        response_format=CaseAnalysis,
        temperature=0.2,
    )
    result = completion.choices[0].message.parsed
    if result is None:
        raise HTTPException(status_code=502, detail="AI returned no structured result")
    return result


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "mode": "ai" if os.getenv("OPENAI_API_KEY") else "demo-fallback"}


@app.get("/api/cases")
async def list_cases() -> list[dict]:
    return [{"case_id": case["case_id"], "category": case["category"]} for case in CASES]


@app.get("/api/case/{case_id}")
async def retrieve_case(case_id: str) -> dict:
    return get_case(case_id)


@app.get("/api/cases/{case_id}")
async def retrieve_case_by_collection(case_id: str) -> dict:
    """Collection-style route used by the frontend."""
    return get_case(case_id)


@app.post("/api/analyze/{case_id}", response_model=CaseAnalysis)
async def analyze_case(case_id: str) -> CaseAnalysis:
    return await ai_analysis(get_case(case_id))


@app.post("/api/cases/{case_id}/analyze", response_model=CaseAnalysis)
async def analyze_case_by_collection(case_id: str, payload: CustomCaseInput | None = None) -> CaseAnalysis:
    case = register_custom_case(case_id, payload) if payload else get_case(case_id)
    return await ai_analysis(case)


@app.post("/api/download-rti")
async def download_rti(request: RTIDownloadRequest) -> StreamingResponse:
    case = get_case(request.case_id)
    pdf = build_rti_pdf(case, request.formatted_rti_text)
    headers = {"Content-Disposition": f'attachment; filename="{request.case_id}-section-6-1-rti.pdf"'}
    return StreamingResponse(pdf, media_type="application/pdf", headers=headers)


@app.post("/api/cases/{case_id}/download-rti")
async def download_case_rti(case_id: str, request: RTIDownloadRequest) -> StreamingResponse:
    if request.case_id != case_id:
        raise HTTPException(status_code=400, detail="Case ID in URL and body must match")
    case = get_case(case_id)
    pdf = build_rti_pdf(case, request.formatted_rti_text)
    headers = {"Content-Disposition": f'attachment; filename="{case_id}-section-6-1-rti.pdf"'}
    return StreamingResponse(pdf, media_type="application/pdf", headers=headers)
