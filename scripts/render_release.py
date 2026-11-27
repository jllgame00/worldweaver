"""Render release controller and public container probes. All writes are single-attempt."""
import argparse
import json
import os
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

SHA = r"[0-9a-f]{40}"
DIGEST = r"sha256:[0-9a-f]{64}"
RUNNING = {"created", "queued", "build_in_progress", "pre_deploy_in_progress", "update_in_progress"}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def fetch(url, *, token=None, payload=None):
    headers = {"Accept": "application/json", "Cache-Control": "no-cache"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = Request(url, data=None if payload is None else json.dumps(payload).encode(), headers=headers)
    try:
        with build_opener(NoRedirect()).open(request, timeout=15) as response:
            body = response.read(4_000_001)
            if len(body) > 4_000_000:
                raise RuntimeError("Response exceeded probe limit")
            return response.headers.get_content_type(), body
    except HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} at {urlsplit(url).path}") from None
    except (TimeoutError, URLError, OSError):
        raise RuntimeError(f"Connection failed at {urlsplit(url).path}") from None


def probe(origin, expected):
    def read(path):
        return json.loads(fetch(origin + path)[1])
    health = read("/health")
    if not isinstance(health, dict):
        raise RuntimeError("Invalid health response")
    commit = health.get("commit", "")
    if (health.get("status") != "ok" or health.get("backendReady") is not True or
        health.get("frontendReady") is not True or health.get("executionMode") != "public-demo" or
        health.get("liveEnabled") is not False or not isinstance(commit, str) or not re.fullmatch(SHA, commit) or
        (expected is not None and commit != expected)):
        raise RuntimeError("Service health or deployed commit mismatch")
    config = read("/api/generation")
    mime, index = fetch(origin + "/")
    assets = re.findall(rb'<script\b[^>]*\bsrc="(/assets/[A-Za-z0-9_.-]+\.js)"', index)
    if (mime != "text/html" or not assets or not isinstance(config, dict) or config.get("available") is not False or
        config.get("deploymentMode") != "public-demo"):
        raise RuntimeError("Frontend or public API probe failed")
    for asset in assets:
        kind, content = fetch(origin + asset.decode("ascii"))
        if "javascript" not in kind or not content:
            raise RuntimeError("Missing entry script")
    example = read("/examples/salt-census.json")
    if not isinstance(example, dict) or example.get("synthetic") is not True:
        raise RuntimeError("Public example unavailable")
    return commit


def verified(origin, expected, seconds=180):
    end = time.monotonic() + seconds
    while True:
        try:
            return probe(origin, expected)
        except (RuntimeError, ValueError) as exc:
            if time.monotonic() >= end:
                raise RuntimeError("Public service verification failed") from exc
            time.sleep(4)


def digest(record):
    value = record.get("image", {}).get("sha", "").removeprefix("sha256:")
    if not re.fullmatch(r"[0-9a-f]{64}", value):
        raise RuntimeError("Render did not report a resolved image digest")
    return "sha256:" + value


class Render:
    def __init__(self, origin, service, token):
        if not re.fullmatch(r"srv-[A-Za-z0-9-]+", service) or not token:
            raise ValueError("Set RENDER_SERVICE_ID and RENDER_API_KEY")
        self.url = "https://api.render.com/v1/services/" + service
        self.token = token
        self.origin = origin
        service_details = self.request("").get("serviceDetails", {})
        if origin != service_details.get("url", "").rstrip("/"):
            raise ValueError("Configured health origin does not match the Render service URL")

    def request(self, path, payload=None):
        return json.loads(fetch(self.url + path, token=self.token, payload=payload)[1])

    def first(self, filters):
        rows = self.request("/deploys?" + urlencode({"limit": 1, **filters}))
        return rows[0]["deploy"] if rows else None

    def latest(self):
        return self.first({})

    def live(self):
        return self.first({"status": "live"})

    def verify(self, sha):
        return verified(self.origin, sha)

    def deploy(self, image):
        return self.request("/deploys", {"imageUrl": image})["id"]

    def rollback(self, previous):
        return self.request("/rollback", {"deployId": previous})["id"]

    def wait(self, identifier, expected_digest):
        if not re.fullmatch(r"dep-[A-Za-z0-9-]+", identifier):
            raise RuntimeError("Invalid Render deployment ID")
        print("Waiting for Render deployment", identifier, flush=True)
        end = time.monotonic() + 600
        while time.monotonic() < end:
            item = self.request("/deploys/" + identifier)
            if item["status"] == "live" and digest(item) == expected_digest:
                return
            if item["status"] not in RUNNING:
                raise RuntimeError("Render deployment failed or resolved to a different digest")
            time.sleep(6)
        raise RuntimeError("Render deployment timed out")


def rollout(api: Render, image: str, commit: str) -> None:
    if not re.fullmatch(r"docker\.io/[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*@" + DIGEST, image) or not re.fullmatch(SHA, commit):
        raise ValueError("Expected Docker Hub image digest and full source SHA")
    previous = api.live()
    old_sha = api.verify(None) if previous else None
    old_digest = digest(previous) if previous else None
    latest = api.latest()
    current = api.live()
    if (latest and latest.get("status") in RUNNING) or (current or {}).get("id") != (previous or {}).get("id"):
        raise RuntimeError("Deployment changed during preflight")
    print("Previously healthy release:", old_sha, previous["id"] if previous else None, old_digest, flush=True)
    identifier = api.deploy(image)
    try:
        api.wait(identifier, image.split("@")[1])
        api.verify(commit)
    except (ValueError, RuntimeError, KeyError) as failure:
        if not previous:
            raise RuntimeError("Deployment failed; no previous healthy release") from failure
        latest = api.latest()
        if not latest or latest["id"] != identifier:
            raise RuntimeError("Deployment failed; another deploy owns the service") from failure
        restored = api.rollback(previous["id"])
        api.wait(restored, old_digest)
        api.verify(old_sha)
        raise RuntimeError("Deployment failed; previous release verified after rollback") from failure
    print("Verified", identifier, commit, image, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["smoke", "deploy"])
    parser.add_argument("--origin", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--image")
    args = parser.parse_args()
    origin = args.origin.rstrip("/")
    https = re.fullmatch(r"https://[A-Za-z0-9.-]+", origin)
    if not https and not (args.command == "smoke" and re.fullmatch(r"http://127\.0\.0\.1:[0-9]+", origin)):
        parser.error("Provide the HTTPS origin (loopback HTTP is supported for container smoke)")
    if not re.fullmatch(SHA, args.commit):
        parser.error("Provide the full commit SHA")
    if args.command == "smoke":
        print("Healthy image", verified(origin, args.commit, seconds=60))
    else:
        rollout(Render(origin, os.environ["RENDER_SERVICE_ID"], os.environ["RENDER_API_KEY"]), args.image or "", args.commit)


if __name__ == "__main__":
    try:
        main()
    except (KeyError, ValueError, RuntimeError) as error:
        sys.exit(str(error))
