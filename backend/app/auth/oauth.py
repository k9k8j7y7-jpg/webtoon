import httpx
from dataclasses import dataclass

from app.config import get_settings

settings = get_settings()


@dataclass
class OAuthUserInfo:
    provider: str
    provider_uid: str
    email: str | None
    display_name: str | None


async def exchange_google(code: str) -> OAuthUserInfo:
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_resp.raise_for_status()
        data = user_resp.json()

    return OAuthUserInfo(
        provider="google",
        provider_uid=data["id"],
        email=data.get("email"),
        display_name=data.get("name"),
    )


async def exchange_kakao(code: str) -> OAuthUserInfo:
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.KAKAO_CLIENT_ID,
                "client_secret": settings.KAKAO_CLIENT_SECRET,
                "redirect_uri": settings.KAKAO_REDIRECT_URI,
                "code": code,
            },
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        user_resp = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_resp.raise_for_status()
        data = user_resp.json()

    kakao_account = data.get("kakao_account", {})
    profile = kakao_account.get("profile", {})

    return OAuthUserInfo(
        provider="kakao",
        provider_uid=str(data["id"]),
        email=kakao_account.get("email"),
        display_name=profile.get("nickname"),
    )


async def exchange_naver(code: str) -> OAuthUserInfo:
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://nid.naver.com/oauth2.0/token",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.NAVER_CLIENT_ID,
                "client_secret": settings.NAVER_CLIENT_SECRET,
                "code": code,
            },
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        user_resp = await client.get(
            "https://openapi.naver.com/v1/nid/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_resp.raise_for_status()
        data = user_resp.json()["response"]

    return OAuthUserInfo(
        provider="naver",
        provider_uid=data["id"],
        email=data.get("email"),
        display_name=data.get("name") or data.get("nickname"),
    )


EXCHANGE_HANDLERS = {
    "google": exchange_google,
    "kakao": exchange_kakao,
    "naver": exchange_naver,
}
