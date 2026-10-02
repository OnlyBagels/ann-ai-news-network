from fastapi.testclient import TestClient

from ann_agents.api.server import app


def test_agent_api_requires_the_token_when_set(monkeypatch):
    monkeypatch.setenv("AGENT_API_INGEST_ON_START", "false")
    monkeypatch.setenv("AGENT_API_TOKEN", "s3cret")
    with TestClient(app) as client:
        assert client.post("/api/review", json={"article_id": "x", "action": "approve"}).status_code == 401
        assert client.get("/api/health", headers={"Authorization": "Bearer wrong"}).status_code == 401
        assert client.get("/api/health", headers={"Authorization": "Bearer s3cret"}).status_code == 200


def test_agent_api_is_open_without_a_token(monkeypatch):
    monkeypatch.setenv("AGENT_API_INGEST_ON_START", "false")
    monkeypatch.delenv("AGENT_API_TOKEN", raising=False)
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
