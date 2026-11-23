"""야간 점검 봇.

사용법:
    cd /home/bitnami/project-t/backend
    source venv/bin/activate
    python -m app.admin.nightly_check

cron: 30 18 * * *   (18:30 UTC = 03:30 KST, 백업 04:10 KST 전)
"""

import json
import logging
import socket
import ssl
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import text

from app.database import SessionLocal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("nightly_check")

BASE_URL = "http://127.0.0.1:8000"
EXTERNAL_URL = "https://ssagda.com/WEBTOON"
HOSTNAME = "ssagda.com"

# 테스트 계정
TEST_USER_ID = 1

# ── 개별 점검 함수 (봇 전용) ─────────────────────────────────────


def check_http() -> dict:
    """외부 URL 200 + /health JSON ok + 응답 시간."""
    try:
        with httpx.Client(timeout=10, verify=True, follow_redirects=True) as c:
            # 1. 메인 페이지 200
            t0 = time.time()
            r = c.get(EXTERNAL_URL + "/")
            main_ms = int((time.time() - t0) * 1000)
            if r.status_code != 200:
                return {"key": "http", "status": "fail",
                        "value": f"main {r.status_code}",
                        "detail": f"{EXTERNAL_URL}/ → {r.status_code} ({main_ms}ms)"}

            # 2. health JSON
            t0 = time.time()
            r2 = c.get(EXTERNAL_URL + "/health")
            health_ms = int((time.time() - t0) * 1000)
            if r2.status_code != 200:
                return {"key": "http", "status": "fail",
                        "value": f"health {r2.status_code}",
                        "detail": f"health → {r2.status_code}"}

            body = r2.json()
            if body.get("status") != "ok" or body.get("db") != "ok":
                return {"key": "http", "status": "fail",
                        "value": "health not ok",
                        "detail": json.dumps(body, ensure_ascii=False)[:200]}

            total_ms = main_ms + health_ms
            if total_ms > 5000:
                return {"key": "http", "status": "warn",
                        "value": f"{total_ms}ms",
                        "detail": f"main {main_ms}ms + health {health_ms}ms (느림)"}
            if total_ms > 2000:
                return {"key": "http", "status": "warn",
                        "value": f"{total_ms}ms",
                        "detail": f"main {main_ms}ms + health {health_ms}ms"}

            return {"key": "http", "status": "ok",
                    "value": f"{total_ms}ms",
                    "detail": f"main {main_ms}ms + health {health_ms}ms · db={body.get('db')}"}
    except Exception as e:
        return {"key": "http", "status": "fail", "value": "오류", "detail": str(e)[:200]}


def check_ssl() -> dict:
    """SSL 인증서 만료 D-14 warn / D-7 fail."""
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((HOSTNAME, 443), timeout=5) as sock:
            with ctx.wrap_socket(sock, server_hostname=HOSTNAME) as ssock:
                cert = ssock.getpeercert()
                not_after_str = cert["notAfter"]  # 'Nov 30 23:59:59 2026 GMT'
                not_after = datetime.strptime(not_after_str, "%b %d %H:%M:%S %Y %Z")
                days_left = (not_after - datetime.utcnow()).days

                if days_left < 7:
                    return {"key": "ssl", "status": "fail",
                            "value": f"D-{days_left}",
                            "detail": f"만료: {not_after_str}"}
                if days_left < 14:
                    return {"key": "ssl", "status": "warn",
                            "value": f"D-{days_left}",
                            "detail": f"만료: {not_after_str}"}
                return {"key": "ssl", "status": "ok",
                        "value": f"D-{days_left}",
                        "detail": f"만료: {not_after_str}"}
    except Exception as e:
        return {"key": "ssl", "status": "fail", "value": "오류", "detail": str(e)[:200]}


def check_systemd() -> dict:
    """ezitoon-api active + 24h 재시작 횟수."""
    try:
        # is-active
        r = subprocess.run(
            ["systemctl", "is-active", "ezitoon-api"],
            capture_output=True, text=True, timeout=5,
        )
        active = r.stdout.strip()
        if active != "active":
            return {"key": "systemd", "status": "fail",
                    "value": active,
                    "detail": "ezitoon-api not active"}

        # 24h 재시작 횟수 (journalctl)
        r2 = subprocess.run(
            ["journalctl", "-u", "ezitoon-api", "--since", "24 hours ago",
             "--no-pager", "-o", "short-precise"],
            capture_output=True, text=True, timeout=10,
        )
        restart_count = r2.stdout.count("Started ")
        status = "warn" if restart_count >= 3 else "ok"
        return {"key": "systemd", "status": status,
                "value": f"active · 재시작 {restart_count}회",
                "detail": f"24h 내 {restart_count}회 시작 기록"}
    except Exception as e:
        return {"key": "systemd", "status": "fail", "value": "오류", "detail": str(e)[:200]}


def check_cost_today(db) -> dict:
    """어제 API 원가 vs 7일 평균 (3배 이상 warn). 패킷당 원가 299원 초과 warn."""
    try:
        yesterday = (datetime.utcnow() - timedelta(days=1)).date()
        week_ago = yesterday - timedelta(days=6)

        # 어제 원가
        row = db.execute(
            text(
                "SELECT COALESCE(SUM(cost_krw), 0) FROM api_calls "
                "WHERE DATE(created_at) = :d"
            ),
            {"d": yesterday},
        ).fetchone()
        yesterday_cost = int(row[0] or 0)

        # 7일 일평균
        row2 = db.execute(
            text(
                "SELECT COALESCE(SUM(cost_krw), 0), COUNT(DISTINCT DATE(created_at)) "
                "FROM api_calls WHERE DATE(created_at) BETWEEN :s AND :e"
            ),
            {"s": week_ago, "e": yesterday},
        ).fetchone()
        week_total = int(row2[0] or 0)
        week_days = max(int(row2[1] or 1), 1)
        avg_daily = week_total / week_days

        # 패킷당 원가
        row3 = db.execute(
            text(
                "SELECT COALESCE(SUM(cost_krw), 0) FROM api_calls "
                "WHERE purpose NOT IN ('check', 'analysis') "
                "AND DATE(created_at) = :d"
            ),
            {"d": yesterday},
        ).fetchone()
        prod_cost = int(row3[0] or 0)

        row4 = db.execute(
            text(
                "SELECT COALESCE(SUM(ABS(delta)), 0) FROM packet_transactions "
                "WHERE reason = 'generation' AND DATE(created_at) = :d"
            ),
            {"d": yesterday},
        ).fetchone()
        packets_used = int(row4[0] or 0)
        per_packet = round(prod_cost / packets_used) if packets_used > 0 else 0

        warnings = []
        status = "ok"
        if avg_daily > 0 and yesterday_cost > avg_daily * 3:
            warnings.append(f"어제 {yesterday_cost}원 > 7일 평균 {avg_daily:.0f}원의 3배")
            status = "warn"
        if per_packet > 299:
            warnings.append(f"패킷당 {per_packet}원 > 299원")
            status = "warn"

        value = f"{yesterday_cost}원 · {per_packet}원/pkt"
        detail = " | ".join(warnings) if warnings else f"7일 평균 {avg_daily:.0f}원/일"
        return {"key": "cost_today", "status": status, "value": value, "detail": detail}
    except Exception as e:
        return {"key": "cost_today", "status": "fail", "value": "오류", "detail": str(e)[:200]}


def check_model_smoke(db) -> dict:
    """외부 모델 헬스체크 (Gemini 텍스트·비전, GPT 이미지). purpose=check 기록."""
    try:
        from app.config import get_settings
        from app.costs.recorder import record_api_call, set_api_purpose, set_api_user

        settings = get_settings()
        set_api_purpose("check")
        set_api_user(None)

        GEMINI_MODEL = "gemini-2.5-flash"
        checks = []

        from google import genai as _genai
        gemini_client = _genai.Client(api_key=settings.GEMINI_API_KEY)

        # 1. Gemini text
        try:
            t0 = time.time()
            resp = gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents="Reply with just the word 'ok'.",
            )
            dur = int((time.time() - t0) * 1000)
            ok = bool(resp and resp.text)
            try:
                record_api_call(
                    provider="gemini", model=GEMINI_MODEL,
                    kind="text", purpose="check",
                    units={"tokens_in": 10, "tokens_out": 5},
                    duration_ms=dur, status="ok" if ok else "error",
                )
            except Exception:
                pass
            checks.append(("Gemini텍스트", ok, dur))
        except Exception as e:
            checks.append(("Gemini텍스트", False, 0))
            log.warning("model_smoke gemini text: %s", e)

        # 2. Gemini vision (check_copy_text 경로 모델)
        try:
            t0 = time.time()
            resp_v = gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents="Describe what you see: a white square. Reply in one word.",
            )
            dur_v = int((time.time() - t0) * 1000)
            ok_v = bool(resp_v and resp_v.text)
            try:
                record_api_call(
                    provider="gemini", model=GEMINI_MODEL,
                    kind="vision", purpose="check",
                    units={"tokens_in": 15, "tokens_out": 5},
                    duration_ms=dur_v, status="ok" if ok_v else "error",
                )
            except Exception:
                pass
            checks.append(("Gemini비전", ok_v, dur_v))
        except Exception as e:
            checks.append(("Gemini비전", False, 0))
            log.warning("model_smoke gemini vision: %s", e)

        # 3. GPT image
        try:
            from openai import OpenAI
            from app.adapters.openai_image import GPT_IMAGE_MODEL
            oai = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=120.0)
            t0 = time.time()
            resp_gpt = oai.images.generate(
                model=GPT_IMAGE_MODEL,
                prompt="A single white square on a plain white background. Minimal.",
                size="1024x1024", quality="low", n=1,
            )
            dur_gpt = int((time.time() - t0) * 1000)
            ok_gpt = bool(resp_gpt and resp_gpt.data and len(resp_gpt.data) > 0)
            units = {"images": 1}
            if hasattr(resp_gpt, "usage") and resp_gpt.usage:
                usage = resp_gpt.usage
                units["tokens_in"] = getattr(usage, "input_tokens", 0) or 0
                units["tokens_out"] = getattr(usage, "output_tokens", 0) or 0
            try:
                record_api_call(
                    provider="openai", model=GPT_IMAGE_MODEL,
                    kind="image", purpose="check",
                    units=units, duration_ms=dur_gpt,
                    status="ok" if ok_gpt else "error",
                )
            except Exception:
                pass
            checks.append(("GPT이미지", ok_gpt, dur_gpt))
        except Exception as e:
            checks.append(("GPT이미지", False, 0))
            log.warning("model_smoke gpt image: %s", e)

        db.commit()

        all_ok = all(c[1] for c in checks)
        passed = sum(1 for c in checks if c[1])
        detail_parts = [f"{c[0]}={'ok' if c[1] else 'FAIL'} {c[2]}ms" for c in checks]
        return {
            "key": "model_smoke",
            "status": "ok" if all_ok else "fail",
            "value": f"{passed}/{len(checks)} 통과",
            "detail": " · ".join(detail_parts),
        }
    except Exception as e:
        return {"key": "model_smoke", "status": "fail", "value": "오류", "detail": str(e)[:200]}


def check_script_smoke(db) -> dict:
    """테스트 계정(u1)으로 한 컷 광고 에피소드 생성 → 대본 1회 → 삭제.

    대본 500 사고(792c2ae) 재발 방지 — 텍스트 AI 파이프라인 E2E 검증.
    무료(0패킷), 에피소드는 즉시 soft-delete.
    """
    episode_id = None
    try:
        from app.workflow.gate import create_initial_gate_status

        # 1. u1의 default project 찾기
        row = db.execute(
            text(
                "SELECT id FROM projects "
                "WHERE user_id = :uid AND is_default = 1 AND deleted_at IS NULL "
                "LIMIT 1"
            ),
            {"uid": TEST_USER_ID},
        ).fetchone()
        if not row:
            return {"key": "script_smoke", "status": "fail",
                    "value": "프로젝트 없음", "detail": f"u{TEST_USER_ID} default project not found"}
        project_id = row[0]

        # 2. 에피소드 생성 (onecut_ad, gate 1)
        gs = create_initial_gate_status(is_ad=True, purpose="onecut_ad")
        # gate 1→2: planning 데이터 주입 + gate advance
        gs["current_gate"] = 2
        gs["gates"]["1_planning"]["status"] = "approved"
        gs["gates"]["1_planning"]["approved_at"] = datetime.utcnow().isoformat()
        gs["gates"]["2_script"]["status"] = "draft"
        # 최소 idea_brief
        gs["idea_brief"] = {
            "ad_purpose": "제품 인지도",
            "key_message": "야간 점검 테스트",
            "mood": "밝은",
            "target_audience": "테스트",
            "cta": "알아보기",
        }

        # 최소 planning
        planning = {
            "synopsis": "한 여성이 새 화장품을 발견하고 기뻐하는 장면.",
            "characters": [
                {"ref_key": "woman", "name": "여성", "role": "주인공",
                 "age": "20대", "gender": "female",
                 "description": "밝은 표정의 20대 여성"}
            ],
            "world": "현대 도시",
            "scenes": [
                {"scene_no": 1, "summary": "여성이 제품을 들고 웃는다",
                 "location": "거실"}
            ],
        }

        # 에피소드 번호 (기존 최대 +1)
        max_no = db.execute(
            text(
                "SELECT COALESCE(MAX(episode_no), 0) FROM episodes "
                "WHERE project_id = :pid AND deleted_at IS NULL"
            ),
            {"pid": project_id},
        ).scalar() or 0

        result_proxy = db.execute(
            text(
                "INSERT INTO episodes (project_id, episode_no, title, gate_status, script) "
                "VALUES (:pid, :eno, :title, :gs, :script)"
            ),
            {
                "pid": project_id,
                "eno": max_no + 1,
                "title": "__nightly_smoke_test__",
                "gs": json.dumps(gs, ensure_ascii=False),
                "script": json.dumps({"planning": planning}, ensure_ascii=False),
            },
        )
        db.flush()
        episode_id = db.execute(text("SELECT LAST_INSERT_ID()")).scalar()
        db.commit()
        log.info("script_smoke: created episode %s in project %s", episode_id, project_id)

        # 3. POST /script via HTTP (JWT for u1)
        from app.auth.jwt import create_access_token
        token = create_access_token(user_id=TEST_USER_ID)

        t0 = time.time()
        with httpx.Client(timeout=60, base_url=BASE_URL) as c:
            resp = c.post(
                f"/api/v1/projects/{project_id}/episodes/{episode_id}/script",
                headers={"Authorization": f"Bearer {token}"},
                json={},
            )
        dur = int((time.time() - t0) * 1000)

        if resp.status_code == 200:
            body = resp.json()
            scenes = body.get("scenes", [])
            cut_count = sum(len(s.get("cuts", [])) for s in scenes)
            return {
                "key": "script_smoke",
                "status": "ok",
                "value": f"ok {dur}ms",
                "detail": f"scenes={len(scenes)} cuts={cut_count} ({dur}ms)",
            }
        else:
            return {
                "key": "script_smoke",
                "status": "fail",
                "value": f"HTTP {resp.status_code}",
                "detail": resp.text[:200],
            }
    except Exception as e:
        log.exception("script_smoke failed")
        return {"key": "script_smoke", "status": "fail",
                "value": "오류", "detail": str(e)[:200]}
    finally:
        # 4. soft-delete episode
        if episode_id:
            try:
                db.execute(
                    text("UPDATE episodes SET deleted_at = NOW() WHERE id = :eid"),
                    {"eid": episode_id},
                )
                db.commit()
            except Exception:
                log.exception("script_smoke cleanup failed for episode %s", episode_id)
                try:
                    db.rollback()
                except Exception:
                    pass


# ── 메인 실행 ──────────────────────────────────────────────────


def run_nightly():
    """모든 점검 실행 → admin_checks 저장 → 요약 로그."""
    from app.admin.checks import run_all_checks, CHECK_KO

    db = SessionLocal()
    try:
        t0 = time.time()
        now = datetime.utcnow()

        # 1. 기존 점검 (source=bot)
        base_results = run_all_checks(db, source="bot")

        # 2. 봇 전용 추가 점검
        extra_results = []

        # DB 불필요
        for fn in [check_http, check_ssl, check_systemd]:
            try:
                extra_results.append(fn())
            except Exception as e:
                key = fn.__name__.replace("check_", "")
                extra_results.append({
                    "key": key, "status": "fail",
                    "value": "예외", "detail": str(e)[:200],
                })

        # DB 필요
        for fn in [check_cost_today]:
            try:
                extra_results.append(fn(db))
            except Exception as e:
                key = fn.__name__.replace("check_", "")
                extra_results.append({
                    "key": key, "status": "fail",
                    "value": "예외", "detail": str(e)[:200],
                })

        # model_smoke (외부 API 호출, ~200원)
        try:
            extra_results.append(check_model_smoke(db))
        except Exception as e:
            extra_results.append({
                "key": "model_smoke", "status": "fail",
                "value": "예외", "detail": str(e)[:200],
            })

        # script_smoke (대본 E2E)
        try:
            extra_results.append(check_script_smoke(db))
        except Exception as e:
            extra_results.append({
                "key": "script_smoke", "status": "fail",
                "value": "예외", "detail": str(e)[:200],
            })

        # 추가 점검 결과 admin_checks에 저장
        for r in extra_results:
            try:
                db.execute(
                    text(
                        "INSERT INTO admin_checks (run_at, `key`, status, value, detail, source) "
                        "VALUES (:run_at, :key, :status, :value, :detail, :source)"
                    ),
                    {
                        "run_at": now,
                        "key": r["key"],
                        "status": r["status"],
                        "value": r.get("value"),
                        "detail": r.get("detail"),
                        "source": "bot",
                    },
                )
            except Exception:
                log.exception("Failed to save extra check: %s", r["key"])
        try:
            db.commit()
        except Exception:
            log.exception("Failed to commit extra checks")
            db.rollback()

        # 한글 라벨 추가
        for r in extra_results:
            r["run_at"] = now.isoformat()
            ko = CHECK_KO.get(r["key"], {})
            r["label"] = ko.get("label", r["key"])
            r["desc"] = ko.get("desc", "")

        all_results = base_results + extra_results
        elapsed = time.time() - t0

        # 3. 요약
        ok_count = sum(1 for r in all_results if r["status"] == "ok")
        warn_count = sum(1 for r in all_results if r["status"] == "warn")
        fail_count = sum(1 for r in all_results if r["status"] == "fail")

        date_str = now.strftime("%m-%d")
        summary = (
            f"야간 점검 {date_str} · "
            f"정상 {ok_count} / 주의 {warn_count} / 심각 {fail_count} — "
            f"{elapsed:.0f}s"
        )

        # 비용 조회 (purpose=check, 오늘)
        try:
            cost_row = db.execute(
                text(
                    "SELECT COALESCE(SUM(cost_krw), 0) FROM api_calls "
                    "WHERE purpose = 'check' AND DATE(created_at) = :d"
                ),
                {"d": now.date()},
            ).fetchone()
            check_cost = int(cost_row[0] or 0)
        except Exception:
            check_cost = 0

        log.info("=" * 60)
        log.info(summary)
        log.info("소요: %.1fs · 점검 비용: %d원", elapsed, check_cost)
        log.info("-" * 60)
        for r in all_results:
            icon = {"ok": "✓", "warn": "⚠", "fail": "✗"}.get(r["status"], "?")
            log.info("  %s %-16s %s — %s", icon, r["key"], r.get("value", ""), r.get("detail", ""))
        log.info("=" * 60)

        # D 알림 플레이스홀더 — 아직 미구현, 로그만
        log.info("[알림 D 미구현] 요약: %s", summary)

        return {
            "summary": summary,
            "results": all_results,
            "elapsed_sec": round(elapsed, 1),
            "check_cost_krw": check_cost,
        }

    finally:
        db.close()


if __name__ == "__main__":
    result = run_nightly()
    sys.exit(0 if result else 1)
