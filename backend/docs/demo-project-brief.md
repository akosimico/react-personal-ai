# Personal AI Workspace — Project Brief

## Overview

This project delivers a document question-answering workspace designed for small
project teams. Users can review reference materials, ask natural-language questions,
and receive answers grounded directly in the source documents.

The demo environment runs on a lightweight web service without requiring a local
embedding model. It uses a preloaded reference brief so that reviewers can evaluate
the core experience — search, retrieval, and grounded question answering — without
any setup overhead.

## Key Features

| Feature | Description |
|---|---|
| Document review | Browse and inspect the indexed knowledge base |
| Natural-language Q&A | Ask questions and receive answers sourced from the underlying documents |
| Responsive interface | A collapsible sidebar and adaptive layout ensure a consistent experience across desktop and mobile devices |
| Grounded responses | Answers are generated with direct reference to the uploaded content, reducing the risk of unsupported claims |

## Milestones

| Milestone | Date |
|---|---|
| Prototype review | September 15, 2026 |
| Usability review | September 30, 2026 |
| Public demo | October 7, 2026 |

## Technical Architecture

The demo environment runs in a constrained mode (`DEMO_MODE=true`), optimized for
fast, dependency-light deployment.

The full local deployment includes the complete feature set:

| Capability | Implementation |
|---|---|
| Document uploads | PDF, DOCX, TXT, Markdown |
| Vector search | Chroma |
| Embeddings | Hugging Face models |
| Response generation | Gemini |

These capabilities are available whenever `DEMO_MODE` is set to `false`, enabling a
straightforward path from lightweight demo to full local deployment.