"""
数据库配置
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models import Base

DATABASE_URL = "sqlite:///./sheerid_veteran.db"

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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
