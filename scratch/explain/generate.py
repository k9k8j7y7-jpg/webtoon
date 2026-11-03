"""설명 컷 scratch — 장치 5종 × 2장 = 10장 GPT 생성."""
import os, sys, time, base64, json, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from app.adapters.openai_image import OpenAIImageAdapter
from PIL import Image
import io

OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)

STORAGE = "/home/bitnami/project-t/storage"
CHAR_SHEET = os.path.join(STORAGE, "presets/preset_woman/front_v1.png")
PRODUCT_PHOTO = os.path.join(STORAGE, "episodes/124/products/21/photo.jpg")

STYLE = (
    "Korean webtoon illustration style with clean black outlines, soft cel-shading, "
    "vibrant but natural colors, detailed expressive eyes, modern casual fashion. "
    "The scene has a warm, friendly tone."
)

CHAR_DESC = (
    "Young Korean woman in her mid-20s, shoulder-length black hair with a slight wave, "
    "warm brown eyes, slim build, casual modern clothing, friendly natural expression"
)

PRODUCT_DESC = (
    "자연바람 아로마 그린티 스파 스캘프 허브 헤어팩, large green bottle with gold cap, "
    "label text: '자연바람' and 'Aroma Green Tea Spa Scalp Herb Hair Pack', 1000g"
)

COMMON_HEAD = (
    f"Advertising explainer panel in {STYLE}. "
    f"The character is: {CHAR_DESC}. She is the guide — holding or pointing at the product. "
    f"Product: {PRODUCT_DESC}. "
    "The infographic element is drawn in the same webtoon line-and-color style, not photo. "
    "All text labels in Korean, spell exactly as specified. "
    "No other text, slogans, signs, or posters with words anywhere in the image. "
    "CRITICAL: reproduce the product label text exactly as on the reference photo."
)

DEVICES = {
    "zoom_inset": (
        f"{COMMON_HEAD} "
        "DEVICE: Zoom inset — the character points at her scalp. A circular inset shows a "
        "cross-section of the scalp with blue cooling particles and flaking dead skin falling off. "
        "Label inside or near the inset: '쿨링 · 각질 제거' in bold Korean text."
    ),
    "icon_badges": (
        f"{COMMON_HEAD} "
        "DEVICE: Icon badges — the character holds the product bottle upright. "
        "Next to her, three circular badge icons: (1) a green leaf icon, label '그린티', "
        "(2) a blue water drop icon, label '보습', (3) a snowflake icon, label '쿨링'. "
        "Each badge has a small Korean label below it."
    ),
    "before_after": (
        f"{COMMON_HEAD} "
        "DEVICE: Before/After split — the panel is split vertically in half. "
        "LEFT side: the character with an uncomfortable expression, a small circular inset shows "
        "red irritated scalp. Label: '사용 전'. "
        "RIGHT side: the same character with a refreshed happy expression, inset shows clean healthy "
        "scalp. Label: '사용 후'. A dividing line separates the two halves."
    ),
    "steps": (
        f"{COMMON_HEAD} "
        "DEVICE: Step mini-panels — the character holds the product at the top. "
        "Below her, three small sequential panels showing usage steps: "
        "Panel 1: applying the product to hair, label '① 도포'. "
        "Panel 2: massaging the scalp with both hands, label '② 마사지 3분'. "
        "Panel 3: rinsing hair under water, label '③ 헹굼'. "
        "Each panel has its Korean label."
    ),
    "size_compare": (
        f"{COMMON_HEAD} "
        "DEVICE: Size comparison — the character holds the large 1000g product bottle with both "
        "hands, smiling. Next to it, a smaller 300g bottle silhouette (gray outline only, generic). "
        "A size arrow or bracket shows the difference. "
        "Label: '1000g 대용량' in bold Korean text near the large bottle."
    ),
}

def load_image_bytes(path):
    with open(path, "rb") as f:
        return f.read()

async def main():
    adapter = OpenAIImageAdapter()
    char_bytes = load_image_bytes(CHAR_SHEET)
    prod_bytes = load_image_bytes(PRODUCT_PHOTO)

    results = []
    total_cost = 0.0
    t0 = time.time()

    for device_key, prompt in DEVICES.items():
        for trial in range(1, 3):
            fname = f"{device_key}_{trial}.png"
            fpath = os.path.join(OUT, fname)
            print(f"\n{'='*60}")
            print(f"Generating {fname} ...")

            t1 = time.time()
            try:
                result = await adapter.generate_image(
                    prompt=prompt,
                    reference_images=[char_bytes, prod_bytes],
                    reference_labels=[
                        f"Character '{CHAR_DESC[:40]}' — front sheet, reproduce this character EXACTLY",
                        f"Product — reference photo, reproduce EXACTLY",
                    ],
                    aspect_ratio="1:1",
                )
                elapsed = time.time() - t1
                cost = 0.073  # approx per image

                # Save
                img_bytes = result.image_bytes
                with open(fpath, "wb") as f:
                    f.write(img_bytes)
                print(f"  Saved: {fpath} ({len(img_bytes)//1024}KB, {elapsed:.1f}s)")

                results.append({
                    "file": fname,
                    "device": device_key,
                    "trial": trial,
                    "elapsed": round(elapsed, 1),
                    "cost": cost,
                    "size_kb": len(img_bytes) // 1024,
                    "ok": True,
                })
                total_cost += cost

            except Exception as e:
                elapsed = time.time() - t1
                print(f"  FAILED: {e} ({elapsed:.1f}s)")
                results.append({
                    "file": fname,
                    "device": device_key,
                    "trial": trial,
                    "elapsed": round(elapsed, 1),
                    "error": str(e)[:100],
                    "ok": False,
                })

    total_time = time.time() - t0

    # Grid montage
    try:
        imgs = []
        for r in results:
            if r["ok"]:
                img = Image.open(os.path.join(OUT, r["file"]))
                imgs.append(img)
        if imgs:
            # 5×2 grid
            w, h = imgs[0].size
            cols, rows = 5, 2
            grid = Image.new("RGB", (w * cols, h * rows), "white")
            for i, img in enumerate(imgs):
                grid.paste(img, ((i % cols) * w, (i // cols) * h))
            grid_path = os.path.join(OUT, "grid.png")
            grid.save(grid_path, quality=90)
            print(f"\nGrid saved: {grid_path}")
    except Exception as e:
        print(f"Grid failed: {e}")

    # Summary
    print(f"\n{'='*60}")
    print(f"Total: {len(results)} images, {total_time:.0f}s, ~${total_cost:.2f}")
    print(f"{'file':<25} {'device':<16} {'trial'} {'time':>5} {'ok'}")
    for r in results:
        print(f"{r['file']:<25} {r['device']:<16} {r['trial']}     {r['elapsed']:>5.1f}  {'✓' if r['ok'] else '✗ '+r.get('error','')[:40]}")

if __name__ == "__main__":
    asyncio.run(main())
