"""상품 정의 — 단일 소스. 추후 DB 이전 대비 분리."""

PRODUCTS = {
    "packet_30": {
        "code": "packet_30",
        "name": "30 패킷",
        "packets": 30,
        "amount": 5900,
    },
    "packet_100": {
        "code": "packet_100",
        "name": "100 패킷",
        "packets": 100,
        "amount": 14900,
    },
    "packet_300": {
        "code": "packet_300",
        "name": "300 패킷",
        "packets": 300,
        "amount": 34900,
    },
}


def get_product(code: str) -> dict | None:
    return PRODUCTS.get(code)


def list_products() -> list[dict]:
    return list(PRODUCTS.values())
