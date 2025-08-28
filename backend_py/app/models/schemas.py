from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, String, Float, Text
from .db import Base

class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # lon/lat in EPSG:4326 for simplicity
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    title: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(16), default="#10b981")  # teal-ish

class Workspace(Base):
    __tablename__ = "workspace"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    json: Mapped[str] = mapped_column(Text, nullable=False)
