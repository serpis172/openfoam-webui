FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Installa dipendenze base
RUN apt-get update && apt-get install -y \
    software-properties-common \
    curl \
    gnupg \
    lsb-release \
    python3 \
    python3-pip \
    build-essential \
    git \
    ca-certificates \
    libgl1 \
    libglu1-mesa \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# Metodo 1: Installa OpenFOAM dalla repository ufficiale (ESI Group)
RUN curl -fsSL https://dl.openfoam.com/add-debian-repo.sh | bash \
    && apt-get update \
    && apt-get install -y openfoam2406-default \
    && rm -rf /var/lib/apt/lists/*

# Imposta variabili d'ambiente OpenFOAM
ENV OPENFOAM_BASHRC=/opt/openfoam2406/etc/bashrc
ENV PATH=/opt/openfoam2406/platforms/linux64GccDPInt32Opt/bin:$PATH

WORKDIR /app

# Installa dipendenze Python
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY tasks.py mesh_export.py mesh_validation.py file_locking.py .

# ponytail: prima girava come utente "foam" non-root, ma il container
# api (backend/Dockerfile) gira come root di default e crea le cartelle
# dei casi nello stesso volume Docker condiviso (cases:/data). Un
# volume creato/scritto per primo da root non e' scrivibile da un altro
# utente senza permessi espliciti - ogni job di mesh/run avrebbe
# fallito al primo file scritto con Permission Denied. Nessun test
# Python a singolo processo lo becca: serve un vero deploy
# multi-container per vederlo. Stessa fiducia (root) di entrambi i
# lati del volume condiviso, non una via di mezzo con UID che devono
# combaciare per sempre.
CMD ["celery", "-A", "tasks", "worker", "--loglevel=info", "--concurrency=1"]