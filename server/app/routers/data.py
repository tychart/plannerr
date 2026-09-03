"""Data transfer routes: export and import the user's items as JSON.

- ``GET  /data/export`` — full snapshot (classes + every item) as JSON.
- ``POST /data/import`` — additive merge of a backup file; returns a report
  (imported / duplicate-skipped counts, created classes, skipped rows).

Both are scoped to the logged-in user and never touch other users' data.
"""

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import ImportBackupIn, ImportReportOut
from app.services.backup import BACKUP_FORMAT, build_export, import_backup

router = APIRouter()


@router.get("/export")
async def export_data(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Download everything the user owns as a JSON backup file."""
    payload = await build_export(db, user)
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": "attachment; filename=plannerr-backup.json"},
    )


@router.post("/import", response_model=ImportReportOut, status_code=status.HTTP_200_OK)
async def import_data(
    payload: ImportBackupIn,
    tz: str = Query(default="UTC", max_length=64, description="IANA timezone for date-only values"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ImportReportOut:
    """Merge a backup file into the user's data (additive, duplicate-safe)."""
    return await import_backup(db, user, payload.model_dump(), tz)
