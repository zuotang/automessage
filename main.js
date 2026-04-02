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
const UNREAD_BADGE_REF_BOUNDS = { left: 1313, top: 1368, right: 1371, bottom: 1426 };
const NON_MESSAGE_REF_BOUNDS = { left: 1300, top: 1607, right: 1384, bottom: 1691 };
const UNREAD_BADGE_TOLERANCE_PX = 5;
let debugLines = [];

function ensureStartupPermissions() {
    try {
        auto.waitFor();
    } catch (e) {
        toastLog("无障碍服务未就绪: " + e);
    }

    try {
        if (typeof floaty !== "undefined" && floaty.checkPermission && !floaty.checkPermission()) {
            floaty.requestPermission();
            sleep(800);
        }
    } catch (e) {
        toastLog("悬浮窗权限检查失败: " + e);
    }

}

ensureStartupPermissions();

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

function boundsSize(bounds) {
    if (!bounds) return null;
    return {
        width: Math.max(0, bounds.right - bounds.left),
        height: Math.max(0, bounds.bottom - bounds.top)
    };
}

function nodeIdMatch(node, shortId) {
    if (!node) return false;
    try {
        const nid = node.id();
        if (!nid) return false;
        return nid === shortId || nid.endsWith("/" + shortId);
    } catch (e) {
        return false;
    }
}

function findChildByIdCompat(root, shortId) {
    if (!root) return null;
    const stack = [root];
    while (stack.length > 0) {
        const n = stack.pop();
        if (nodeIdMatch(n, shortId)) return n;
        try {
            const cnt = n.childCount();
            for (let i = cnt - 1; i >= 0; i--) {
                const c = n.child(i);
                if (c) stack.push(c);
            }
        } catch (e) {}
    }
    return null;
}

function nodesByIdSorted(viewId, dedupByBounds,isVisibleOnly) {
    if (dedupByBounds === undefined) dedupByBounds = true;
    if (isVisibleOnly === undefined) isVisibleOnly = true;
    
    let list = [];//
    if(isVisibleOnly){
        list = id(viewId).visibleToUser(isVisibleOnly).find();
    }else{
        list = id(viewId).find();
    }
    
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

function findChildByFilter(root, filterFn) {
    if (!root || typeof filterFn !== "function") return null;
    const stack = [root];
    while (stack.length > 0) {
        const n = stack.pop();
        try {
            if (filterFn(n)) return n;
        } catch (e) {}
        try {
            const cnt = n.childCount();
            for (let i = cnt - 1; i >= 0; i--) {
                const c = n.child(i);
                if (c) stack.push(c);
            }
        } catch (e) {}
    }
    return null;
}

function isUnreadBadgeNode(node) {
    if (!node) return false;
    if (!nodeIdMatch(node, "dq2")) return false;
    try {
        if (node.packageName() !== "com.zhiliaoapp.musically") return false;
    } catch (e) {
        return false;
    }
    try {
        if (node.depth() !== 19) return false;
    } catch (e) {
        return false;
    }

    const nodeRect = nodeBounds(node);
    const nodeSize = boundsSize(nodeRect);
    const refSize = boundsSize(UNREAD_BADGE_REF_BOUNDS);
    const nonMsgRefSize = boundsSize(NON_MESSAGE_REF_BOUNDS);
    if (!nodeSize || !refSize || !nonMsgRefSize) return false;

    const isNearNonMessageSize =
        Math.abs(nodeSize.width - nonMsgRefSize.width) <= UNREAD_BADGE_TOLERANCE_PX &&
        Math.abs(nodeSize.height - nonMsgRefSize.height) <= UNREAD_BADGE_TOLERANCE_PX;
    if (isNearNonMessageSize) return false;

    return Math.abs(nodeSize.width - refSize.width) <= UNREAD_BADGE_TOLERANCE_PX &&
        Math.abs(nodeSize.height - refSize.height) <= UNREAD_BADGE_TOLERANCE_PX;
}

function openFirstUnreadCard() {
    const rawCards = id("nwg").visibleToUser(true).find();
    const refSize = boundsSize(UNREAD_BADGE_REF_BOUNDS);
    debugStep("检查未读卡片", "总数=" + rawCards.size());

    for (let i = 0; i < rawCards.size(); i++) {
        if (!running) return false;
        const card = rawCards.get(i);
        const unreadBadge = findChildByFilter(card, isUnreadBadgeNode);
        if (!unreadBadge) continue;

        const badgeRect = nodeBounds(unreadBadge);
        const badgeSize = boundsSize(badgeRect);
        const cardRect = nodeBounds(card);
        if (!cardRect || !badgeSize || !refSize) continue;

        debugStep(
            "命中未读",
            "idx=" + i + " badge=" + badgeSize.width + "x" + badgeSize.height + " ref=" + refSize.width + "x" + refSize.height
        );

        utils.randomClick(
            Math.floor((cardRect.left + cardRect.right) / 2),
            Math.floor((cardRect.top + cardRect.bottom) / 2)
        );
        sleep(1200);
        return true;
    }

    debugStep("未找到未读卡片");
    return false;
}

// n50/nwg 这类卡片容器常有父子重叠节点：按“行”分组，每行保留面积最大的一个
function cardAnchorsByRow(cardId) {
    const raw = nodesByIdSorted(cardId, false,false);
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
    const rawCards = id("nwg").visibleToUser(true).find();
    debugStep("抓取到条目", String(rawCards.size()));
    const results = [];

    for (let i = 0; i < rawCards.size(); i++) {
        try {
            debugStep("进入第" + (i + 1) + "条");
            let card = rawCards.get(i);

            // 在当前卡片内查找
            let nameNode = findChildByIdCompat(card, "s_z");
            let contentNode = findChildByIdCompat(card, "i03");
            let dateNode = findChildByIdCompat(card, "i08");
            let avatarNode = findChildByIdCompat(card, "ogb");

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
            debugStep("name", item.nickname || "");
            debugStep("content", item.content || "");
            debugStep("date", item.date || "");
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
        <button id="toggle" text="开启82" w="60" h="40" bg="#AA00CC66"/>
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
    const opened = openFirstUnreadCard();
    debugStep("点击未读结果", opened ? "已进入聊天" : "无未读");
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
