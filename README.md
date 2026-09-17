# OpenFOAM Web UI

Interfaccia web per usare OpenFOAM senza terminale · A web interface for
running OpenFOAM without touching a terminal.

**📖 Full documentation / Documentazione completa:**
[🇬🇧 English](docs/en/README.md) · [🇮🇹 Italiano](docs/it/README.md)

**🏗️ Architecture / Architettura:**
[🇬🇧 English](docs/en/ARCHITECTURE.md) · [🇮🇹 Italiano](docs/it/ARCHITECTURE.md)

## Quick start

```bash
cp .env.example .env
nano .env   # set REDIS_PASSWORD, API_KEY

bash scripts/setup.sh
```

Then open <http://localhost:8000>. See the full docs above for
configuration, usage, testing, security notes, and troubleshooting.

## Other technical documents (internal engineering logs, single-language each)

- [`ROADMAP.md`](ROADMAP.md) — design decisions, security audits, foamlib
  migration roadmap. Italian only.
- [`MESHING_FIXES.md`](MESHING_FIXES.md) — meshing bugs fixed, root
  causes. English only.
