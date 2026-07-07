"""KGInspector FastAPI application.

Run with Granian (recommended):
    granian --interface asgi src.backend.app:app --port 8000 --workers 4

Or with Uvicorn (dev):
    uvicorn src.backend.app:app --reload --port 8000
"""

from __future__ import annotations

import warnings
warnings.filterwarnings(
    "ignore",
    message=".*hashes produced for directed graphs changed.*",
    category=UserWarning,
    module="networkx",
)

import asyncio
import json
import logging
import os
import pathlib
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from .types import DiffOptions

_PROCESS_POOL: ProcessPoolExecutor | None = None
_THREAD_POOL: ThreadPoolExecutor | None = None

_CPU_COUNT = os.cpu_count() or 4


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    global _PROCESS_POOL, _THREAD_POOL
    logger.info("Starting KGInspector (cpus=%d, process_workers=%d, thread_workers=%d)",
                _CPU_COUNT, _CPU_COUNT, _CPU_COUNT * 4)
    _PROCESS_POOL = ProcessPoolExecutor(max_workers=_CPU_COUNT)
    _THREAD_POOL = ThreadPoolExecutor(max_workers=_CPU_COUNT * 4)
    yield
    logger.info("Shutting down worker pools")
    _PROCESS_POOL.shutdown(wait=False)
    _THREAD_POOL.shutdown(wait=False)


app = FastAPI(title="KGInspector API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

_EXTRA_HEADERS = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "X-Accel-Buffering": "no",
    "Cache-Control": "no-cache",
}


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    for k, v in _EXTRA_HEADERS.items():
        response.headers[k] = v
    return response


class GraphRequest(BaseModel):
    old: str
    new: str
    limit: int | None = None
    rename_limit: int = 1000
    compute_bc: bool = True
    max_nodes: int = 100_000
    page_size: int = 10_000
    bnode_gw_enabled: bool = True


class ParseRequest(BaseModel):
    data: str
    format: str | None = None


def _opts_from_request(body: GraphRequest, **overrides) -> DiffOptions:
    return DiffOptions(
        limit=body.limit,
        rename_limit=body.rename_limit,
        compute_bc=body.compute_bc,
        bnode_gw_enabled=body.bnode_gw_enabled,
        **overrides,
    )


def _diff_worker(old: str, new: str, opts: DiffOptions):
    from src.backend.diff.pipeline import diff as _diff
    return _diff(old, new, opts)


def _build_response_worker(diff_result, max_nodes: int) -> dict[str, Any]:
    from src.backend.views.graph import build_graph_response
    return build_graph_response(diff_result, max_nodes)


def _parse_worker(data: str, fmt: str | None) -> dict[str, Any]:
    from src.backend.views.parse import parse_rdf
    return parse_rdf(data, fmt)


def _paginate_diff(result, page_size: int):
    """Yield dicts representing pages of the diff result."""
    added = list(result.triples_added)
    deleted = list(result.triples_deleted)

    max_pages = max(
        (len(added) + page_size - 1) // page_size,
        (len(deleted) + page_size - 1) // page_size,
        1,
    )

    for i in range(max_pages):
        chunk: dict[str, Any] = {}
        start = i * page_size

        added_page = added[start : start + page_size]
        deleted_page = deleted[start : start + page_size]

        if added_page:
            chunk["triples_added"] = added_page
        if deleted_page:
            chunk["triples_deleted"] = deleted_page

        # Emit all semantic-change lists in the first chunk
        if i == 0:
            if result.literal_changed:
                chunk["literal_changed"] = result.literal_changed
            if result.subject_changed:
                chunk["subject_changed"] = result.subject_changed
            if result.predicate_changed:
                chunk["predicate_changed"] = result.predicate_changed
            if result.object_changed:
                chunk["object_changed"] = result.object_changed
            if result.compound_changed:
                chunk["compound_changed"] = result.compound_changed
            if result.node_renamed:
                chunk["node_renamed"] = result.node_renamed

        if chunk:
            yield chunk


@app.post("/api/view/graph")
async def view_graph(body: GraphRequest) -> JSONResponse:
    """Compute full diff and return complete GraphResponse with layout positions."""
    loop = asyncio.get_running_loop()
    t0 = time.perf_counter()
    logger.info("view_graph request: old=%d chars, new=%d chars, max_nodes=%d",
                len(body.old), len(body.new), body.max_nodes)

    opts = _opts_from_request(body)

    try:
        diff_result = await loop.run_in_executor(_PROCESS_POOL, _diff_worker, body.old, body.new, opts)
        dt_diff = time.perf_counter() - t0
        logger.info("diff computed in %.2fs: is_empty=%s, added=%d, deleted=%d, literal_changed=%d, "
                    "subject_changed=%d, predicate_changed=%d, object_changed=%d, compound_changed=%d, "
                    "node_renamed=%d",
                    dt_diff, diff_result.is_empty,
                    len(diff_result.triples_added), len(diff_result.triples_deleted),
                    len(diff_result.literal_changed), len(diff_result.subject_changed),
                    len(diff_result.predicate_changed), len(diff_result.object_changed),
                    len(diff_result.compound_changed), len(diff_result.node_renamed))

        response = await loop.run_in_executor(_THREAD_POOL, _build_response_worker, diff_result, body.max_nodes)
        dt_total = time.perf_counter() - t0
        nodes = len(response.get("nodes", []))
        edges = len(response.get("edges", []))
        logger.info("view_graph complete in %.2fs: nodes=%d, edges=%d", dt_total, nodes, edges)
        return JSONResponse(content=response)
    except Exception:
        logger.exception("view_graph failed after %.2fs", time.perf_counter() - t0)
        raise


@app.post("/api/diff/stream")
async def diff_stream(body: GraphRequest, request: Request) -> StreamingResponse:
    """Stream diff results as newline-delimited JSON.

    Chunk sequence:
        {"type": "heartbeat"}            — immediate, signals connection is alive
        {"type": "stats", ...counts}     — after diff completes, before chunks
        {"type": "chunk", ...diff_data}  — one or more data chunks
        {"type": "done"}                 — terminal sentinel
    """
    loop = asyncio.get_running_loop()

    opts = _opts_from_request(body, page_size=body.page_size)

    async def generate() -> AsyncGenerator[str, None]:
        yield json.dumps({"type": "heartbeat"}) + "\n"

        diff_result = await loop.run_in_executor(
            _PROCESS_POOL, _diff_worker, body.old, body.new, opts
        )

        if await request.is_disconnected():
            return

        yield json.dumps({
            "type": "stats",
            "triples_added": len(diff_result.triples_added),
            "triples_deleted": len(diff_result.triples_deleted),
            "literal_changed": len(diff_result.literal_changed),
            "subject_changed": len(diff_result.subject_changed),
            "predicate_changed": len(diff_result.predicate_changed),
            "object_changed": len(diff_result.object_changed),
            "compound_changed": len(diff_result.compound_changed),
            "node_renamed": len(diff_result.node_renamed),
            "is_empty": diff_result.is_empty,
        }) + "\n"

        if diff_result.is_empty:
            yield json.dumps({"type": "done"}) + "\n"
            return

        for chunk in _paginate_diff(diff_result, body.page_size):
            if await request.is_disconnected():
                break
            yield json.dumps({"type": "chunk", **chunk}) + "\n"
            # Yield control back to event loop between chunks
            await asyncio.sleep(0)

        if not await request.is_disconnected():
            view_response = await loop.run_in_executor(
                _THREAD_POOL, _build_response_worker, diff_result, body.max_nodes
            )
            yield json.dumps({"type": "view", **view_response}) + "\n"

        yield json.dumps({"type": "done"}) + "\n"

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers=_EXTRA_HEADERS,
    )


@app.post("/api/parse")
async def parse_graph(body: ParseRequest) -> JSONResponse:
    """Parse a single RDF document into nodes/edges/stats."""
    loop = asyncio.get_running_loop()
    t0 = time.perf_counter()
    logger.info("parse request: data=%d chars, format=%s", len(body.data), body.format)
    try:
        result = await loop.run_in_executor(_THREAD_POOL, _parse_worker, body.data, body.format)
        logger.info("parse complete in %.2fs: nodes=%d, edges=%d",
                    time.perf_counter() - t0,
                    len(result.get("nodes", [])), len(result.get("edges", [])))
        return JSONResponse(content=result)
    except Exception:
        logger.exception("parse failed after %.2fs", time.perf_counter() - t0)
        raise


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


_FRONTEND_DIR = pathlib.Path(__file__).resolve().parent.parent / "frontend" / "dist"

if _FRONTEND_DIR.is_dir():
    from starlette.responses import FileResponse
    from starlette.staticfiles import StaticFiles

    _assets_dir = _FRONTEND_DIR / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="frontend-assets")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        """Serve static files or fall back to index.html for SPA routing."""
        candidate = _FRONTEND_DIR / path
        if path and ".." not in path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_FRONTEND_DIR / "index.html")
