from fastapi import APIRouter, Depends

from app.auth.deps import get_current_user
from app.users.models import User

router = APIRouter(tags=["users"])


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "display_name": current_user.display_name,
        "email": current_user.email,
        "provider": current_user.provider,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }
