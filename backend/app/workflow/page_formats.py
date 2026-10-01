"""페이지 형식 정의 — 단일 소스 (백엔드).

프론트엔드 동일: frontend/src/utils/pageFormats.js
"""

PAGE_FORMATS = {
    "vertical":  {"label": "세로 웹툰", "cols": 1, "rows": None, "cell_ratio": None,   "per_page": None, "page_ratio": None,  "gap": 0,  "border": 0},
    "grid_2x2":  {"label": "2x2 페이지", "cols": 2, "rows": 2,  "cell_ratio": "1:1",  "per_page": 4,    "page_ratio": "1:1", "gap": 12, "border": 1},
    "strip_3":   {"label": "3단 페이지", "cols": 1, "rows": 3,  "cell_ratio": "16:9", "per_page": 3,    "page_ratio": "3:4", "gap": 12, "border": 1},
}

FORMAT_KEYS = list(PAGE_FORMATS.keys())
DEFAULT_FORMAT = "vertical"
