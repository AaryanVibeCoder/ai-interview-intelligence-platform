import logging
from pathlib import Path
import docx
import pdfplumber

logger = logging.getLogger(__name__)


def extract_text_from_file(file_path: str) -> str:
    """
    Extracts raw text from uploaded resume files (PDF and DOCX).

    Args:
        file_path (str): The path to the resume file.

    Returns:
        str: The extracted raw text, or an empty string if the extracted
             text is blank after stripping.

    Raises:
        ValueError: If the file type is unsupported.
        RuntimeError: If text extraction fails for any other reason.
    """
    ext = Path(file_path).suffix.lower()
    if ext not in (".pdf", ".docx"):
        raise ValueError(f"Unsupported file type: {ext}")

    try:
        if ext == ".pdf":
            pages_text = []
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text is not None:
                        pages_text.append(text)
            extracted_text = "\n\n".join(pages_text).strip()
        else:  # ext == ".docx"
            doc = docx.Document(file_path)
            paragraphs_text = [para.text for para in doc.paragraphs]
            extracted_text = "\n".join(paragraphs_text).strip()

        return extracted_text

    except Exception as e:
        logger.error(f"Failed to extract text from {file_path}: {str(e)}")
        raise RuntimeError(f"Failed to extract text: {str(e)}") from e
