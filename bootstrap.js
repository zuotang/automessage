"auto";

// =========================
// AutoJs6 GitHub 更新器模板
// =========================

// ---- 你要改的配置 ----
const PROJECT_NAME = "my_remote_project";
const BOOTSTRAP_VERSION = "1.0.0";
const REMOTE_MANIFEST_URL = "https://raw.githubusercontent.com/zuotang/automessage/main/version.json";

// ---- 本地目录 ----
const BASE_DIR = files.join(files.cwd(), PROJECT_NAME);
const TEMP_DIR = files.join(BASE_DIR, "_tmp");
const LOCAL_META_FILE = files.join(BASE_DIR, "local_meta.json");
const LOG_TAG = "[Updater]";

// 可选：请求超时毫秒
http.__okhttp__.setTimeout(15000);

// 启动
main();

function main() {
    try {
        ensureDir(BASE_DIR);
        ensureDir(TEMP_DIR);

        logi("启动更新器");
        toastLog("检查远程版本...");

        const remote = getRemoteManifest();
        validateManifest(remote);

        checkBootstrapCompatibility(remote);

        const local = getLocalMeta();
        printVersionInfo(local, remote);

        if (shouldUpdate(local, remote)) {
            logi("检测到新版本，开始更新");
            if (remote.changelog) {
                toastLog("发现新版本: " + remote.version + "\n" + remote.changelog);
            } else {
                toastLog("发现新版本: " + remote.version);
            }

            performUpdate(remote);

            saveLocalMeta({
                version: remote.version,
                force: remote.force || 0,
                updatedAt: new Date().toISOString(),
                entry: remote.entry || "main.js"
            });

            toastLog("更新完成");
            logi("更新完成");
        } else {
            logi("当前已是最新版本");
            toastLog("当前已是最新版本");
        }

        runEntry(remote.entry || getLocalEntry() || "main.js");

    } catch (e) {
        console.error(e);
        toastLog("启动失败: " + e.message);
    }
}

// =========================
// 主流程函数
// =========================

function getRemoteManifest() {
    const res = http.get(REMOTE_MANIFEST_URL);
    if (!res) {
        throw new Error("获取远程 version.json 失败");
    }
    if (res.statusCode !== 200) {
        throw new Error("请求 version.json 失败，状态码: " + res.statusCode);
    }

    let json;
    try {
        json = res.body.json();
    } catch (e) {
        throw new Error("version.json 不是合法 JSON");
    }

    if (!json) {
        throw new Error("version.json 内容为空");
    }
    return json;
}

function validateManifest(manifest) {
    if (!manifest.version) {
        throw new Error("version.json 缺少 version");
    }
    if (!manifest.files || !Array.isArray(manifest.files) || manifest.files.length === 0) {
        throw new Error("version.json 缺少 files 或 files 为空");
    }
    if (!manifest.entry) {
        manifest.entry = "main.js";
    }

    manifest.files.forEach((item, index) => {
        if (!item.path) {
            throw new Error("files[" + index + "] 缺少 path");
        }
        if (!item.url) {
            throw new Error("files[" + index + "] 缺少 url");
        }
        if (isUnsafeRelativePath(item.path)) {
            throw new Error("非法 path: " + item.path);
        }
    });
}

function checkBootstrapCompatibility(remote) {
    const minVer = remote.minBootstrapVersion || "0.0.0";
    if (compareVersion(BOOTSTRAP_VERSION, minVer) < 0) {
        throw new Error(
            "当前启动器版本过低，当前: " +
            BOOTSTRAP_VERSION +
            "，最低要求: " +
            minVer
        );
    }
}

function getLocalMeta() {
    if (!files.exists(LOCAL_META_FILE)) {
        return {
            version: "0.0.0",
            force: 0,
            updatedAt: "",
            entry: "main.js"
        };
    }

    try {
        const txt = files.read(LOCAL_META_FILE);
        const obj = JSON.parse(txt);
        return {
            version: obj.version || "0.0.0",
            force: obj.force || 0,
            updatedAt: obj.updatedAt || "",
            entry: obj.entry || "main.js"
        };
    } catch (e) {
        return {
            version: "0.0.0",
            force: 0,
            updatedAt: "",
            entry: "main.js"
        };
    }
}

function saveLocalMeta(meta) {
    ensureParentDir(LOCAL_META_FILE);
    files.write(LOCAL_META_FILE, JSON.stringify(meta, null, 2));
}

function getLocalEntry() {
    const local = getLocalMeta();
    return local.entry || "main.js";
}

function shouldUpdate(local, remote) {
    const remoteVersion = remote.version || "0.0.0";
    const localVersion = local.version || "0.0.0";

    if (compareVersion(remoteVersion, localVersion) > 0) {
        return true;
    }

    const remoteForce = remote.force || 0;
    const localForce = local.force || 0;
    if (Number(remoteForce) !== Number(localForce)) {
        return true;
    }

    const entryFile = files.join(BASE_DIR, remote.entry || "main.js");
    if (!files.exists(entryFile)) {
        return true;
    }

    return false;
}

function performUpdate(remote) {
    clearTempDir();

    const downloadList = [];

    // 1. 全部先下载到临时目录
    remote.files.forEach(item => {
        const tmpPath = files.join(TEMP_DIR, item.path + ".tmp");
        downloadToFile(item.url, tmpPath);
        downloadList.push({
            finalPath: files.join(BASE_DIR, item.path),
            tmpPath: tmpPath
        });
    });

    // 2. 校验入口文件是否存在
    const entryPath = files.join(TEMP_DIR, (remote.entry || "main.js") + ".tmp");
    if (!files.exists(entryPath)) {
        throw new Error("临时目录中找不到入口文件: " + (remote.entry || "main.js"));
    }

    // 3. 原子替换：逐个覆盖
    downloadList.forEach(item => {
        ensureParentDir(item.finalPath);
        backupAndReplace(item.tmpPath, item.finalPath);
        logi("已更新: " + item.finalPath);
    });

    // 4. 清理临时目录
    clearTempDir();
}

function runEntry(entryRelativePath) {
    const entryFile = files.join(BASE_DIR, entryRelativePath);
    if (!files.exists(entryFile)) {
        throw new Error("入口脚本不存在: " + entryFile);
    }

    logi("运行入口脚本: " + entryFile);

    engines.execScriptFile(entryFile, {
        path: BASE_DIR
    });
}
// =========================
// 下载与替换
// =========================

function downloadToFile(url, targetFile) {
    logi("下载: " + url);

    const res = http.get(url);
    if (!res) {
        throw new Error("下载失败: " + url);
    }
    if (res.statusCode !== 200) {
        throw new Error("下载失败，状态码 " + res.statusCode + ": " + url);
    }

    const content = res.body.string();
    if (content == null || content === "") {
        throw new Error("下载内容为空: " + url);
    }

    ensureParentDir(targetFile);
    files.write(targetFile, content);
}

function backupAndReplace(tmpPath, finalPath) {
    const bakPath = finalPath + ".bak";

    try {
        if (files.exists(bakPath)) {
            files.remove(bakPath);
        }

        if (files.exists(finalPath)) {
            files.copy(finalPath, bakPath);
            files.remove(finalPath);
        }

        files.copy(tmpPath, finalPath);

        // 如果替换成功，删除备份
        if (files.exists(bakPath)) {
            files.remove(bakPath);
        }
    } catch (e) {
        // 回滚
        try {
            if (files.exists(finalPath)) {
                files.remove(finalPath);
            }
            if (files.exists(bakPath)) {
                files.copy(bakPath, finalPath);
                files.remove(bakPath);
            }
        } catch (rollbackErr) {
            console.error(rollbackErr);
        }
        throw new Error("替换文件失败: " + finalPath + "，原因: " + e.message);
    }
}

// =========================
// 工具函数
// =========================

function compareVersion(v1, v2) {
    const a1 = String(v1).split(".").map(n => parseInt(n || "0", 10));
    const a2 = String(v2).split(".").map(n => parseInt(n || "0", 10));
    const len = Math.max(a1.length, a2.length);

    for (let i = 0; i < len; i++) {
        const n1 = a1[i] || 0;
        const n2 = a2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

function ensureDir(dirPath) {
    if (files.exists(dirPath)) return;
    files.createWithDirs(files.join(dirPath, ".keep"));
    if (files.exists(files.join(dirPath, ".keep"))) {
        files.remove(files.join(dirPath, ".keep"));
    }
}

function ensureParentDir(filePath) {
    const parent = new java.io.File(filePath).getParent();
    if (parent) {
        ensureDir(parent);
    }
}

function clearTempDir() {
    try {
        if (files.exists(TEMP_DIR)) {
            files.removeDir(TEMP_DIR);
        }
    } catch (e) {
        logw("清理临时目录失败: " + e.message);
    }
    ensureDir(TEMP_DIR);
}

function isUnsafeRelativePath(path) {
    const p = String(path || "");
    return (
        p.indexOf("..") >= 0 ||
        p.startsWith("/") ||
        p.startsWith("\\") ||
        p.indexOf(":") >= 0
    );
}

function printVersionInfo(local, remote) {
    logi("本地版本: " + (local.version || "0.0.0"));
    logi("远程版本: " + (remote.version || "0.0.0"));
    logi("本地 force: " + (local.force || 0));
    logi("远程 force: " + (remote.force || 0));
}

function logi(msg) {
    log(LOG_TAG + " " + msg);
}

function logw(msg) {
    console.warn(LOG_TAG + " " + msg);
}