import logging
import os
import re
import shutil
from pathlib import Path
from typing import Generator, List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pypdf import PdfReader

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
DOCS_FOLDER = Path(os.getenv("DOCS_FOLDER", "docs"))
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"

DEMO_BRIEF_FILENAME = "demo-project-brief.md"
DEMO_CONTENT_PREVIEW_CHARS = 2500
SUMMARY_KEYWORDS = ("summar", "takeaway", "key")
MILESTONE_KEYWORDS = ("deadline", "date", "milestone")

DOCS_FOLDER.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Personal RAG Engine API",
    description="Document management and retrieval-augmented chat API.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    chat_history: List[ChatMessage] = []


class DocumentInfo(BaseModel):
    name: str
    size_kb: float
    extension: str


class UploadResult(BaseModel):
    name: str
    status: str
    error: Optional[str] = None


class UploadResponse(BaseModel):
    uploaded: List[UploadResult]


class DeleteResponse(BaseModel):
    status: str
    message: str


def extract_file_mentions(text: str, filenames: List[str]) -> Tuple[str, List[str]]:
    """
    Extract @filename or @"file name.pdf" mentions from a prompt.

    Args:
        text: The raw user prompt, potentially containing @mentions.
        filenames: Known filenames in the knowledge base to match against.

    Returns:
        A tuple of (cleaned question with mentions removed, matched filenames).
    """
    mentioned_files = []
    question = text

    for filename in sorted(filenames, key=len, reverse=True):
        pattern = re.compile(
            rf'@(?:"{re.escape(filename)}"|{re.escape(filename)})', re.IGNORECASE
        )
        if pattern.search(question):
            mentioned_files.append(filename)
            question = pattern.sub("", question)

    return question.strip(), mentioned_files


def list_knowledge_base_files() -> List[str]:
    """Return the names of all files currently stored in the docs folder."""
    if not DOCS_FOLDER.exists():
        return []
    return [
        entry.name
        for entry in sorted(DOCS_FOLDER.iterdir())
        if entry.is_file() and not entry.name.startswith(".")
    ]


def _load_demo_brief() -> str:
    """Load the preloaded demo project brief, if available."""
    demo_path = DOCS_FOLDER / DEMO_BRIEF_FILENAME

    if not demo_path.is_file():
        logger.warning("Demo brief not found at %s", demo_path)
        return ""

    try:
        return demo_path.read_text(encoding="utf-8")
    except OSError:
        logger.exception("Failed to read demo brief at %s", demo_path)
        return ""


def demo_response(message: str):
    message_lower = message.lower()

    pdf_path = DOCS_FOLDER / "About me.pdf"
    md_path = DOCS_FOLDER / "demo-project-brief.md"

    reader = PdfReader(str(pdf_path))
    about_text = "\n".join(page.extract_text() or "" for page in reader.pages)

    project_text = md_path.read_text(encoding="utf-8")

    if any(
        word in message_lower
        for word in ["about me", "author", "mico", "bio", "background"]
    ):
        yield "Author profile:\n\n" + about_text[:4000]
    elif any(
        word in message_lower for word in ["project", "demo", "milestone", "feature"]
    ):
        yield "Project brief:\n\n" + project_text[:4000]
    else:
        yield (
            "Author profile:\n\n"
            + about_text[:2000]
            + "\n\nProject brief:\n\n"
            + project_text[:2000]
        )


def _require_live_mode() -> None:
    """Raise an HTTPException if the API is running in demo mode."""
    if DEMO_MODE:
        raise HTTPException(
            status_code=403,
            detail="This action is disabled in demo mode. Use the preloaded sample document.",
        )


@app.get("/api/documents", response_model=List[DocumentInfo])
def get_documents() -> List[DocumentInfo]:
    """List all documents currently indexed in the knowledge base."""
    documents = []
    for name in list_knowledge_base_files():
        path = DOCS_FOLDER / name
        documents.append(
            DocumentInfo(
                name=name,
                size_kb=round(path.stat().st_size / 1024, 1),
                extension=name.rsplit(".", 1)[-1].upper() if "." in name else "FILE",
            )
        )
    return documents


@app.post("/api/documents/upload", response_model=UploadResponse)
async def upload_documents(files: List[UploadFile] = File(...)) -> UploadResponse:
    """Upload one or more documents and add them to the vector index."""
    _require_live_mode()

    from ingest import add_document

    results: List[UploadResult] = []

    for file in files:
        safe_name = os.path.basename(file.filename)
        dest = DOCS_FOLDER / safe_name

        # Handle filename collisions by appending a numeric suffix.
        if dest.exists():
            stem, suffix = dest.stem, dest.suffix
            counter = 1
            while dest.exists():
                dest = DOCS_FOLDER / f"{stem} ({counter}){suffix}"
                counter += 1

        try:
            with dest.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            add_document(str(dest))
            results.append(UploadResult(name=dest.name, status="success"))
        except Exception as exc:
            logger.exception("Failed to upload/index file %s", safe_name)
            if dest.is_file():
                dest.unlink()
            results.append(UploadResult(name=safe_name, status="error", error=str(exc)))

    return UploadResponse(uploaded=results)


@app.delete("/api/documents/{filename}", response_model=DeleteResponse)
def remove_document(filename: str) -> DeleteResponse:
    """Delete a document from disk and remove it from the vector index."""
    _require_live_mode()

    from ingest import delete_document

    path = DOCS_FOLDER / filename
    try:
        delete_document(filename)
        if path.is_file():
            path.unlink()
        return DeleteResponse(status="success", message=f"Deleted {filename}")
    except Exception as exc:
        logger.exception("Failed to delete file %s", filename)
        raise HTTPException(
            status_code=500, detail=f"Failed to delete {filename}: {exc}"
        ) from exc


@app.post("/api/chat")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    """Stream a chat response, grounded in the knowledge base, for a user message."""
    if DEMO_MODE:
        return StreamingResponse(
            demo_response(request.message), media_type="text/plain"
        )

    from rag_chain import get_rag_chain

    knowledge_base_files = list_knowledge_base_files()
    clean_question, mentioned_files = extract_file_mentions(
        request.message, knowledge_base_files
    )

    rag_chain = get_rag_chain(source_names=mentioned_files or None)
    formatted_history = [
        {"role": msg.role, "content": msg.content} for msg in request.chat_history
    ]

    def stream_generator() -> Generator[str, None, None]:
        try:
            for chunk in rag_chain.stream(
                {
                    "input": clean_question or request.message,
                    "chat_history": formatted_history,
                }
            ):
                yield chunk.content if hasattr(chunk, "content") else str(chunk)
        except Exception as exc:
            logger.exception("Error while streaming RAG response")
            yield f"\n[Error generating response: {exc}]"

    return StreamingResponse(stream_generator(), media_type="text/plain")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
