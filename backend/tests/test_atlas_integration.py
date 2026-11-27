"""Scenario declarations retain their identity when routes use atlas placements."""
from copy import deepcopy
from itertools import count
from unittest.mock import patch
from uuid import UUID

import pytest
from pydantic import ValidationError

from backend.app.contracts import ProjectSnapshot
from backend.tests.test_progression_campaign import gate_reply, projected
from backend.tests.test_scenario import project, standard_project
from backend.tests.test_scenario_entities import korean_reply, submit


def approved_water_project(project, reply):
    source = standard_project(deepcopy(project), "ko")
    reply = deepcopy(reply)
    reply["locations"].append(dict(id="cistern", name="지하 물창고", kind="dungeon", purpose="제한된 비상 식수를 보관한다."))
    reply["geography"].extend([
        dict(relation="beneath", **{"from": "cistern", "to": "archive"}, description="봉인 문서고 아래에 비상 물창고가 있다."),
        dict(relation="travel", **{"from": "archive", "to": "cistern"}, description="문서고에서 식수 배급 기록을 들고 내려간다."),
    ])
    sequence = count(1)
    with patch("backend.app.scenario.uuid4", side_effect=lambda: UUID(int=next(sequence))):
        response, _, client = submit(source, reply)
    assert response.status_code == 200, response.status_code
    result = projected(source, response.json())
    result["scenario"]["approved"] = True
    check = client.post("/api/scenario/validate", json=result).json()
    assert check["valid"] and check["complete"] and len(check["paths"]) == 3
    return result


def test_routed_scenario_placement_requires_its_physical_endpoint(project, gate_reply):
    data = approved_water_project(project, gate_reply)
    world = data["world"]
    archive = data["scenario"]["locations"][0]["id"]
    cell = world["locations"][0]
    world.update(generatorVersion="atlas-1", approved=True,
                 placements=[dict(locationId=archive, position=cell["position"], regionId=cell["regionId"])])
    world["routes"][0]["from"] = archive
    ProjectSnapshot.model_validate(data)
    del world["placements"][0]["position"]
    with pytest.raises(ValidationError):
        ProjectSnapshot.model_validate(data)


def loopback(source, exported):
    import json
    import socket
    import time
    from threading import Thread

    import httpx
    import uvicorn

    from backend.app.main import create_app
    from backend.app.settings import Settings

    assert source["scenario"] == exported["scenario"]
    ProjectSnapshot.model_validate(exported)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(
            create_app(Settings(provider="mock")), log_level="error", access_log=False))
        thread = Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        thread.start()
        try:
            with httpx.Client(base_url=f"http://127.0.0.1:{port}", trust_env=False, timeout=10) as client:
                assert client.get("/health").json()["status"] == "ok"
                assert client.get("/api/generation").json()["mode"] == "mock"
                results = {}
                for defect in ("valid", "foreign", "no-position"):
                    value = deepcopy(exported)
                    if defect == "foreign":
                        value["world"]["placements"][0]["locationId"] = "missing"
                    if defect == "no-position":
                        del value["world"]["placements"][0]["position"]
                    if defect != "valid":
                        with pytest.raises(ValidationError):
                            ProjectSnapshot.model_validate(value)
                    started = time.perf_counter()
                    response = client.post("/api/scenario/validate", json=value)
                    result = response.json()
                    assert response.status_code == 200 and result["valid"] == (defect == "valid")
                    assert result["complete"] and len(result["paths"]) == (3 if defect == "valid" else 0)
                    codes = sorted({f["rule"] for f in result["findings"] if f["severity"] == "error"})
                    assert codes == ([] if defect == "valid" else ["project_reference"])
                    results[defect] = dict(status=response.status_code, valid=result["valid"],
                                           states=result["statesExplored"], endings=len(result["paths"]),
                                           errors=codes, elapsedMs=round((time.perf_counter()-started)*1000, 2))
                print(json.dumps(results))
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            assert not thread.is_alive()


if __name__ == "__main__":
    import json
    import subprocess
    from pathlib import Path
    from uuid import uuid4

    root = Path(__file__).resolve().parents[2]
    scratch = root / ".scratch"
    scratch.mkdir(exist_ok=True)
    # Reuse the exact Phase 2.3 campaign wire fixture without an external provider.
    source = approved_water_project(project.__wrapped__(), gate_reply.__wrapped__(korean_reply.__wrapped__()))
    run_id = uuid4().hex
    source_file = scratch / f"atlas-http-{run_id}-source.json"
    exported_file = scratch / f"atlas-http-{run_id}-accepted.json"
    try:
        source_file.write_text(json.dumps(source, ensure_ascii=False), encoding="utf8")
        subprocess.run(["node", str(root / "frontend/scripts/atlas-http-project.mjs"),
                        str(source_file), str(exported_file)], check=True)
        exported = json.loads(exported_file.read_bytes())
        loopback(source, exported)
        print(json.dumps({key: len(exported[key]) for key in ("nodes", "edges", "quests", "endings")} |
                         {"chapters": len(source["scenario"]["chapters"]), "mockScenarioCalls": 1, "atlasCalls": 0}))
    finally:
        source_file.unlink(missing_ok=True)
        exported_file.unlink(missing_ok=True)
