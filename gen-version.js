const fs = require("fs");

const now = new Date();
const version =
  now.getFullYear() +
  String(now.getMonth() + 1).padStart(2, "0") +
  String(now.getDate()).padStart(2, "0") +
  String(now.getHours()).padStart(2, "0") +
  String(now.getMinutes()).padStart(2, "0") +
  String(now.getSeconds()).padStart(2, "0");

const baseUrl = (process.env.UPDATE_BASE_URL || "https://example.com/automessage").replace(/\/+$/, "");
const files = ["main.js", "lib/utils.js"];

const data = {
  version,
  force: 0,
  entry: "main.js",
  changelog: `auto build ${version}`,
  files: files.map((path) => ({
    path,
    url: `${baseUrl}/${path}`
  }))
};

fs.writeFileSync("version.json", JSON.stringify(data, null, 2));
console.log("version.json 已生成:", version);
console.log("更新地址:", `${baseUrl}/version.json`);
