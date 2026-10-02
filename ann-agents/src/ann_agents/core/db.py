"""One way to open the Postgres database the web app also uses."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from ann_agents.core.config import settings


def make_engine(url: Optional[str] = None) -> Engine:
    """Open DATABASE_URL with psycopg2.

    The URL is shared with Prisma, which adds ?schema=public; psycopg2
    rejects that parameter. SQLAlchemy 2.1 picks psycopg 3 for a bare
    postgresql:// URL, but this package depends on psycopg2.
    """
    url = (url or settings.database_url).split("?schema=")[0]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    elif url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://"):]
    # Prisma's DateTime columns are timestamps without a time zone, read as
    # UTC. Pin the session to UTC so a machine set to local time doesn't
    # shift every write.
    return create_engine(url, pool_pre_ping=True, connect_args={"options": "-c timezone=UTC"})
