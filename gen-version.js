const fs = require("fs");
const { execSync } = require("child_process");

// 获取 git commit hash
const commit = execSync("git rev-parse --short HEAD").toString().trim();

// 获取提交次数
const count = execSync("git rev-list --count HEAD").toString().trim();

// 时间
const now = new Date();
const time =
  now.getFullYear() +
  String(now.getMonth() + 1).padStart(2, "0") +
  String(now.getDate()).padStart(2, "0") +
  String(now.getHours()).padStart(2, "0") +
  String(now.getMinutes()).padStart(2, "0");

// 最终版本号（任选一种）
const version = `${count}-${commit}`;
// 或：const version = time;

const data = {
  version,
  force: 0,
  entry: "main.js",
  changelog: `auto build ${version}`,
  files: [
    {
      path: "main.js",
      url: "https://raw.githubusercontent.com/zuotang/automessage/main/main.js"
    }
  ]
};

fs.writeFileSync("version.json", JSON.stringify(data, null, 2));
console.log("version.json 已生成:", version);