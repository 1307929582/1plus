"""
数据库配置
"""
import os
import logging
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models import Base

# 使用绝对路径，确保在任何工作目录下都能找到数据库
DB_DIR = Path(__file__).parent.absolute()
DB_PATH = DB_DIR / "sheerid_veteran.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info(f"Database path: {DB_PATH}")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations():
    with engine.begin() as conn:
        result = conn.execute(text("PRAGMA table_info(redeem_codes)"))
        columns = [row[1] for row in result.fetchall()]
        if "linuxdo_user_id" not in columns:
            try:
                conn.execute(text("ALTER TABLE redeem_codes ADD COLUMN linuxdo_user_id INTEGER"))
            except Exception:
                pass

        result = conn.execute(text("PRAGMA table_info(oauth_settings)"))
        columns = [row[1] for row in result.fetchall()]
        if "min_trust_level" not in columns:
            try:
                conn.execute(text("ALTER TABLE oauth_settings ADD COLUMN min_trust_level INTEGER DEFAULT 0"))
            except Exception:
                pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
