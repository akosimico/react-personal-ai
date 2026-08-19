import os
from dotenv import load_dotenv

load_dotenv()

from langchain_community.vectorstores import Chroma
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings

CHROMA_PATH = os.getenv("CHROMA_PATH", "chroma")


def format_history(messages):
    """Formats Streamlit session_state messages into a readable chat string."""
    formatted = []
    for msg in messages:
        role = "Human" if msg["role"] == "user" else "Assistant"
        formatted.append(f"{role}: {msg['content']}")
    return "\n".join(formatted)


def format_docs(docs):
    """Helper to join document contents retrieved from vectorstore."""
    return "\n\n".join([doc.page_content for doc in docs])


def get_rag_chain(source_names: list[str] | None = None):
    # 1. Setup Embeddings and Vectorstore Retriever
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    vectorstore = Chroma(persist_directory=CHROMA_PATH, embedding_function=embeddings)
    search_kwargs = {"k": 4}
    if source_names:
        # New uploads carry source_name; source is included for documents
        # indexed before mention support was added.
        legacy_sources = []
        for name in source_names:
            legacy_sources.extend(
                [
                    name,
                    os.path.join("docs", name),
                    os.path.abspath(os.path.join("docs", name)),
                ]
            )
        search_kwargs["filter"] = {
            "$or": [
                {"source_name": {"$in": source_names}},
                {"source": {"$in": legacy_sources}},
            ]
        }
    retriever = vectorstore.as_retriever(search_kwargs=search_kwargs)

    model_name = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    llm = ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=os.getenv("GOOGLE_API_KEY"),
        temperature=0,
    )

    # 3. Step 1: Query Reformulation Chain (makes question standalone using chat history)
    contextualize_q_system_prompt = (
        "Given a chat history and the latest user question "
        "which might reference context in the chat history, "
        "formulate a standalone question which can be understood "
        "without the chat history. Do NOT answer the question, "
        "just reformulate it if needed and otherwise return it as is."
    )

    contextualize_q_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", contextualize_q_system_prompt),
            ("human", "Chat History:\n{chat_history}\n\nQuestion: {input}"),
        ]
    )

    history_aware_retriever = (
        {
            "chat_history": lambda x: format_history(x["chat_history"]),
            "input": lambda x: x["input"],
        }
        | contextualize_q_prompt
        | llm
        | StrOutputParser()
        | retriever
        | format_docs
    )

    # 4. Step 2: Main Question Answering Prompt
    qa_system_prompt = (
        "You are an assistant for question-answering tasks. "
        "Use the following pieces of retrieved context to answer "
        "the question. If you don't know the answer, say that you "
        "don't know.\n\n"
        "Context:\n{context}"
    )

    qa_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", qa_system_prompt),
            ("human", "Chat History:\n{chat_history}\n\nQuestion: {input}"),
        ]
    )

    # 5. Final Combined RAG Chain
    rag_chain = (
        RunnablePassthrough.assign(
            context=history_aware_retriever,
            chat_history=lambda x: format_history(x["chat_history"]),
        )
        | qa_prompt
        | llm
        | StrOutputParser()
    )

    return rag_chain
