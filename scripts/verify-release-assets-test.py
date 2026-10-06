"""Regression: actual ZIP content and fail-closed publication before credentials/network."""
import hashlib
import json
import pathlib
import runpy
import sys
import tempfile
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
output = pathlib.Path(sys.argv[1])
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
with zipfile.ZipFile(output / "ContentFlow-Browser-Bridge.zip") as archive:
    assert archive.testzip() is None
    for name in ["manifest.json", "service-worker.js", "content-script.js", "README.md", "INSTALAR.md"]:
        assert archive.read("contentflow-browser-bridge/" + name) == (root / "ecosystem/browser-bridge" / name).read_bytes()
    assert json.loads(archive.read("contentflow-browser-bridge/manifest.json"))["manifest_version"] == 3
for asset, skill in [("Plugin", "plugin"), ("Method", "method")]:
    with zipfile.ZipFile(output / f"ContentFlow-Skill-{asset}-Development.zip") as archive:
        assert archive.testzip() is None
        prefix = f"contentflow-{skill}-development/"
        document = json.loads(archive.read(prefix + "DOCUMENTATION.json"))
        assert document["documentationVersion"] == version
        for entry in document["files"]:
            assert hashlib.sha256(archive.read(prefix + entry["path"])).hexdigest() == entry["sha256"]
validate = runpy.run_path(str(root / "scripts/publish-github-release.py"))["validate_files"]
with tempfile.TemporaryDirectory(prefix="contentflow-release-contract-") as temporary:
    directory = pathlib.Path(temporary)
    names = [f"ContentFlow-V1-{version}-x64-Setup.exe", f"ContentFlow-V1-{version}-x64-Portable.exe", f"ContentFlow-V1-{version}-x64-Setup.exe.blockmap", f"ContentFlow-V1-{version}-SHA256.txt", "latest.yml"]
    files = []
    for name in names:
        file = directory / name
        file.write_bytes(b"fixture")
        files.append(str(file))
    plan = {"repository": "andremjr/contentflow", "tag": "v" + version, "files": files}
    try:
        validate(plan)
        raise AssertionError("Release sem downloads foi aceita")
    except RuntimeError as error:
        assert "ContentFlow-Browser-Bridge.zip" in str(error)
        assert "ContentFlow-Skill-Method-Development.zip" in str(error)
        assert "ContentFlow-Skill-Plugin-Development.zip" in str(error)
    plan["files"] += [str(file) for file in output.glob("*.zip")]
    assert len(validate(plan)) == 8
