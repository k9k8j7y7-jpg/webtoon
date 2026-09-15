from fastapi import Depends, HTTPException, status

from app.auth.deps import get_current_user
from app.users.models import User


def require_admin(
    user: User = Depends(get_current_user),
) -> User:
    """관리자 권한 검증. is_admin=false이면 403."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
