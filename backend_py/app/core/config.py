from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    HOST: str = "0.0.0.0"
    PORT: int = 5178
    class Config:
        env_prefix = "UR_"

settings = Settings()
