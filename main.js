"auto";

const PROJECT_DIR = files.path(".");
const utils = require(files.join(PROJECT_DIR, "lib/utils.js"));

let running = false;
let worker = null;

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

// 获取多个 id=n50 的元素数据
function collectN50Items() {
    const cards = id("n50").find();
    toast('抓取到' + cards.size() + '条数据');
    const results = [];

    for (let i = 0; i < cards.size(); i++) {
        const card = cards.get(i);

        const nameNode = card.findOnce(id("as7"));
        const contentNode = card.findOnce(id("igq"));
        const dateNode = card.findOnce(id("igt"));
        const avatarNode = card.findOnce(id("ogb"));

        results.push({
            nickname: nodeText(nameNode),
            content: nodeText(contentNode),
            date: nodeText(dateNode),
            avatar: {
                textOrDesc: nodeText(avatarNode),
                bounds: nodeBounds(avatarNode)
            }
        });
    }

    return results;
}

// 悬浮窗
let w = floaty.window(
    <frame>
        <button id="toggle" text="开启79" w="60" h="40" bg="#AA00CC66"/>
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
    ui.run(() => {
        w.toggle.setText("关闭33");
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
                w.toggle.setText("开启66");
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
    app.launchPackage("com.zhiliaoapp.musically");

    utils.randomSleep(2000);

    if (!running) return;

    let ok = utils.tClick(["Inbox", "消息", "收件箱"], 0, 0.75, () => !running);

    if (ok) {
        toast("点击成功");
        utils.randomSleep(1200);

        const items = collectN50Items();
          toast("抓完数据");
        dialogs.alert("n50抓取结果", "条目数: " + items.length + "\n\n" + JSON.stringify(items, null, 2));
    } else {
        toast("没找到");
    }

    utils.randomSleep(1000);
    utils.swipeUpPageHuman();
    utils.randomSleep(1000);
}

// 防止退出
setInterval(() => {}, 1000);
