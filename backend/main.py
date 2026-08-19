import os
import re
import shutil
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Personal RAG Engine API")

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOCS_FOLDER = "docs"
os.makedirs(DOCS_FOLDER, exist_ok=True)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    chat_history: List[ChatMessage] = []


def extract_file_mentions(text: str, filenames: List[str]) -> tuple[str, List[str]]:
    """Extract @filename or @"file name.pdf" mentions from the prompt."""
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


# 1. Get all indexed documents
@app.get("/api/documents")
def get_documents():
    if not os.path.exists(DOCS_FOLDER):
        return []

    files = []
    for name in sorted(os.listdir(DOCS_FOLDER)):
        if name.startswith("."):
            continue
        path = os.path.join(DOCS_FOLDER, name)
        if os.path.isfile(path):
            files.append(
                {
                    "name": name,
                    "size_kb": round(os.path.getsize(path) / 1024, 1),
                    "extension": name.split(".")[-1].upper() if "." in name else "FILE",
                }
            )
    return files


# 2. Upload and index new documents
@app.post("/api/documents/upload")
async def upload_documents(files: List[UploadFile] = File(...)):
    from ingest import add_document

    results = []

    for file in files:
        safe_name = os.path.basename(file.filename)
        dest = os.path.join(DOCS_FOLDER, safe_name)

        # Handle filename collisions
        if os.path.exists(dest):
            base, ext = os.path.splitext(safe_name)
            i = 1
            while os.path.exists(dest):
                dest = os.path.join(DOCS_FOLDER, f"{base} ({i}){ext}")
                i += 1

        try:
            with open(dest, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # Ingest into vector store
            add_document(dest)
            results.append({"name": os.path.basename(dest), "status": "success"})
        except Exception as e:
            if os.path.isfile(dest):
                os.remove(dest)
            results.append({"name": safe_name, "status": "error", "error": str(e)})

    return {"uploaded": results}


# 3. Delete a document
@app.delete("/api/documents/{filename}")
def remove_document(filename: str):
    from ingest import delete_document

    path = os.path.join(DOCS_FOLDER, filename)
    try:
        # Delete from vector store
        delete_document(filename)

        # Delete physical file
        if os.path.isfile(path):
            os.remove(path)
        return {"status": "success", "message": f"Deleted {filename}"}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to delete {filename}: {str(e)}"
        )


# 4. Stream RAG Chat Response
@app.post("/api/chat")
async def chat_stream(request: ChatRequest):
    from rag_chain import get_rag_chain

    knowledge_base_files = [
        name
        for name in os.listdir(DOCS_FOLDER)
        if not name.startswith(".") and os.path.isfile(os.path.join(DOCS_FOLDER, name))
    ]

    clean_question, mentioned_files = extract_file_mentions(
        request.message, knowledge_base_files
    )

    # Initialize LangChain RAG chain with optional document filter
    rag_chain = get_rag_chain(source_names=mentioned_files or None)

    # Format history for LangChain
    formatted_history = [
        {"role": m.role, "content": m.content} for m in request.chat_history
    ]

    def stream_generator():
        try:
            for chunk in rag_chain.stream(
                {
                    "input": clean_question or request.message,
                    "chat_history": formatted_history,
                }
            ):
                # Extract text if chunk is an AIMessageChunk or string
                text = chunk.content if hasattr(chunk, "content") else str(chunk)
                yield text
        except Exception as e:
            yield f"\n[Error generating response: {str(e)}]"

    return StreamingResponse(stream_generator(), media_type="text/plain")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
