from sqlalchemy import Column, BigInteger, String, Enum, ForeignKey, UniqueConstraint

from app.database import Base


STYLE_PRESETS = {
    # 코어 3개 (PRD 5.1)
    "korean_webtoon": {
        "tier": "core",
        "label": "한국 웹툰체 (네이버풍)",
        "prompt": "Korean webtoon style, clean line art, cel shading, natural skin tones, soft shadows, vertical scroll optimized",
    },
    "romance": {
        "tier": "core",
        "label": "순정/로맨스체",
        "prompt": "Shoujo romance webtoon style, big expressive eyes, thin delicate lines, pastel and pink tones, soft lighting, dreamy atmosphere",
    },
    "sd_gag": {
        "tier": "core",
        "label": "SD/개그체",
        "prompt": "Super deformed chibi style, 2-3 head proportions, exaggerated expressions, simple bold lines, comedic webtoon style",
    },
    # 확장 베타 (PRD 5.1)
    "kakao_webtoon": {"tier": "beta", "label": "카카오웹툰풍", "prompt": "Kakao webtoon style, vivid colors, strong contrast shadows, dramatic lighting"},
    "action_shonen": {"tier": "beta", "label": "소년만화", "prompt": "Shonen action manga style, dynamic poses, speed lines, bold ink lines, dramatic angles"},
    "semi_realistic": {"tier": "beta", "label": "반실사", "prompt": "Semi-realistic illustration style, detailed rendering, realistic proportions, painterly texture"},
    "anime": {"tier": "beta", "label": "아니메풍", "prompt": "Japanese anime style, bright colors, large eyes, clean cel shading, vibrant"},
    "watercolor": {"tier": "beta", "label": "수채화", "prompt": "Watercolor painting style, soft edges, transparent colors, artistic brushstrokes, delicate"},
    "pixel_art": {"tier": "beta", "label": "픽셀아트", "prompt": "Pixel art style, 16-bit retro game aesthetic, clean pixels, limited color palette"},
    "fantasy_rpg": {"tier": "beta", "label": "판타지 RPG", "prompt": "Fantasy RPG illustration style, epic, detailed armor and weapons, magical lighting effects"},
    "cyberpunk": {"tier": "beta", "label": "네온 사이버펑크", "prompt": "Cyberpunk neon style, dark atmosphere, neon lights, futuristic city, high contrast"},
    "storybook": {"tier": "beta", "label": "그림책풍", "prompt": "Children's storybook illustration style, warm colors, soft shapes, whimsical, gentle lines"},
    "emotional_romance": {"tier": "beta", "label": "감성로맨스", "prompt": "Emotional romance webtoon style, soft pastel tones, delicate expressions, warm ambient lighting, gentle gradients, intimate mood"},
    "marvel": {"tier": "beta", "label": "마블풍", "prompt": "Marvel comics inspired style, bold dynamic composition, strong muscular proportions, dramatic shadows, vibrant saturated colors, action-packed"},
    "western_fantasy": {"tier": "beta", "label": "서양판타지", "prompt": "Western fantasy illustration style, painterly rendering, medieval European aesthetic, dramatic lighting, rich earth tones, detailed environments"},
}


class Style(Base):
    __tablename__ = "styles"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    episode_id = Column(BigInteger, ForeignKey("episodes.id"), nullable=False)
    preset_key = Column(String(50), nullable=False)
    tier = Column(Enum("core", "beta", name="style_tier_enum"), default="core")
    prompt_snippet = Column(String(2000), nullable=True)

    __table_args__ = (
        UniqueConstraint("episode_id", name="uq_episode_style"),
    )
