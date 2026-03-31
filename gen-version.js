const fs = require("fs");

// 时间
const now = new Date();
const time =
  now.getFullYear() +
  String(now.getMonth() + 1).padStart(2, "0") +
  String(now.getDate()).padStart(2, "0") +
  String(now.getHours()).padStart(2, "0") +
  String(now.getMinutes()).padStart(2, "0");

// 使用时间戳版本，避免 release 前生成版本与提交后版本不一致
const version = time;

const data = {
  version,
  force: 0,
  entry: "main.js",
  changelog: `auto build ${version}`,
  files: [
    {
      path: "main.js",
      url: "https://raw.githubusercontent.com/zuotang/automessage/main/main.js"
    },
    {
      path: "lib/utils.js",
      url: "https://raw.githubusercontent.com/zuotang/automessage/main/lib/utils.js"
    },
    {
      path: "task.js",
      url: "https://raw.githubusercontent.com/zuotang/automessage/main/task.js"
    }
  ]
};

fs.writeFileSync("version.json", JSON.stringify(data, null, 2));
console.log("version.json 已生成:", version);
