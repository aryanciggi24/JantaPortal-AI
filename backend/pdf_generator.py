from io import BytesIO
from textwrap import wrap

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def build_rti_pdf(case: dict, rti_text: str) -> BytesIO:
    """Create a minimal Section 6(1) RTI application as an in-memory PDF."""
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"RTI Application - {case['case_id']}",
    )
    styles = getSampleStyleSheet()
    normal = styles["BodyText"]
    normal.leading = 15
    heading = styles["Heading1"]
    heading.fontSize = 14
    heading.leading = 18

    story = [
        Paragraph("APPLICATION UNDER SECTION 6(1) OF THE RIGHT TO INFORMATION ACT, 2005", heading),
        Spacer(1, 10),
        Paragraph("To,", normal),
        Paragraph("The Central/State Public Information Officer (CPIO/SPIO)", normal),
        Paragraph("[Please address to the public authority identified by JantaPortal AI]", normal),
        Spacer(1, 10),
        Paragraph("Subject: Request for information under Section 6(1) of the RTI Act, 2005", normal),
        Spacer(1, 10),
        Paragraph("Sir/Madam,", normal),
        Paragraph(
            "I am an Indian citizen. Kindly provide the information and certified copies requested below. "
            "The requested information relates to synthetic hackathon case " + case["case_id"] + ".",
            normal,
        ),
        Spacer(1, 8),
    ]
    for line in rti_text.splitlines():
        clean_line = line.strip()
        if clean_line:
            story.append(Paragraph(clean_line.replace("&", "&amp;"), normal))
            story.append(Spacer(1, 4))
    story.extend([
        Spacer(1, 10),
        Paragraph("I am enclosing the prescribed application fee, if applicable. Please send the information to the address below.", normal),
        Spacer(1, 12),
        Paragraph(f"Name: {case['applicant_name']}", normal),
        Paragraph(f"Address: {case['address']}", normal),
        Paragraph("Date: ____________________", normal),
        Spacer(1, 16),
        Paragraph("Signature: ____________________", normal),
        Spacer(1, 12),
        Paragraph("Prototype notice: This PDF uses synthetic data and is a drafting aid, not legal advice.", normal),
    ])
    document.build(story)
    buffer.seek(0)
    return buffer
