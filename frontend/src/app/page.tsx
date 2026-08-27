"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  FileText,
  Trash2,
  Paperclip,
  Send,
  Bot,
  User,
  Loader2,
  Plus,
  RotateCcw,
  Square,
  Info,
  Search,
  Sparkles,
  X,
  FileCheck,
  FolderClosed,
  Lightbulb,
  GitCompare,
  ListChecks,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Menu,
  PanelLeftClose,
} from "lucide-react";
import {
  fetchDocuments,
  deleteDocument,
  uploadDocuments,
  DocumentItem,
  ChatMessage,
  API_BASE,
} from "@/lib/api";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Personal AI Workspace";
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0";
const APP_AUTHOR = process.env.NEXT_PUBLIC_APP_AUTHOR || "Mico Barnedo";
const APP_YEAR = process.env.NEXT_PUBLIC_APP_YEAR || "2026";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const TECH_STACK = ["Python", "FastAPI", "Next.js", "LangChain", "ChromaDB", "Tailwind CSS"];

interface Toast {
  id: number;
  message: string;
  type?: "info" | "success" | "error";
}

export default function PersonalRAG() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [docSearch, setDocSearch] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  // Sidebar (collapsible on mobile, always visible on desktop)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Modals & Popovers
  const [showAbout, setShowAbout] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Trigger toast alert
  const showToast = (message: string, type: "info" | "success" | "error" = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  // Load documents
  const loadDocs = async () => {
    try {
      const data = await fetchDocuments();
      setDocuments(data);
    } catch (e) {
      console.error("Error loading documents:", e);
    }
  };
  const getBadgeColor = (ext: string) => {
    switch (ext.toUpperCase()) {
      case "PDF":
        return "bg-red-950/80 text-red-400 border-red-800/60";
      case "DOCX":
      case "DOC":
        return "bg-blue-950/80 text-blue-400 border-blue-800/60";
      case "TXT":
        return "bg-emerald-950/80 text-emerald-400 border-emerald-800/60";
      case "MD":
        return "bg-purple-950/80 text-purple-400 border-purple-800/60";
      case "CSV":
      case "XLS":
      case "XLSX":
        return "bg-amber-950/80 text-amber-400 border-amber-800/60";
      case "JSON":
        return "bg-cyan-950/80 text-cyan-400 border-cyan-800/60";
      default:
        return "bg-indigo-950/80 text-indigo-300 border-indigo-700/50";
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Handle file uploads with animation
  const handleFileUpload = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setUploadingFiles(fileArray.map((f) => f.name));
    setIsUploading(true);

    try {
      await uploadDocuments(fileArray);
      await loadDocs();
      showToast(`${fileArray.length} document${fileArray.length > 1 ? "s" : ""} indexed successfully`, "success");
    } catch (err) {
      showToast("Failed to upload and index documents", "error");
    } finally {
      setIsUploading(false);
      setUploadingFiles([]);
    }
  };

  // Handle @ mentions autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);

    const match = value.match(/(?:^|\s)@([^@\n]*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (docName: string) => {
    const mention = docName.includes(" ") ? `@"${docName}"` : `@${docName}`;
    const atIndex = input.lastIndexOf("@");
    const updated = input.slice(0, atIndex) + mention + " ";
    setInput(updated);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  // Filter docs
  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(docSearch.toLowerCase().trim())
  );

  const mentionFilteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(mentionQuery)
  );

  // Confirm delete handler
  const confirmDelete = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDocument(docToDelete);
      await loadDocs();
      showToast(`Removed ${docToDelete}`, "info");
      setDocToDelete(null);
    } catch (e) {
      showToast(`Could not delete ${docToDelete}`, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // 🛑 Stop Generation Handler
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsThinking(false);

    setMessages((prev) => {
      const updated = [...prev];
      if (updated.length > 0) {
        const lastMsg = updated[updated.length - 1];
        if (lastMsg.role === "assistant") {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: lastMsg.content.trim()
              ? `${lastMsg.content}\n\n*(Generation stopped by user)*`
              : "*(Generation stopped by user)*",
          };
        } else {
          updated.push({
            role: "assistant",
            content: "*(Generation stopped by user)*",
          });
        }
      }
      return updated;
    });
  };

  // Submit and stream chat
  const handleSend = async (customPrompt?: string) => {
    const promptToSend = customPrompt || input;
    if ((!promptToSend.trim() && attachedFiles.length === 0) || isThinking) return;

    let finalPrompt = promptToSend;

    // Upload attached files if any
    if (attachedFiles.length > 0) {
      setIsThinking(true);
      setIsUploading(true);
      setUploadingFiles(attachedFiles.map((f) => f.name));
      try {
        await uploadDocuments(attachedFiles);
        await loadDocs();
        const attachedNotes = attachedFiles.map((f) => f.name).join(", ");
        finalPrompt += `\n\n[Attached: ${attachedNotes}]`;
        showToast("Documents indexed successfully", "success");
        setAttachedFiles([]);
      } catch (err) {
        showToast("Failed to upload attachments", "error");
        setIsThinking(false);
        setIsUploading(false);
        setUploadingFiles([]);
        return;
      } finally {
        setIsUploading(false);
        setUploadingFiles([]);
      }
    }

    const currentHistory = [...messages];

    // Immediately add both user message AND empty assistant message placeholder
    setMessages((prev) => [
      ...prev,
      { role: "user", content: finalPrompt },
      { role: "assistant", content: "" },
    ]);

    setInput("");
    setShowMentions(false);
    setIsThinking(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: finalPrompt,
          chat_history: currentHistory,
        }),
        signal: controller.signal,
      });

      if (!response.body) throw new Error("No response stream available");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });

        setMessages((prev) => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.role === "assistant") {
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantText,
            };
          }
          return updated;
        });
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("Chat error:", error);
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.role === "assistant") {
            updated[updated.length - 1] = {
              role: "assistant",
              content: "⚠️ Could not connect to backend server. Make sure FastAPI is running.",
            };
          }
          return updated;
        });
        showToast("Connection failed to backend", "error");
      }
    } finally {
      setIsThinking(false);
      abortControllerRef.current = null;
    }
  };

  const QUICK_PROMPTS = [
    {
      icon: <FileText size={16} className="text-indigo-400" />,
      title: "Summarize Documents",
      prompt: "Summarize key findings and takeaways across all uploaded documents.",
    },
    {
      icon: <GitCompare size={16} className="text-indigo-400" />,
      title: "Compare References",
      prompt: "Compare key arguments, contrasts, and differences between my notes.",
    },
    {
      icon: <ListChecks size={16} className="text-indigo-400" />,
      title: "Extract Action Items",
      prompt: "List all critical action items, deadlines, dates, and key conclusions.",
    },
    {
      icon: <Lightbulb size={16} className="text-indigo-400" />,
      title: "Key Takeaways",
      prompt: "What are the most important insights and core takeaways from this workspace?",
    },
  ];

  return (
    <div className="flex h-screen bg-[#0A0D14] text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 overflow-hidden">

      {/* 🔔 File Status Toasts */}
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-xl text-xs font-medium backdrop-blur-md animate-in slide-in-from-top-2 duration-200 ${
              t.type === "error"
                ? "bg-red-950/90 border-red-800/80 text-red-200"
                : t.type === "success"
                ? "bg-emerald-950/90 border-emerald-800/80 text-emerald-200"
                : "bg-[#172033]/95 border-[#1F2C42] text-slate-200"
            }`}
          >
            {t.type === "error" ? (
              <AlertCircle size={15} className="text-red-400" />
            ) : (
              <CheckCircle2 size={15} className="text-emerald-400" />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* 🌑 Mobile overlay backdrop (click to close sidebar) */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px] md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 📁 SIDEBAR — fixed overlay on mobile, static column on desktop */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 sm:w-80 max-w-[85vw] bg-[#0F1420] border-r border-[#1F2C42] flex flex-col justify-between
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* Top Header & Search */}
        <div className="p-4 border-b border-[#1F2C42]/70">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold flex items-center gap-2 text-slate-100">
              <FolderClosed size={18} className="text-indigo-400" /> Knowledge Base
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={DEMO_MODE || isUploading}
                title={DEMO_MODE ? "Uploads are disabled in demo mode" : "Add documents"}
                className="flex items-center gap-1.5 text-xs bg-[#172033] hover:bg-[#222E47] disabled:opacity-50 disabled:cursor-not-allowed text-indigo-300 border border-[#1F2C42] px-2.5 py-1.5 rounded-lg transition font-medium shadow-sm active:scale-95"
              >
                {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add
              </button>
              {/* Close button — mobile only */}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="md:hidden p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#172033] rounded-lg transition"
                title="Close sidebar"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.txt,.docx,.md"
              onChange={(e) => {
                if (e.target.files) {
                  handleFileUpload(e.target.files);
                }
              }}
            />
          </div>

          {DEMO_MODE && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
              <Info size={15} className="mt-0.5 shrink-0 text-amber-400" />
              <span>File uploads are disabled for demo purposes. This demo uses the preloaded sample document.</span>
            </div>
          )}

          {/* Search bar */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter documents..."
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              className="w-full bg-[#172033] border border-[#1F2C42] rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div className="flex items-center justify-between mt-2 px-1">
            <span className="text-[11px] text-slate-400">
              {documents.length} document{documents.length !== 1 ? "s" : ""} indexed
            </span>
            {docSearch && (
              <span className="text-[11px] text-indigo-400">
                ({filteredDocs.length} matching)
              </span>
            )}
          </div>
        </div>

        {/* Scrollable Document List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">

          {/* 🚀 Active Uploading Animation Card */}
          {isUploading && (
            <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/50 animate-pulse space-y-2">
              <div className="flex items-center gap-2.5 text-indigo-300">
                <Loader2 size={16} className="animate-spin text-indigo-400" />
                <span className="text-xs font-semibold">Indexing & vectorizing...</span>
              </div>
              <div className="space-y-1 pl-6">
                {uploadingFiles.slice(0, 3).map((name, i) => (
                  <p key={i} className="text-[10px] text-indigo-200/80 truncate">
                    • {name}
                  </p>
                ))}
                {uploadingFiles.length > 3 && (
                  <p className="text-[10px] text-indigo-300 italic">
                    + {uploadingFiles.length - 3} more
                  </p>
                )}
              </div>
              <div className="w-full bg-indigo-900/40 h-1 rounded-full overflow-hidden">
                <div className="bg-indigo-400 h-full w-2/3 animate-[shimmer_1.5s_infinite]" />
              </div>
            </div>
          )}

          {filteredDocs.map((doc) => (
            <div
              key={doc.name}
              className="group flex items-center justify-between p-2.5 rounded-xl bg-[#172033]/80 border border-[#1F2C42] hover:bg-[#222E47] hover:border-indigo-500/40 transition"
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${getBadgeColor(doc.extension)}`}>
                  {doc.extension}
                </span>
                <div className="truncate">
                  <p className="text-xs font-medium truncate text-slate-200" title={doc.name}>
                    {doc.name}
                  </p>
                  <p className="text-[10px] text-slate-400">{doc.size_kb} KB</p>
                </div>
              </div>
              <button
                onClick={() => setDocToDelete(doc.name)}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 transition"
                title={`Delete ${doc.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {filteredDocs.length === 0 && !isUploading && (
            <div className="py-10 text-center text-slate-500 text-xs px-4">
              {docSearch ? "No documents match your search." : "No documents yet. Attach files or click '+ Add' above."}
            </div>
          )}
        </div>

        {/* Sidebar Footer: Tip, Clear History & About */}
        <div className="p-3 border-t border-[#1F2C42] space-y-2 bg-[#0C101A]">
          <div className="text-[11px] text-slate-400 bg-[#172033]/70 p-2.5 rounded-xl border border-[#1F2C42] flex items-start gap-2.5">
            <Lightbulb size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <span>Focus query on a file using <code className="text-indigo-300 bg-indigo-950/80 px-1 py-0.5 rounded font-mono text-[10px]">@filename</code></span>
          </div>

          <button
            onClick={() => {
              setMessages([]);
              showToast("Chat history cleared", "info");
            }}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-slate-300 hover:bg-[#172033] hover:text-slate-100 rounded-lg border border-[#1F2C42] transition"
          >
            <RotateCcw size={13} /> Clear Chat History
          </button>

          <button
            onClick={() => setShowAbout(true)}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-slate-400 hover:text-indigo-300 hover:bg-[#172033] rounded-lg border border-[#1F2C42] transition"
          >
            <Info size={13} /> About
          </button>
        </div>
      </aside>

      {/* 💬 MAIN CHAT AREA */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden min-w-0">

        {/* Top Header */}
        <header className="px-4 sm:px-6 py-3.5 border-b border-[#1F2C42] flex items-center justify-between bg-[#0A0D14]/80 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* ☰ Sidebar toggle — mobile only */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-1.5 -ml-1 text-slate-300 hover:text-white hover:bg-[#172033] rounded-lg transition shrink-0"
              title="Open knowledge base"
            >
              <Menu size={20} />
            </button>

            <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-indigo-600/10 border border-indigo-500/20 shrink-0">
              <img
                src="/logo.png"
                alt="Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.parentElement?.classList.add("hidden");
                }}
              />
            </div>
            <h1 className="text-sm sm:text-base font-bold text-slate-100 tracking-tight truncate">
              {APP_NAME}
            </h1>
          </div>

          {isThinking && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-red-500/15 border border-red-500/40 text-red-300 hover:bg-red-500/25 rounded-lg transition active:scale-95 shrink-0"
            >
              <Square size={11} className="fill-red-400 text-red-400" /> <span className="hidden sm:inline">Stop Generating</span>
            </button>
          )}
        </header>

        {/* Message Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* Welcome Screen with 2x2 Quick Prompts Grid */}
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center px-2 sm:px-4">
              <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl mb-4 text-indigo-400 shadow-lg shadow-indigo-500/5">
                <Sparkles size={34} />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
                How can I help you today?
              </h2>
              <p className="text-xs text-slate-400 max-w-md mt-2 mb-8 leading-relaxed">
                Ask questions across your documents, synthesize notes, or target specific files with <span className="text-indigo-400 font-mono">@filename</span>.
              </p>

              {/* 2x2 Grid of Quick Actions (stacks to 1 column on mobile) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                {QUICK_PROMPTS.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(item.prompt)}
                    className="p-4 bg-[#172033] hover:bg-[#222E47] border border-[#1F2C42] hover:border-indigo-500/40 rounded-2xl text-left transition group shadow-sm flex flex-col justify-between"
                  >
                    <div className="flex items-center gap-2 mb-1.5 font-semibold text-xs text-slate-200 group-hover:text-indigo-300">
                      {item.icon} {item.title}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                      &quot;{item.prompt.slice(0, 48)}...&quot;
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3.5 ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in duration-200`}
              >
                {msg.role === "assistant" && (
                  <div className="h-8 w-8 rounded-xl bg-indigo-600/90 border border-indigo-400/30 flex items-center justify-center text-white shrink-0 shadow-md">
                    <Bot size={17} />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-sm shadow-md"
                      : "bg-[#172033] border border-[#1F2C42] text-slate-200 rounded-bl-sm shadow-sm prose prose-invert prose-sm max-w-none"
                  }`}
                >
                  {/* 🚀 If the assistant message is empty (still thinking), show 3 bouncing dots */}
                  {msg.role === "assistant" && msg.content === "" ? (
                    <div className="flex items-center gap-1.5 py-1 px-0.5">
                      <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce"></span>
                      <span className="text-xs text-indigo-300/80 ml-2 font-medium tracking-wide">Thinking...</span>
                    </div>
                  ) : (
                    <>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                      {/* Blinking cursor while generating */}
                      {isThinking && msg.role === "assistant" && idx === messages.length - 1 && (
                        <span className="inline-block w-1.5 h-3.5 ml-1 bg-indigo-400 animate-pulse align-middle rounded-sm" />
                      )}
                    </>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="h-8 w-8 rounded-xl bg-slate-700 border border-slate-600 flex items-center justify-center text-white shrink-0">
                    <User size={17} />
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Attached Files Chips */}
        {attachedFiles.length > 0 && (
          <div className="px-4 sm:px-6 pb-2 flex gap-2 flex-wrap">
            {attachedFiles.map((file, i) => (
              <span
                key={i}
                className="text-xs bg-[#172033] border border-indigo-500/40 text-indigo-300 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm"
              >
                <FileText size={12} /> {file.name}
                <button
                  onClick={() => setAttachedFiles(attachedFiles.filter((_, idx) => idx !== i))}
                  className="hover:text-red-400 ml-1"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* @ Mention Suggestion Popover */}
        {showMentions && mentionFilteredDocs.length > 0 && (
          <div className="absolute bottom-20 left-4 sm:left-6 right-4 sm:right-auto z-50 sm:w-80 bg-[#172033] border border-[#1F2C42] rounded-xl shadow-2xl overflow-hidden backdrop-blur-md">
            <div className="p-2.5 text-[11px] font-semibold text-slate-400 border-b border-[#1F2C42] bg-[#0F1420]/60">
              Mention document to filter search:
            </div>
            <div className="max-h-52 overflow-y-auto">
              {mentionFilteredDocs.slice(0, 6).map((doc) => (
                <button
                  key={doc.name}
                  onClick={() => insertMention(doc.name)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[#222E47] text-slate-200 flex items-center gap-2.5 transition truncate"
                >
                  <FileCheck size={14} className="text-indigo-400 shrink-0" />
                  <span className="truncate">{doc.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 sm:p-4 border-t border-[#1F2C42] bg-[#0F1420]"
        >
          <div className="flex items-center gap-2 bg-[#172033] border border-[#1F2C42] rounded-2xl px-3 py-2.5 focus-within:border-indigo-500 transition shadow-inner">
            <label
              className={`cursor-pointer text-slate-400 hover:text-indigo-400 transition p-1 rounded-lg hover:bg-[#222E47] shrink-0 ${
                DEMO_MODE ? "cursor-not-allowed opacity-40 hover:text-slate-400" : ""
              }`}
              title={DEMO_MODE ? "Attachments are disabled in demo mode" : "Attach files"}
            >
              <Paperclip size={18} />
              <input
                type="file"
                multiple
                disabled={DEMO_MODE}
                className="hidden"
                accept=".pdf,.txt,.docx,.md"
                onChange={(e) => {
                  if (e.target.files) {
                    setAttachedFiles(Array.from(e.target.files));
                  }
                }}
              />
            </label>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about your documents — use @filename to focus on one file..."
              className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none text-slate-100 placeholder:text-slate-500"
              disabled={isThinking}
            />

            {isThinking ? (
              <button
                type="button"
                onClick={handleStop}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
              >
                <Square size={12} className="fill-red-400" /> <span className="hidden sm:inline">Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() && attachedFiles.length === 0}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm shrink-0"
              >
                <Send size={13} /> <span className="hidden sm:inline">Send</span>
              </button>
            )}
          </div>
        </form>
      </main>

      {/* 🗑️ CUSTOM DELETE CONFIRMATION MODAL */}
      {docToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-[#0F1420] border border-[#1F2C42] w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center relative animate-in zoom-in-95 duration-150">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3 shadow-lg shadow-red-500/5">
              <AlertTriangle size={24} />
            </div>

            <h3 className="text-base font-bold text-slate-100">Remove Document?</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Are you sure you want to remove <span className="font-semibold text-slate-200 truncate inline-block max-w-[200px] align-bottom">&quot;{docToDelete}&quot;</span>? This will delete both the file and its vector index.
            </p>

            <div className="grid grid-cols-2 gap-2.5 mt-5">
              <button
                onClick={() => setDocToDelete(null)}
                disabled={isDeleting}
                className="w-full bg-[#172033] hover:bg-[#222E47] text-slate-300 border border-[#1F2C42] py-2 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-lg shadow-red-600/20"
              >
                {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ℹ️ ABOUT MODAL */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-[#0F1420] border border-[#1F2C42] w-full max-w-md rounded-2xl p-6 shadow-2xl text-center relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowAbout(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition"
            >
              <X size={18} />
            </button>

            {/* Glowing Logo */}
            <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 p-2 flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/10">
              <img
                src="/logo.png"
                alt="Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.parentElement?.classList.add("flex-col");
                }}
              />
              <Bot size={30} className="text-indigo-400" />
            </div>

            <h3 className="text-xl font-bold text-slate-100">{APP_NAME}</h3>
            <p className="text-xs text-indigo-400 font-semibold mt-0.5">Version {APP_VERSION}</p>

            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              A personal AI-powered document workspace for searching, indexing, and interacting with your knowledge base.
            </p>

            <div className="h-px bg-[#1F2C42] my-4" />

            <p className="text-[11px] font-bold text-slate-400 tracking-wider mb-2.5 uppercase">
              Built With
            </p>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {TECH_STACK.map((tech) => (
                <div
                  key={tech}
                  className="bg-[#172033] border border-[#1F2C42] text-indigo-200 text-xs py-1.5 px-2 rounded-lg font-medium"
                >
                  {tech}
                </div>
              ))}
            </div>

            <p className="text-xs font-semibold text-slate-300">
              Developed by {APP_AUTHOR}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-5">
              &copy; {APP_YEAR}
            </p>

            <button
              onClick={() => setShowAbout(false)}
              className="w-full bg-[#172033] hover:bg-[#222E47] text-slate-200 border border-[#1F2C42] py-2 rounded-xl text-xs font-bold transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}