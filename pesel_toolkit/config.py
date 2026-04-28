# config.py
import os

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Config:
    PORT: int = 5001
    DEBUG: bool = False
    PDF_TEMPLATE_PATH: str = os.path.join(
        BASE_DIR, "assets", "Wniosek_o_nadanie_PESEL.pdf"
    )
    FIELD_MAP_PATH: str = os.path.join(BASE_DIR, "assets", "pesel_field_map.json")
    LLAMAPARSE_API_KEY: str = os.environ.get("LLAMAPARSE_API_KEY", "")
    MINIMAX_API_KEY: str = os.environ.get("MINIMAX_API_KEY", "")
    MINIMAX_GROUP_ID: str = os.environ.get("MINIMAX_GROUP_ID", "")
    MINIMAX_MODEL: str = os.environ.get("MINIMAX_MODEL", "")


class DevConfig(Config):
    DEBUG: bool = True


def get_config(env: str = "production") -> Config:
    return DevConfig() if env == "development" else Config()
