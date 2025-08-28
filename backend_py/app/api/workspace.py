from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select
from ..models.db import SessionLocal
from ..models.schemas import Workspace

router = APIRouter(prefix="/workspace", tags=["workspace"])

class WorkspaceBody(BaseModel):
    key: str
    json: dict

@router.get("/{key}")
def get_ws(key: str):
    with SessionLocal() as s:
        row = s.execute(select(Workspace).where(Workspace.key==key)).scalar_one_or_none()
        return {"key": key, "json": (row.json if row else "{}")}

@router.put("")
def set_ws(b: WorkspaceBody):
    import json as pyjson
    js = pyjson.dumps(b.json)
    with SessionLocal() as s:
        row = s.execute(select(Workspace).where(Workspace.key==b.key)).scalar_one_or_none()
        if row:
            row.json = js
        else:
            s.add(Workspace(key=b.key, json=js))
        s.commit()
        return {"ok": True}
