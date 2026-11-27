"""Package a runnable validation build, excluding keys and all native/user data."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent
target = root / "dist-validation.zip"
allowed = ["serve-static.js", "local-server.js", "server-middleware.js", "phone-preview.js", "serve-phone-preview.js", "phone-preview-gate.js", ".env.web-probe.local.example"]
runtime_package = {"name": "travel-web-validation-export", "private": True, "version": "0.0.0", "scripts": {"start-local": "node local-server.js start", "stop-local": "node local-server.js stop", "status-local": "node local-server.js status"}}
guide = """# Travel 网页验证包

这是公共样例验证版，需要 Node.js 22 或以上。
将 .env.web-probe.local.example 复制为 .env.web-probe.local，填入自己的网页地图配置。
执行 npm run start-local，在 Mac 打开 http://127.0.0.1:8095/；stop-local 停止服务。

可验证两种地图、搜索、Day 切换、编辑、排序、文件备份恢复和离线缓存。
首次在线打开并确认缓存就绪后，离线仍能查看和编辑；地图和搜索需要网络。
更新需要明确点击，编辑草稿不会被强制重开。

包含主屏幕图标与 manifest。手机需要 HTTPS 地址，127.0.0.1 是各设备自身。
phone-preview.js 是临时验证工具，需另行授权对外开放后才执行 start。
入口带访问码，2 小时关闭，旧原生备份接口被禁用，需要已安装 cloudflared。
临时地址会变化，原行程长期使用需要稳定地址和正式迁移流程。

本包不包含 Key、安全密钥、访问码、原行程、手机数据库、云同步或账号。
浏览器保存仍需独立备份；清理网站数据或更换地址前先导出。
"""
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
    for file in sorted((root / "dist").rglob("*")):
        if file.is_file():
            archive.write(file, "travel-web-validation/" + str(file.relative_to(root)))
    for name in allowed:
        archive.write(root / name, "travel-web-validation/" + name)
    archive.writestr("travel-web-validation/package.json", json.dumps(runtime_package, indent=2))
    archive.writestr("travel-web-validation/README.md", guide)

config = dict(line.split("=", 1) for line in (root / ".env.web-probe.local").read_text().splitlines() if "=" in line and not line.startswith("#"))
with zipfile.ZipFile(target) as archive:
    for name in archive.namelist():
        assert "/private/" not in name and "/.runtime/" not in name and name != "travel-web-validation/.env.web-probe.local"
        data = archive.read(name)
        for value in config.values():
            assert not value or value.encode() not in data, "Unexpected credential in validation package"
print(json.dumps({"package": str(target), "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "credentialsAndNativeDataIncluded": False}))
