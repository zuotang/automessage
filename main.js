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

function isCenterInRect(node, rect) {
    if (!node || !rect) return false;
    const b = node.bounds();
    const cx = b.centerX();
    const cy = b.centerY();
    return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
}

function findChildByIdInCard(card, viewId) {
    try {
        const cardRect = nodeBounds(card);
        if (!cardRect) return null;

        const list = id(viewId).find();
        for (let i = 0; i < list.size(); i++) {
            const node = list.get(i);
            if (isCenterInRect(node, cardRect)) {
                return node;
            }
        }
    } catch (e) {}
    return null;
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

// 获取多个 id=n50 的元素数据
function collectN50Items() {
    debugStep("开始抓取n50");
    const cards = id("n50").find();
    let dataLen = cards.size();
    debugStep("抓取到条目", String(dataLen));
    const results = [];

    for (let i = 0; i < dataLen; i++) {
        try {
            const card = cards.get(i);

        const nameNode = findChildByIdInCard(card, "as7");
        const contentNode = findChildByIdInCard(card, "igq");
        const dateNode = findChildByIdInCard(card, "igt");
        const avatarNode = findChildByIdInCard(card, "ogb");

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
            debugStep("第" + (i + 1) + "条完成");
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
    debugStep("启动应用", "com.zhiliaoapp.musically");
    app.launchPackage("com.zhiliaoapp.musically");

    utils.randomSleep(2000);

    if (!running) return;

    debugStep("尝试点击Inbox");
    let ok = utils.tClick(["Inbox", "消息", "收件箱"], 0, 0.75, () => !running);

    if (ok) {
        debugStep("点击Inbox成功");
        utils.randomSleep(1200);

        const items = collectN50Items();
        debugStep("准备展示结果", "条目数=" + items.length);
        showItemsDialog(items);
    } else {
        debugStep("没找到Inbox");
    }

    utils.randomSleep(1000);
    debugStep("开始上滑");
    utils.swipeUpPageHuman();
    utils.randomSleep(1000);
    debugStep("runTask结束");
}

// 防止退出
setInterval(() => {}, 1000);
