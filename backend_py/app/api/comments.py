from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete, update
from ..models.db import SessionLocal
from ..models.schemas import Comment

router = APIRouter(prefix="/comments", tags=["comments"])

class CommentBody(BaseModel):
    lon: float
    lat: float
    title: str = ""
    body: str = ""
    color: str = "#10b981"

@router.get("")
def list_comments():
    with SessionLocal() as s:
        rows = s.execute(select(Comment)).scalars().all()
        return [{"id": c.id, "lon":c.lon,"lat":c.lat,"title":c.title,"body":c.body,"color":c.color} for c in rows]

@router.post("")
def create_comment(b: CommentBody):
    with SessionLocal() as s:
        c = Comment(lon=b.lon, lat=b.lat, title=b.title, body=b.body, color=b.color)
        s.add(c); s.commit(); s.refresh(c)
        return {"ok": True, "id": c.id}

class UpdateBody(CommentBody): pass

@router.patch("/{cid}")
def update_comment(cid: int, b: UpdateBody):
    with SessionLocal() as s:
        q = s.execute(select(Comment).where(Comment.id==cid)).scalar_one_or_none()
        if not q: raise HTTPException(status_code=404, detail="Not found")
        q.lon=b.lon; q.lat=b.lat; q.title=b.title; q.body=b.body; q.color=b.color
        s.commit()
        return {"ok": True}

@router.delete("/{cid}")
def delete_comment(cid: int):
    with SessionLocal() as s:
        n = s.execute(delete(Comment).where(Comment.id==cid))
        s.commit()
        return {"ok": True}
