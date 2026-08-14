from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.auth.router import router as auth_router
from app.users.router import router as users_router
from app.projects.router import router as projects_router
from app.story.router import router as story_router
from app.script.router import router as script_router
from app.characters.router import router as characters_router
from app.locations.router import router as locations_router
from app.styles.router import router as styles_router
from app.workflow.router import router as workflow_router
from app.storyboard.router import router as storyboard_router
from app.images.router import router as images_router
from app.billing.router import router as billing_router
from app.export.router import router as export_router

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    docs_url="/docs",
    redoc_url="/redoc",
    root_path="/WEBTOON",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(users_router, prefix=settings.API_V1_PREFIX)
app.include_router(projects_router, prefix=settings.API_V1_PREFIX)
app.include_router(story_router, prefix=settings.API_V1_PREFIX)
app.include_router(script_router, prefix=settings.API_V1_PREFIX)
app.include_router(characters_router, prefix=settings.API_V1_PREFIX)
app.include_router(locations_router, prefix=settings.API_V1_PREFIX)
app.include_router(styles_router, prefix=settings.API_V1_PREFIX)
app.include_router(workflow_router, prefix=settings.API_V1_PREFIX)
app.include_router(storyboard_router, prefix=settings.API_V1_PREFIX)
app.include_router(images_router, prefix=settings.API_V1_PREFIX)
app.include_router(billing_router, prefix=settings.API_V1_PREFIX)
app.include_router(export_router, prefix=settings.API_V1_PREFIX)


import os
from app.storage import LOCAL_STORAGE_DIR


@app.get("/health")
def health_check():
    return {"status": "ok"}


# 프론트엔드 SPA 서빙 (맨 마지막에 마운트)
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.isdir(FRONTEND_DIR):
    from starlette.responses import FileResponse as StarletteFileResponse

    # SPA fallback + 정적 파일 통합 서빙
    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        # storage 파일 서빙
        if path.startswith("storage/") and os.path.isdir(LOCAL_STORAGE_DIR):
            storage_path = os.path.join(LOCAL_STORAGE_DIR, path[len("storage/"):])
            if os.path.isfile(storage_path):
                return StarletteFileResponse(storage_path)
        # 프론트엔드 정적 파일 서빙
        file_path = os.path.join(FRONTEND_DIR, path)
        if os.path.isfile(file_path):
            return StarletteFileResponse(file_path)
        # SPA fallback
        return StarletteFileResponse(os.path.join(FRONTEND_DIR, "index.html"))
