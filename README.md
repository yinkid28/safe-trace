# SafeTrace

AI-powered personal safety system that detects anomalous movement patterns using GPS data. Built for the Lagos context.

See [Project.md](Project.md) for full technical details.

## Quick Start

### Prerequisites

- Python 3.11+

### Setup

```bash
cd ai-service
python -m venv venv

# Activate the virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Train the model

```bash
python -m app.model.train
```

### Run tests

```bash
python -m pytest tests/ -v
```

### Start the server

```bash
uvicorn app.main:app --port 8000
```

API docs at http://localhost:8000/docs
