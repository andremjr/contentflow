"""Publish local release assets using only the existing Git Credential Manager session.

The credential is captured in memory; it is never printed, written, or passed on a command line.
Usage: python scripts/publish-github-release.py plan.json
"""
import hashlib
import json
import pathlib
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request


def main():
    plan = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    if plan["repository"] not in ["andremjr/contentflow", "andremjr/plugins-contentflow", "andremjr/methods-contentflow"]:
        raise RuntimeError("Repositório não autorizado para este publicador.")
    result = subprocess.run(["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n", text=True, capture_output=True)
    credential = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
    if result.returncode or not credential.get("password"):
        raise RuntimeError("Credencial segura de sessão indisponível.")
    authorization = "Bearer " + credential["password"]
    headers = {"Authorization": authorization, "Accept": "application/vnd.github+json", "User-Agent": "ContentFlow-Local-Publisher", "X-GitHub-Api-Version": "2022-11-28"}

    def api(url, method="GET", payload=None, binary=None):
        data = binary if binary is not None else json.dumps(payload).encode("utf-8") if payload is not None else None
        request_headers = dict(headers)
        if data is not None:
            request_headers["Content-Type"] = "application/octet-stream" if binary is not None else "application/json"
        request = urllib.request.Request(url, method=method, data=data, headers=request_headers)
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"GitHub recusou {method}: HTTP {error.code}") from None

    files = [pathlib.Path(file).resolve() for file in plan["files"]]
    if not files or any(not file.is_file() for file in files):
        raise RuntimeError("Artefatos locais ausentes.")
    base = f"https://api.github.com/repos/{plan['repository']}"
    releases = api(base + "/releases?per_page=100")
    release = next((item for item in releases if item["tag_name"] == plan["tag"]), None)
    if release and not release["draft"]:
        raise RuntimeError("Esta release já está pública; não substituir pacotes imutáveis.")
    if not release:
        release = api(base + "/releases", "POST", {"tag_name": plan["tag"], "name": plan["name"], "body": pathlib.Path(plan["bodyFile"]).read_text(encoding="utf-8"), "draft": True, "prerelease": False})
    upload = release["upload_url"].split("{")[0]
    assets = api(release["assets_url"])
    for file in files:
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        existing = next((asset for asset in assets if asset["name"] == file.name), None)
        if existing:
            if existing["size"] != file.stat().st_size or existing.get("digest") != "sha256:" + digest:
                raise RuntimeError("Asset existente não corresponde ao artefato local: " + file.name)
            asset = existing
        else:
            asset = api(upload + "?" + urllib.parse.urlencode({"name": file.name}), "POST", binary=file.read_bytes())
        if asset["state"] != "uploaded" or asset["size"] != file.stat().st_size or asset.get("digest") != "sha256:" + digest:
            raise RuntimeError("Integridade do upload não confirmada: " + file.name)
        print(json.dumps({"uploaded": file.name, "size": asset["size"], "sha256": digest}), flush=True)
    release = api(release["url"], "PATCH", {"draft": False, "make_latest": "true", "body": pathlib.Path(plan["bodyFile"]).read_text(encoding="utf-8")})
    print(json.dumps({"published": release["html_url"], "tag": release["tag_name"]}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Publicação interrompida: " + str(error), file=sys.stderr)
        sys.exit(1)
