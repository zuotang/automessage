const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const SftpClient = require("ssh2-sftp-client");
require("dotenv").config({ path: process.env.SFTP_ENV_FILE || ".env.sftp" });

const projectRoot = process.cwd();
const remoteBaseDir = mustEnv("SFTP_REMOTE_DIR");
const host = mustEnv("SFTP_HOST");
const username = mustEnv("SFTP_USER");
const port = Number(process.env.SFTP_PORT || 22);

const privateKey = process.env.SFTP_PRIVATE_KEY_PATH
  ? fs.readFileSync(path.resolve(projectRoot, process.env.SFTP_PRIVATE_KEY_PATH))
  : undefined;

const targets = ["main.js", "version.json", "lib/utils.js"];
const watchMode = process.argv.includes("--watch");

function mustEnv(key) {
  const val = process.env[key];
  if (!val || !String(val).trim()) {
    throw new Error(`缺少环境变量: ${key}`);
  }
  return String(val).trim();
}

function toPosixPath(p) {
  return p.replace(/\\/g, "/");
}

function joinRemote(base, relative) {
  const cleanBase = toPosixPath(base).replace(/\/+$/, "");
  const cleanRel = toPosixPath(relative).replace(/^\/+/, "");
  return `${cleanBase}/${cleanRel}`;
}

function getConnectionConfig() {
  const cfg = {
    host,
    port,
    username
  };

  if (privateKey) {
    cfg.privateKey = privateKey;
    if (process.env.SFTP_PASSPHRASE) {
      cfg.passphrase = process.env.SFTP_PASSPHRASE;
    }
  } else {
    cfg.password = mustEnv("SFTP_PASSWORD");
  }

  return cfg;
}

async function ensureRemoteDir(client, remoteFilePath) {
  const remoteDir = path.posix.dirname(toPosixPath(remoteFilePath));
  await client.mkdir(remoteDir, true);
}

async function uploadOne(client, relativePath) {
  const localPath = path.resolve(projectRoot, relativePath);
  if (!fs.existsSync(localPath)) {
    throw new Error(`本地文件不存在: ${relativePath}`);
  }
  const remotePath = joinRemote(remoteBaseDir, relativePath);
  await ensureRemoteDir(client, remotePath);
  await client.fastPut(localPath, remotePath);
  console.log(`[sftp] uploaded ${relativePath} -> ${remotePath}`);
}

async function buildVersion() {
  const { execSync } = require("child_process");
  const cmd = process.platform === "win32" ? "node gen-version.js" : "node ./gen-version.js";
  execSync(cmd, {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env
  });
}

async function uploadAll() {
  const client = new SftpClient();
  try {
    await client.connect(getConnectionConfig());
    for (const rel of targets) {
      await uploadOne(client, rel);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  await buildVersion();
  await uploadAll();

  if (!watchMode) {
    return;
  }

  console.log("[sftp] watch mode enabled");
  const watcher = chokidar.watch(["main.js", "lib/**/*.js"], {
    ignoreInitial: true
  });

  let pending = false;
  let queued = false;
  const queueUpload = async () => {
    if (pending) {
      queued = true;
      return;
    }
    pending = true;
    try {
      do {
        queued = false;
        await buildVersion();
        await uploadAll();
      } while (queued);
    } catch (err) {
      console.error("[sftp] upload failed:", err.message);
    } finally {
      pending = false;
    }
  };

  watcher.on("change", queueUpload);
  watcher.on("add", queueUpload);
  watcher.on("unlink", async (filePath) => {
    console.log("[sftp] local file removed:", filePath);
    await queueUpload();
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
