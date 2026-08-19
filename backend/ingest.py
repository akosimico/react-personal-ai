import os
from dotenv import load_dotenv

load_dotenv()
from langchain_community.document_loaders import (
    DirectoryLoader,
    PyPDFLoader,
    TextLoader,
    Docx2txtLoader,
    UnstructuredWordDocumentLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

DATA_PATH = "./docs"
CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")


LOADER_MAP = {
    ".pdf": PyPDFLoader,
    ".txt": lambda path: TextLoader(path, encoding="utf-8"),
    ".docx": lambda path: Docx2txtLoader(path),
    ".doc": lambda path: UnstructuredWordDocumentLoader(path),
    ".md": lambda path: TextLoader(path, encoding="utf-8"),
}

_embeddings = None


def get_embeddings():

    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    return _embeddings


def load_file(path: str):
    ext = os.path.splitext(path)[1].lower()
    loader_factory = LOADER_MAP.get(ext)
    if loader_factory is None:
        raise ValueError(
            f"Unsopported file type '{ext}'. Supported: {list(LOADER_MAP)}"
        )
    loader = loader_factory(path)
    return loader.load()


def build_vector_store():

    all_docs = []
    for root, _, files in os.walk(DATA_PATH):
        for fname in files:
            if fname.startswith("."):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext not in LOADER_MAP:
                continue
            path = os.path.join(root, fname)
            try:
                loaded_docs = load_file(path)
                for doc in loaded_docs:
                    doc.metadata["source_name"] = os.path.basename(path)
                all_docs.extend(loaded_docs)
            except Exception as e:
                print(f"Skipping {fname}: {e}")

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = text_splitter.split_documents(all_docs)

    vectorstore = Chroma.from_documents(
        documents=chunks, embedding=get_embeddings(), persist_directory=CHROMA_PATH
    )
    print(f"Ingested {len(chunks)} chunks into {CHROMA_PATH}")


def add_document(path: str) -> int:

    if not os.path.isfile(path):
        raise FileNotFoundError(f"FIle not found: {path}")

    docs = load_file(path)

    # Keep a stable filename in metadata so chat mentions can filter retrieval
    # without depending on OS-specific path separators.
    for doc in docs:
        doc.metadata["source_name"] = os.path.basename(path)

    if not docs:
        raise ValueError(
            f"Could not extract any content from " f"{os.path.basename(path)}"
        )
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = text_splitter.split_documents(docs)

    if not chunks:
        raise ValueError(f"No text could be extracted from" f"{os.path.basename(path)}")
    vectorstore = Chroma(
        persist_directory=CHROMA_PATH, embedding_function=get_embeddings()
    )
    vectorstore.add_documents(chunks)
    print(f"Added {len(chunks)} chunks from {os.path.basename(path)} to {CHROMA_PATH}")
    return len(chunks)


def delete_document(filename: str) -> int:
    """
    Delete all vector-store chunks belonging to a document.
    Returns the number of deleted chunks.
    """

    # Normalize the filename first.
    document_name = os.path.basename(filename)

    vectorstore = Chroma(
        persist_directory=CHROMA_PATH,
        embedding_function=get_embeddings(),
    )

    # Find chunks belonging to this document.
    results = vectorstore.get(where={"source": document_name})

    ids = results.get("ids", [])

    if not ids:
        print(f"No vectors found for {document_name}")
        return 0

    # Delete the matching chunks.
    vectorstore.delete(ids=ids)

    print(f"Deleted {len(ids)} chunks belonging to {document_name}")

    return len(ids)


if __name__ == "__main__":
    build_vector_store()
