#!/bin/bash
fuser -k 8000/tcp || true
pkill -9 -f uvicorn || true
sleep 3

cd /home/bitnami/project-t/backend
source venv/bin/activate
nohup uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > /tmp/uvicorn.log 2>&1 &
sleep 5

curl -s http://localhost:8000/openapi.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('Routes:', list(d['paths'].keys()))"
