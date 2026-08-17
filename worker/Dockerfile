FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    lsb-release \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN curl -s https://dl.openfoam.com/add-debian-repo.gpg | gpg --dearmor -o /usr/share/keyrings/OpenFOAM.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/OpenFOAM.gpg] https://dl.openfoam.com/repos/deb/ $(lsb_release -cs) main" > /etc/apt/sources.list.d/openfoam.list \
 && apt-get update \
 && apt-get install -y openfoam2406 \
 && rm -rf /var/lib/apt/lists/*

ENV OPENFOAM_BASHRC=/opt/openfoam2406/etc/bashrc

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY tasks.py .

RUN useradd -m foam || true
USER foam

CMD ["celery", "-A", "tasks", "worker", "--loglevel=info", "--concurrency=1"]