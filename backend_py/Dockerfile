FROM python:3.11-slim

# System deps (add GDAL/PROJ later when we do real geo work)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml /app/pyproject.toml
RUN pip install --no-cache-dir uv pip-tools && \
    pip install --no-cache-dir "fastapi>=0.115" "uvicorn[standard]>=0.30" "orjson>=3.10" "pydantic>=2.7" "pydantic-settings>=2.4"

COPY app /app/app
EXPOSE 5178
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5178"]
