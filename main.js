"auto";

const PROJECT_DIR = files.path(".");
const utils = require(files.join(PROJECT_DIR, "lib/utils.js"));

let running = false;
let worker = null;
const DEBUG = true;
const COLLECT_RETRY_COUNT = 3;
const COLLECT_RETRY_SLEEP_MS = 1200;
const WAIT_MANUAL_STOP_AFTER_DONE = true;
const DEBUG_MAX_LINES = 8;
let debugLines = [];

function pushDebugLine(msg) {
    if (!DEBUG) return;
    debugLines.push(msg);
    if (debugLines.length > DEBUG_MAX_LINES) {
        debugLines = debugLines.slice(debugLines.length - DEBUG_MAX_LINES);
    }
    ui.run(() => {
        if (w && w.debugText) {
            w.debugText.setText(debugLines.join("\n"));
        }
    });
}

function debugStep(step, detail, holdMs) {
    if (DEBUG) {
        const msg = detail ? (step + " " + detail) : step;
        pushDebugLine(msg);
    }
}

function debugError(step, err, holdMs) {
    const msg = err ? (step + ": " + String(err)) : step;
    pushDebugLine("错误 " + (msg.length > 80 ? msg.substring(0, 80) : msg));
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

function nodesByIdSorted(viewId, dedupByBounds) {
    if (dedupByBounds === undefined) dedupByBounds = true;
    const list = id(viewId).visibleToUser(true).find();
    const arr = [];
    const seen = {};
    for (let i = 0; i < list.size(); i++) {
        const node = list.get(i);
        const b = node.bounds();
        const key = b.left + "_" + b.top + "_" + b.right + "_" + b.bottom;
        if (dedupByBounds) {
            if (seen[key]) continue;
            seen[key] = true;
        }
        arr.push({
            node: node,
            cy: b.centerY(),
            cx: b.centerX(),
            top: b.top,
            bottom: b.bottom,
            area: Math.max(1, (b.right - b.left) * (b.bottom - b.top))
        });
    }
    arr.sort((a, b) => {
        if (a.cy !== b.cy) return a.cy - b.cy;
        return a.cx - b.cx;
    });
    return arr;
}

// n50/nwg 这类卡片容器常有父子重叠节点：按“行”分组，每行保留面积最大的一个
function cardAnchorsByRow(cardId) {
    const raw = nodesByIdSorted(cardId, false);
    const groups = [];
    const ROW_MERGE_DY = 18;

    for (let i = 0; i < raw.length; i++) {
        const cur = raw[i];
        if (groups.length === 0) {
            groups.push([cur]);
            continue;
        }
        const lastGroup = groups[groups.length - 1];
        const last = lastGroup[lastGroup.length - 1];
        if (Math.abs(cur.cy - last.cy) <= ROW_MERGE_DY) {
            lastGroup.push(cur);
        } else {
            groups.push([cur]);
        }
    }

    const anchors = [];
    for (let g = 0; g < groups.length; g++) {
        const row = groups[g];
        let best = row[0];
        for (let i = 1; i < row.length; i++) {
            if (row[i].area > best.area) best = row[i];
        }
        anchors.push(best);
    }
    return anchors;
}

function pickNodeInCard(cardRect, candidates, usedIdx, preferLeft) {
    if (!cardRect) return null;
    let bestScore = null;
    let bestIndex = -1;
    const cardCx = (cardRect.left + cardRect.right) / 2;
    const cardCy = (cardRect.top + cardRect.bottom) / 2;

    for (let i = 0; i < candidates.length; i++) {
        if (usedIdx[i]) continue;
        const c = candidates[i];
        const b = c.node.bounds();
        const cx = b.centerX();
        const cy = b.centerY();

        const inY = cy >= cardRect.top - 40 && cy <= cardRect.bottom + 40;
        const inX = cx >= cardRect.left - 40 && cx <= cardRect.right + 40;
        if (!inY || !inX) continue;

        if (preferLeft && cx > cardCx + 80) continue;

        const score = Math.abs(cy - cardCy) * 10000 + Math.abs(cx - cardCx);
        if (bestScore === null || score < bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }

    if (bestIndex < 0) return null;
    usedIdx[bestIndex] = true;
    return candidates[bestIndex].node;
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
    debugStep("开始抓取nwg");
    const rawCards = nodesByIdSorted("nwg", false);
    const cards = cardAnchorsByRow("nwg");
    const names = nodesByIdSorted("s_z");
    const contents = nodesByIdSorted("i03");
    const dates = nodesByIdSorted("i08");
    const avatars = nodesByIdSorted("ogb");
    debugStep("节点数", "rawCard" + rawCards.length + " card" + cards.length + " n" + names.length + " c" + contents.length + " d" + dates.length + " a" + avatars.length);

    const usedContent = {};
    const usedDate = {};
    const usedAvatar = {};
    const usedName = {};
    const anchorByNames = false;
    const anchors = cards;
    let dataLen = anchors.length;
    debugStep("锚点", "n50");
    debugStep("抓取到条目", String(dataLen));
    const results = [];

    for (let i = 0; i < dataLen; i++) {
        try {
            debugStep("进入第" + (i + 1) + "条");

            const anchorRect = anchors[i].node.bounds();
            const nameNode = anchorByNames ? anchors[i].node : pickNodeInCard(anchorRect, names, usedName, false);
            const contentNode = pickNodeInCard(anchorRect, contents, usedContent, false);
            const dateNode = pickNodeInCard(anchorRect, dates, usedDate, false);
            const avatarNode = pickNodeInCard(anchorRect, avatars, usedAvatar, true);

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
            const nickHint = item.nickname ? item.nickname.substring(0, 6) : "昵称空";
            debugStep("第" + (i + 1) + "条完成", nickHint);
        } catch (e) {
            debugError("第" + (i + 1) + "条抓取失败", e);
        }
    }

    debugStep("抓取结束", "有效条目=" + results.length);
    return results;
}

function collectN50ItemsWithRetry() {
    let best = [];
    for (let i = 0; i < COLLECT_RETRY_COUNT && running; i++) {
        const items = collectN50Items();
        if (items.length > best.length) {
            best = items;
        }
        if (items.length > 0) {
            return items;
        }
        if (i < COLLECT_RETRY_COUNT - 1) {
            debugStep("0条重试", String(i + 2));
            sleep(COLLECT_RETRY_SLEEP_MS);
        }
    }
    return best;
}

// 悬浮窗
let w = floaty.window(
    <vertical padding="6" bg="#66000000">
        <button id="toggle" text="开启81" w="60" h="40" bg="#AA00CC66"/>
        <text id="debugText" text="就绪" textColor="#FFFFFF" textSize="10sp" w="240" h="120"/>
    </vertical>
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
    debugLines = [];
    pushDebugLine("开始运行");
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

    pushDebugLine("已停止");
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
    const items = collectN50ItemsWithRetry();
    debugStep("准备展示结果", "条目数=" + items.length);
    showItemsDialog(items);
    debugStep("runTask结束");

    if (WAIT_MANUAL_STOP_AFTER_DONE) {
        debugStep("等待手动停止");
        while (running) {
            sleep(300);
        }
    }
}

// 防止退出
setInterval(() => {}, 1000);
