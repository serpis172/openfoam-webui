FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglu1-mesa \
    libxrender1 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /app

COPY trame_app.py case_registry.py .

ENTRYPOINT ["xvfb-run", "-a", "python", "trame_app.py"]
CMD ["--port", "8080"]