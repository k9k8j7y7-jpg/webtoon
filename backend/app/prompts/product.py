"""제품 프롬프트 — build_product_clause 단일 진입점."""

# size_hint → 영문 상대 표현
_SIZE_PHRASES = {
    "palm": "palm-sized, smaller than a hand",
    "one_hand": "fits in one hand, about hand-length",
    "two_hands": "held with both hands, larger than one hand span",
    "tabletop": "sits on a table, too large to hold in one hand",
    "large": "large object, placed on the ground or table",
}


def build_product_clause(product) -> str:
    """Product ORM 객체 → 컷 프롬프트에 주입할 제품 설명 문자열.

    라벨 글자 재현 지시 + 크기 상대 표현 포함.
    """
    parts = []
    name = product.name or "product"
    parts.append(f"Include this exact product in the scene: '{name}'.")

    # 형태
    if product.shape:
        parts.append(f"Shape: {product.shape}.")

    # 설명 (비전 추출 결과)
    if product.description:
        parts.append(f"Appearance: {product.description}")

    # 라벨 글자 — 핵심
    if product.label_text:
        parts.append(
            f"CRITICAL — reproduce these label texts EXACTLY as printed on the product: "
            f"'{product.label_text}'. Match the text layout, font weight, and color."
        )

    # 크기 — 상대 표현 우선, ratio 있으면 구체적
    size_phrase = _SIZE_PHRASES.get(product.size_hint, _SIZE_PHRASES["one_hand"])
    if product.size_ratio and product.size_ratio > 0:
        parts.append(
            f"Size: {size_phrase}. The product height is about {product.size_ratio:.1f}× "
            f"a character's hand length (wrist to fingertip)."
        )
    else:
        parts.append(f"Size: {size_phrase}.")

    parts.append(
        "Draw the product matching the provided product reference image. "
        "NEVER make the product giant or background-sized. "
        "Show it naturally held, placed on a surface, or used by a character. "
        "Do not redesign the packaging. "
        "No text anywhere in the image except the product's own label; "
        "no slogans, signs, or posters with words."
    )

    return " ".join(parts)
