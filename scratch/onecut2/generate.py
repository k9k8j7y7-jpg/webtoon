"""한 컷 광고 + 설명 장치(process) 합성 scratch — GPT 1:1 1024, 3장.

코드·DB 변경 없음. 운영 코드의 함수를 그대로 import해 프롬프트를 조립하고,
scratch에서만 문자열을 바꾼다(글자 금지 → 허용 문구, 제품 없음).

실행: cd scratch/onecut2 && ../../backend/venv/Scripts/python generate.py   (또는 아무 python + backend 의존성)
입력: in/preset53_front.png (프리셋 53 정면 시트), in/kooko.jpg (레이아웃 참조)
출력: out/onecut2_{1,2,3}.png, out/grid.png, out/prompt.txt, out/results.json
"""
import os, sys, io, json, time, asyncio

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, "..", "..", "backend")
sys.path.insert(0, BACKEND)
os.chdir(BACKEND)  # .env 로드 경로

from PIL import Image
from app.adapters.openai_image import OpenAIImageAdapter
from app.prompts.service import build_cut_prompt
from app.prompts.copy_render import build_copy_clause, check_copy_text
from app.prompts import explain as EX
from app.styles.models import STYLE_PRESETS

IN = os.path.join(HERE, "in")
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

CHAR_SHEET = os.path.join(IN, "preset53_front.png")
LAYOUT_REF = os.path.join(IN, "kooko.jpg")

HEAD = "보고서를 올리면, 차트·요약·슬라이드까지."
SUB = "한 시간짜리 보고 업무, 이제 프롬프트 하나로"
LABELS = ["파일 업로드", "차트 생성", "요약 생성", "슬라이드 생성"]
COPY_DESIGN = {"font": "bold_gothic", "position": "top"}
N = 3

# 프리셋 53 (characters.id=53, ref_key=preset_woman) — DB 값 그대로
CHAR_ID = "preset_woman"
CHAR_DESCS = {
    CHAR_ID: {
        "name": "여성",
        "appearance_en": (
            "Young Korean woman in her mid-20s, shoulder-length black hair with a slight wave, "
            "warm brown eyes, slim build, casual modern clothing, friendly natural expression"
        ),
        "is_photo_real": False,
    }
}

# ONECUT_AD_SYSTEM_INSTRUCTION 형식의 1씬 1컷 명세 (모델 1명, bust — 설명 컷 bust 고정과 일치)
CUT_SPEC = {
    "cut_number": 1,
    "kind": "explain",
    "device": "process",
    "labels": LABELS,
    "characters": [{
        "character_id": CHAR_ID,
        "emotion": "smile",
        "pose": "sitting at a desk in front of an open laptop, one hand gesturing toward the process panels like a friendly guide",
        "outfit": "default",
    }],
    "shot": "bust",
    "action": (
        "An office worker sits at her desk in a bright modern office, laptop open in front of her, "
        "confidently guiding the viewer through how one prompt turns a report into charts, a summary and slides"
    ),
    "dialogue": [],
    "emphasis": "normal",
}


def build_process_clause_4(labels: list[str]) -> str:
    """explain._build_process 템플릿 문구 유지 + 라벨 4개 + 제품 대신 노트북 앞 직장인 가이드.

    운영 _build_process는 labels[:3]으로 자르므로 scratch에서 4패널로 확장.
    """
    panel_lines = [f"Panel {i+1}: {lbl}" for i, lbl in enumerate(labels)]
    return (
        "DEVICE: Process mini-panels — the character, an office worker at her laptop, presents the workflow. "
        f"{len(labels)} small panels in sequence (left to right, connected by arrows) showing how it works: "
        f"{'. '.join(panel_lines)}. "
        "Draw each panel as a simple icon-style diagram in webtoon style "
        "(document upload, bar chart, summary text lines, presentation slide). "
        "Each panel has its Korean label."
    )


def build_explain_head_no_product() -> str:
    """explain._COMMON_HEAD에서 제품·글자 금지 문장만 scratch에서 교체."""
    head = EX._COMMON_HEAD
    head = head.replace(
        "The character is the guide — holding or pointing at the product. ",
        "The character is the guide — pointing at the infographic. ",
    )
    head = head.replace("No other text, slogans, signs, or posters with words anywhere in the image. ", "")
    head = head.replace("CRITICAL: reproduce the product label text exactly as on the reference photo. ", "")
    return head


def build_prompt() -> str:
    copy_clause = build_copy_clause(HEAD, SUB, COPY_DESIGN)
    # 글자 금지 문장 제거 (허용 문구는 맨 끝 블록에서)
    copy_clause = copy_clause.replace(". No other text anywhere except the product's own label", "")

    explain_clause = " ".join([build_explain_head_no_product(), build_process_clause_4(LABELS)])

    # follow_layout ON 경로와 동일: ref_ad analysis note 없음(이미지만) → product_desc 비움
    prompt = build_cut_prompt(
        cut_spec=CUT_SPEC,
        character_descs=CHAR_DESCS,
        location_desc=None,
        style_prompt=STYLE_PRESETS["korean_webtoon"]["prompt"],
        project_rules=None,
        aspect_ratio="1:1",
        product_desc="",
        has_photo_real_char=True,  # 광고 purpose → use_gpt=True 경로와 동일
        extra_prompt="",
        copy_clause=copy_clause,
        explain_clause=explain_clause,
        explain_labels=LABELS,
    )

    # 끝 블록: copy 모드 글자 금지 → 허용 문구로 교체
    old_tail = (
        "No speech bubbles. No text except the headline/subline specified above "
        "and the product's own label"
    )
    label_list = ", ".join(f"'{l}'" for l in LABELS)
    new_tail = (
        "No speech bubbles. "
        f"Render ONLY the headline '{HEAD}', the subline '{SUB}' and these labels, "
        f"spelled exactly: {label_list}. No other text"
    )
    assert old_tail in prompt, "copy-mode tail not found — build_cut_prompt changed?"
    return prompt.replace(old_tail, new_tail)


def downscale(b: bytes, max_long_side: int = 768) -> bytes:
    """images.service._downscale_image와 동일."""
    img = Image.open(io.BytesIO(b))
    w, h = img.size
    if max(w, h) <= max_long_side:
        return b
    r = max_long_side / max(w, h)
    img = img.resize((int(w * r), int(h * r)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def main():
    for p in (CHAR_SHEET, LAYOUT_REF):
        if not os.path.exists(p):
            sys.exit(f"MISSING input: {p}")

    prompt = build_prompt()
    with open(os.path.join(OUT, "prompt.txt"), "w", encoding="utf-8") as f:
        f.write(prompt)

    ref_images = [open(CHAR_SHEET, "rb").read(), downscale(open(LAYOUT_REF, "rb").read())]
    ref_labels = [
        f"Character '{CHAR_ID}' (여성) - front reference sheet",
        # images/service.py follow_layout ON 라벨 그대로
        "Advertisement reference — match mood/colors/composition ONLY, "
        "do NOT reproduce any text, logo, or real person from this image",
    ]

    adapter = OpenAIImageAdapter()
    results = []
    for i in range(1, N + 1):
        fname = f"onecut2_{i}.png"
        t1 = time.time()
        try:
            res = await adapter.generate_image(
                prompt=prompt, reference_images=ref_images,
                reference_labels=ref_labels, aspect_ratio="1:1",
            )
            with open(os.path.join(OUT, fname), "wb") as f:
                f.write(res.image_bytes)
            copy_chk = check_copy_text(res.image_bytes, HEAD, SUB)
            label_chk = {lbl: check_copy_text(res.image_bytes, lbl, "").get("head_ok") for lbl in LABELS}
            r = {"file": fname, "ok": True, "sec": round(time.time() - t1, 1),
                 "head_ok": copy_chk["head_ok"], "sub_ok": copy_chk["sub_ok"],
                 "labels": label_chk, "found_text": copy_chk.get("found_text", "")}
        except Exception as e:
            r = {"file": fname, "ok": False, "sec": round(time.time() - t1, 1), "error": str(e)[:200]}
        print(json.dumps(r, ensure_ascii=False), flush=True)
        results.append(r)

    with open(os.path.join(OUT, "results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    imgs = [Image.open(os.path.join(OUT, r["file"])).convert("RGB") for r in results if r["ok"]]
    if imgs:
        w, h = imgs[0].size
        grid = Image.new("RGB", (w * len(imgs), h), "white")
        for k, im in enumerate(imgs):
            grid.paste(im.resize((w, h)), (k * w, 0))
        grid.save(os.path.join(OUT, "grid.png"))
        print("GRID", os.path.join(OUT, "grid.png"))


if __name__ == "__main__":
    asyncio.run(main())
