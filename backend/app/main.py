import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# app.* 로거(push/service 등 BackgroundTasks)가 uvicorn 로그에 출력되도록 핸들러 설정
_app_logger = logging.getLogger("app")
if not _app_logger.handlers:
    _app_logger.setLevel(logging.INFO)
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    _app_logger.addHandler(_h)

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
from app.series.router import router as series_router
from app.notices.router import router as notices_router
from app.packets.router import router as packets_router
from app.payments.router import router as payments_router
from app.showcase.router import router as showcase_router
from app.admin.router import router as admin_router
from app.admin.stats_router import router as admin_stats_router
from app.products.router import router as products_router
from app.inquiries.router import router as inquiries_router
from app.social.router import router as social_router
from app.comments.router import router as comments_router
from app.push.router import router as push_router
from app.motion.router import router as motion_router
from app.quick.router import router as quick_router
from app.myworks.router import router as myworks_router
from app.detail.router import router as detail_router

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
app.include_router(series_router, prefix=settings.API_V1_PREFIX)
app.include_router(notices_router, prefix=settings.API_V1_PREFIX)
app.include_router(packets_router, prefix=settings.API_V1_PREFIX)
app.include_router(payments_router, prefix=settings.API_V1_PREFIX)
app.include_router(showcase_router, prefix=settings.API_V1_PREFIX)
app.include_router(admin_router, prefix=settings.API_V1_PREFIX)
app.include_router(admin_stats_router, prefix=settings.API_V1_PREFIX)
app.include_router(products_router, prefix=settings.API_V1_PREFIX)
app.include_router(inquiries_router, prefix=settings.API_V1_PREFIX)
app.include_router(social_router, prefix=settings.API_V1_PREFIX)
app.include_router(comments_router, prefix=settings.API_V1_PREFIX)
app.include_router(push_router, prefix=settings.API_V1_PREFIX)
app.include_router(motion_router, prefix=settings.API_V1_PREFIX)
app.include_router(quick_router, prefix=settings.API_V1_PREFIX)
app.include_router(myworks_router, prefix=settings.API_V1_PREFIX)
app.include_router(detail_router, prefix=settings.API_V1_PREFIX)


import os
from app.storage import LOCAL_STORAGE_DIR


@app.get("/health")
def health_check():
    import subprocess
    from datetime import datetime
    from sqlalchemy import text as sa_text
    from app.database import engine
    # DB check (연결은 with로 즉시 반납)
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(sa_text("SELECT 1"))
        db_ok = True
    except Exception:
        pass
    # Version: 서버는 git 저장소가 아니므로 배포 스크립트가 쓴 backend/VERSION 우선, 없으면 git
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    version = "unknown"
    try:
        with open(os.path.join(backend_dir, "VERSION"), encoding="utf-8") as f:
            version = f.read().strip() or "unknown"
    except Exception:
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                capture_output=True, text=True, timeout=3, cwd=backend_dir,
            )
            if result.returncode == 0:
                version = result.stdout.strip()
        except Exception:
            pass
    return {
        "status": "ok" if db_ok else "degraded",
        "db": "ok" if db_ok else "error",
        "time": datetime.utcnow().isoformat(),
        "version": version,
    }


# ── robots.txt · sitemap.xml ────────────────────────────────────

@app.get("/robots.txt")
def robots_txt():
    from starlette.responses import PlainTextResponse
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /admin\n"
        "Disallow: /my\n"
        "Disallow: /projects\n"
        "Disallow: /quick\n"
        "Disallow: /settings\n"
        "Disallow: /notifications\n"
        "Disallow: /subscriptions\n"
        "Disallow: /inquiries\n"
        "Disallow: /packets\n"
        "Disallow: /api/\n"
        "Disallow: /docs\n"
        "\n"
        f"Sitemap: https://ssagda.com/WEBTOON/sitemap.xml\n"
    )
    return PlainTextResponse(body, media_type="text/plain")


@app.get("/sitemap.xml")
def sitemap_xml():
    from starlette.responses import Response
    from sqlalchemy import text as sa_text
    from app.database import SessionLocal

    base = "https://ssagda.com/WEBTOON"
    urls = [
        (f"{base}/", "daily", "1.0"),
        (f"{base}/terms", "monthly", "0.3"),
        (f"{base}/privacy", "monthly", "0.3"),
        (f"{base}/faq", "monthly", "0.5"),
    ]
    # 공개 뷰어 URL
    db = SessionLocal()
    try:
        rows = db.execute(sa_text(
            "SELECT share_token, COALESCE(published_at, created_at) AS dt "
            "FROM episodes WHERE is_public = 1 AND share_token IS NOT NULL "
            "AND deleted_at IS NULL ORDER BY dt DESC LIMIT 500"
        )).fetchall()
        for r in rows:
            dt = r[1].strftime("%Y-%m-%d") if r[1] else ""
            urls.append((f"{base}/view/{r[0]}", "weekly", "0.6", dt))
        # 작가 페이지
        author_rows = db.execute(sa_text(
            "SELECT DISTINCT u.nickname FROM users u "
            "JOIN episodes e ON e.project_id IN "
            "(SELECT id FROM projects WHERE user_id = u.id AND deleted_at IS NULL) "
            "WHERE e.is_public = 1 AND e.deleted_at IS NULL AND u.nickname IS NOT NULL"
        )).fetchall()
        for r in author_rows:
            urls.append((f"{base}/u/{r[0]}", "weekly", "0.5"))
    except Exception:
        pass
    finally:
        db.close()

    xml_parts = ['<?xml version="1.0" encoding="UTF-8"?>',
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for entry in urls:
        loc, freq, pri = entry[0], entry[1], entry[2]
        lastmod = entry[3] if len(entry) > 3 else ""
        xml_parts.append(f"<url><loc>{loc}</loc><changefreq>{freq}</changefreq><priority>{pri}</priority>"
                         + (f"<lastmod>{lastmod}</lastmod>" if lastmod else "")
                         + "</url>")
    xml_parts.append("</urlset>")
    return Response("\n".join(xml_parts), media_type="application/xml")


# ── OG 크롤러 분기 (/view/{token}) ────────────────────────────

CRAWLER_UA_PATTERNS = ["facebookexternalhit", "kakaotalk", "twitterbot",
                       "slackbot", "slack-imgproxy", "discordbot", "linkedinbot"]
OG_DEFAULT_TITLE = "EziToon — 우리 가게 광고, 웹툰 한 장이면 끝"
OG_DEFAULT_DESC = "카톡·당근·인스타에 올리는 우리 가게 웹툰 광고, 10분이면 완성"
OG_BASE = "https://ssagda.com/WEBTOON"


def _is_crawler(request) -> bool:
    ua = (request.headers.get("user-agent") or "").lower()
    return any(p in ua for p in CRAWLER_UA_PATTERNS)


def _og_html(title: str, desc: str, image: str, url: str) -> str:
    from html import escape
    t, d, i, u = escape(title), escape(desc), escape(image), escape(url)
    return (
        "<!DOCTYPE html><html><head>"
        f'<meta charset="UTF-8">'
        f'<meta property="og:type" content="article">'
        f'<meta property="og:title" content="{t}">'
        f'<meta property="og:description" content="{d}">'
        f'<meta property="og:image" content="{i}">'
        f'<meta property="og:image:width" content="1200">'
        f'<meta property="og:image:height" content="630">'
        f'<meta property="og:url" content="{u}">'
        f'<meta name="twitter:card" content="summary_large_image">'
        f'<meta name="twitter:title" content="{t}">'
        f'<meta name="twitter:description" content="{d}">'
        f'<meta name="twitter:image" content="{i}">'
        f"<title>{t}</title>"
        "</head><body></body></html>"
    )


@app.get("/view/{share_token}")
async def view_og_or_spa(share_token: str, request: Request):
    """크롤러 UA → OG HTML, 일반 → SPA fallback."""
    from starlette.responses import HTMLResponse, FileResponse as StarletteFileResponse

    if not _is_crawler(request):
        return StarletteFileResponse(
            os.path.join(FRONTEND_DIR, "index.html"),
            headers={"Cache-Control": "no-cache"},
        )

    # 크롤러: DB에서 에피소드 정보 가져오기
    from sqlalchemy import text as sa_text
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        row = db.execute(sa_text(
            "SELECT e.id, e.title, e.is_public, "
            "JSON_UNQUOTE(JSON_EXTRACT(e.gate_status, '$.idea_brief.key_message')) AS key_msg, "
            "u.nickname "
            "FROM episodes e "
            "JOIN projects p ON e.project_id = p.id "
            "JOIN users u ON p.user_id = u.id "
            "WHERE e.share_token = :token AND e.deleted_at IS NULL "
            "LIMIT 1"
        ), {"token": share_token}).fetchone()

        if not row or not row[2]:  # 없거나 비공개
            return HTMLResponse(_og_html(OG_DEFAULT_TITLE, OG_DEFAULT_DESC,
                                        f"{OG_BASE}/storage/og-default.jpg",
                                        f"{OG_BASE}/view/{share_token}"))

        ep_id, title, _, key_msg, nickname = row
        desc = key_msg or f"{nickname} 작가의 웹툰"

        # 첫 컷 이미지 → OG 리사이즈 캐시
        cut_row = db.execute(sa_text(
            "SELECT image_url FROM cuts WHERE episode_id = :eid "
            "AND image_url IS NOT NULL ORDER BY cut_number LIMIT 1"
        ), {"eid": ep_id}).fetchone()

        if cut_row and cut_row[0]:
            og_image = _get_og_image(cut_row[0])
        else:
            og_image = f"{OG_BASE}/storage/og-default.jpg"

        return HTMLResponse(_og_html(
            f"{title} — {nickname} | EziToon",
            desc[:200],
            og_image,
            f"{OG_BASE}/view/{share_token}",
        ))
    except Exception:
        return HTMLResponse(_og_html(OG_DEFAULT_TITLE, OG_DEFAULT_DESC,
                                    f"{OG_BASE}/storage/og-default.jpg",
                                    f"{OG_BASE}/view/{share_token}"))
    finally:
        db.close()


def _get_og_image(image_url: str) -> str:
    """컷 이미지 → 1200×630 OG 캐시 URL. 없으면 원본."""
    try:
        from PIL import Image

        # /storage/episodes/183/cuts/ep183_c001_v2.png → 로컬 경로
        rel = image_url.lstrip("/")
        if rel.startswith("storage/"):
            rel = rel[len("storage/"):]
        src_path = os.path.join(LOCAL_STORAGE_DIR, rel)
        if not os.path.isfile(src_path):
            return f"{OG_BASE}{image_url}"

        # 캐시 경로: storage/og_cache/ep183_c001_v2.jpg
        basename = os.path.splitext(os.path.basename(src_path))[0]
        cache_dir = os.path.join(LOCAL_STORAGE_DIR, "og_cache")
        os.makedirs(cache_dir, exist_ok=True)
        cache_path = os.path.join(cache_dir, f"{basename}.jpg")

        if not os.path.isfile(cache_path):
            img = Image.open(src_path)
            w, h = img.size
            target_ratio = 1200 / 630
            current_ratio = w / h
            if current_ratio > target_ratio:
                new_w = int(h * target_ratio)
                left = (w - new_w) // 2
                img = img.crop((left, 0, left + new_w, h))
            else:
                new_h = int(w / target_ratio)
                top = (h - new_h) // 2
                img = img.crop((0, top, w, top + new_h))
            img = img.resize((1200, 630), Image.LANCZOS)
            img.convert("RGB").save(cache_path, "JPEG", quality=85)

        return f"{OG_BASE}/storage/og_cache/{basename}.jpg"
    except Exception:
        return f"{OG_BASE}{image_url}"


# ── 프론트엔드 SPA 서빙 (맨 마지막에 마운트) ──────────────────

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
        # 프론트엔드 정적 파일 서빙 — 해시 파일명(assets/)은 장기 캐시
        file_path = os.path.join(FRONTEND_DIR, path)
        if os.path.isfile(file_path) and not path.endswith("index.html"):
            headers = {"Cache-Control": "public, max-age=31536000, immutable"} if path.startswith("assets/") else None
            if path == "sw.js":  # 서비스워커는 항상 재검증 — 배포 즉시 새 버전 적용
                headers = {"Cache-Control": "no-cache"}
            return StarletteFileResponse(file_path, headers=headers)
        # SPA fallback — index.html은 매번 재검증(no-cache). 캐시 헤더가 없으면 브라우저가 배포 전
        # index.html(→ 옛 번들)을 휴리스틱 캐시로 계속 써서 새 라우팅이 안 보인다(2026-10-09 로고→/my)
        return StarletteFileResponse(
            os.path.join(FRONTEND_DIR, "index.html"),
            headers={"Cache-Control": "no-cache"},
        )
