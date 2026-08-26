from typing import Literal

from pydantic import BaseModel, Field


class CaseAnalysis(BaseModel):
    """Normalized civic routing and drafting result returned to the browser."""

    case_type: Literal["CPGRAMS_GRIEVANCE", "RTI_APPLICATION"]
    target_ministry: str
    target_department: str
    nodal_authority: str
    issue_summary: str = Field(description="Concise factual synopsis of the citizen's issue")
    formatted_cpgrams_text: str
    formatted_rti_text: str
    readiness_score: int = Field(ge=0, le=100)
    suggested_action: str


class RTIDownloadRequest(BaseModel):
    case_id: str
    formatted_rti_text: str


class CustomCaseInput(BaseModel):
    """Non-persistent, synthetic case payload used by the hackathon demo form."""

    category: str = Field(min_length=2, max_length=100)
    location: str = Field(min_length=2, max_length=150)
    prompt_text: str = Field(min_length=10, max_length=4000)
    days_pending: int = Field(ge=1, le=45)
