"auto";

const PROJECT_DIR = files.path(".");
const utils = require(files.join(PROJECT_DIR, "lib/utils.js"));

let running = false;
let worker = null;
const DEBUG = true;

function debugStep(step, detail) {
    if (DEBUG) {
        const msg = detail ? (step + " " + detail) : step;
        toast(msg);
    }
}

function debugError(step, err) {
    const msg = err ? (step + ": " + String(err)) : step;
    toast(msg.length > 40 ? msg.substring(0, 40) : msg);
}

function nodeText(node) {
    if (!node) return "";
    return node.text() || node.desc() || "";
}

function nodeBounds(node) {
    if (!node) return null;
    const b = node.bounds();
    return {
        left: b.left,
        top: b.top,
        right: b.right,
        bottom: b.bottom
    };
}

function nodesByIdSorted(viewId) {
    const list = id(viewId).find();
    const arr = [];
    for (let i = 0; i < list.size(); i++) {
        const node = list.get(i);
        const b = node.bounds();
        arr.push({
            node: node,
            cy: b.centerY(),
            cx: b.centerX()
        });
    }
    arr.sort((a, b) => {
        if (a.cy !== b.cy) return a.cy - b.cy;
        return a.cx - b.cx;
    });
    return arr;
}

function showItemsDialog(items) {
    const content = "条目数: " + items.length + "\n\n" + JSON.stringify(items, null, 2);
    ui.run(() => {
        dialogs.build({
            title: "n50抓取结果",
            content: content,
            positive: "确定"
        }).show();
    });
}

function isInInboxPage() {
    return id("n50").exists() || id("as7").exists() || id("igq").exists();
}

function ensureInboxPage(timeoutMs) {
    const start = Date.now();
    let lastLaunchAt = 0;

    while (running && Date.now() - start < timeoutMs) {
        if (isInInboxPage()) {
            return true;
        }

        const pkg = currentPackage();
        if (pkg !== "com.zhiliaoapp.musically") {
            if (Date.now() - lastLaunchAt > 3000) {
                debugStep("启动应用");
                app.launchPackage("com.zhiliaoapp.musically");
                lastLaunchAt = Date.now();
            }
            sleep(800);
            continue;
        }

        const clicked = utils.tClick(["Inbox", "消息", "收件箱"], 0, 0.75, () => !running);
        if (clicked) {
            debugStep("已点消息入口");
            sleep(1200);
        } else {
            sleep(500);
        }
    }

    return isInInboxPage();
}

// 获取多个 id=n50 的元素数据
function collectN50Items() {
    debugStep("开始抓取n50");
    const names = nodesByIdSorted("as7");
    const contents = nodesByIdSorted("igq");
    const dates = nodesByIdSorted("igt");
    const avatars = nodesByIdSorted("ogb");

    let dataLen = names.length;
    debugStep("抓取到条目", String(dataLen));
    const results = [];

    for (let i = 0; i < dataLen; i++) {
        try {
            const nameNode = names[i] ? names[i].node : null;
            const contentNode = contents[i] ? contents[i].node : null;
            const dateNode = dates[i] ? dates[i].node : null;
            const avatarNode = avatars[i] ? avatars[i].node : null;

            let item = {
                nickname: nodeText(nameNode),
                content: nodeText(contentNode),
                date: nodeText(dateNode),
                avatar: {
                    textOrDesc: nodeText(avatarNode),
                    bounds: nodeBounds(avatarNode)
                }
            };

            results.push(item);
            const nickHint = item.nickname ? item.nickname.substring(0, 6) : "空";
            debugStep("第" + (i + 1) + "条", nickHint);
        } catch (e) {
            debugError("第" + (i + 1) + "条抓取失败", e);
        }
    }

    debugStep("抓取结束", "有效条目=" + results.length);
    return results;
}

// 悬浮窗
let w = floaty.window(
    <frame>
        <button id="toggle" text="开启81" w="60" h="40" bg="#AA00CC66"/>
    </frame>
);

// 左上角
w.setPosition(20, 120);

// 按钮点击
w.toggle.click(() => {
    if (running) {
        stopTask();
    } else {
        startTask();
    }
});

// 启动任务
function startTask() {
    if (running) return;

    running = true;
    debugStep("开始运行");
    ui.run(() => {
        w.toggle.setText("关闭");
    });

    worker = threads.start(function () {
        try {
            runTask();
        } catch (e) {
            log(e);
            toastLog("运行异常: " + e);
        } finally {
            running = false;
            ui.run(() => {
                w.toggle.setText("开启");
            });
        }
    });
}

// 停止任务
function stopTask() {
    running = false;

    if (worker && worker.isAlive()) {
        worker.interrupt();
    }

    ui.run(() => {
        w.toggle.setText("开启");
    });

    toast("已停止");
}

// 主逻辑
function runTask() {
    if (!running) return;
    debugStep("检查消息页");
    const ok = ensureInboxPage(20000);
    if (!ok) {
        debugStep("20秒未进入消息页");
        return;
    }

    debugStep("已在消息页");
    const items = collectN50Items();
    debugStep("准备展示结果", "条目数=" + items.length);
    showItemsDialog(items);

    utils.randomSleep(1000);
    debugStep("开始上滑");
    utils.swipeUpPageHuman();
    utils.randomSleep(1000);
    debugStep("runTask结束");
}

// 防止退出
setInterval(() => {}, 1000);
