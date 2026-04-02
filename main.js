"auto";

const PROJECT_DIR = files.path(".");
const utils = require(files.join(PROJECT_DIR, "lib/utils.js"));

let running = false;
let worker = null;
const DEBUG = true;
const COLLECT_RETRY_COUNT = 3;
const COLLECT_RETRY_SLEEP_MS = 1200;
const WAIT_MANUAL_STOP_AFTER_DONE = false;
const SHOW_RESULT_DIALOG = false;
const DEBUG_MAX_LINES = 200;
const UNREAD_BADGE_REF_BOUNDS = { left: 1313, top: 1368, right: 1371, bottom: 1426 };
const NON_MESSAGE_REF_BOUNDS = { left: 1300, top: 1607, right: 1384, bottom: 1691 };
const UNREAD_BADGE_TOLERANCE_PX = 5;
const CARD_SEARCH_MAX_NODES = 600;
const CARD_SEARCH_MAX_MS = 180;
const TARGET_PACKAGES = [
    "com.zhiliaoapp.musically",
    "com.ss.android.ugc.trill",
    "com.ss.android.ugc.aweme"
];
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

function isTargetPackage(pkg) {
    if (!pkg) return false;
    for (let i = 0; i < TARGET_PACKAGES.length; i++) {
        if (pkg === TARGET_PACKAGES[i]) return true;
    }
    return false;
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
    const start = Date.now();
    let visited = 0;
    const stack = [root];
    while (stack.length > 0) {
        if (!running) return null;
        if (visited++ > CARD_SEARCH_MAX_NODES) {
            debugStep("卡片搜索超限", "id=" + shortId + " nodes>" + CARD_SEARCH_MAX_NODES);
            return null;
        }
        if (Date.now() - start > CARD_SEARCH_MAX_MS) {
            debugStep("卡片搜索超时", "id=" + shortId + " >" + CARD_SEARCH_MAX_MS + "ms");
            return null;
        }
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
    const start = Date.now();
    let visited = 0;
    const stack = [root];
    while (stack.length > 0) {
        if (!running) return null;
        if (visited++ > CARD_SEARCH_MAX_NODES) {
            debugStep("卡片过滤超限", "nodes>" + CARD_SEARCH_MAX_NODES);
            return null;
        }
        if (Date.now() - start > CARD_SEARCH_MAX_MS) {
            debugStep("卡片过滤超时", ">" + CARD_SEARCH_MAX_MS + "ms");
            return null;
        }
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
    // 仅靠容器 id 可能在首页误命中，这里做组合判定：
    // 1) 必须在 TikTok 包内
    // 2) 必须有消息列表容器（nwg 或 n50）可见
    // 3) 必须有消息卡片字段（昵称/内容/日期）至少一个可见
    if (!isTargetPackage(currentPackage())) return false;

    const containerVisible =
        id("nwg").visibleToUser(true).find().size() > 0 ||
        id("n50").visibleToUser(true).find().size() > 0;
    if (!containerVisible) return false;

    const cardFieldVisible =
        id("s_z").visibleToUser(true).find().size() > 0 ||
        id("i03").visibleToUser(true).find().size() > 0 ||
        id("i08").visibleToUser(true).find().size() > 0;
    if (!cardFieldVisible) return false;

    return true;
}

function inboxProbeState() {
    const pkg = currentPackage();
    const nwg = id("nwg").visibleToUser(true).find().size();
    const n50 = id("n50").visibleToUser(true).find().size();
    const sz = id("s_z").visibleToUser(true).find().size();
    const i03 = id("i03").visibleToUser(true).find().size();
    const i08 = id("i08").visibleToUser(true).find().size();
    return { pkg, nwg, n50, sz, i03, i08 };
}

function tryOpenInboxTab() {
    // 优先按文案/无障碍描述点击
    const byText = utils.tClick(["Inbox", "消息", "收件箱"], 0, 0.72, () => !running);
    if (byText) {
        debugStep("已点消息入口", "text/desc");
        return true;
    }

    // 兜底：底部消息 tab 多点位轮询，适配不同机型/布局
    const y = Math.floor(device.height * 0.965);
    const ratios = [0.86, 0.9, 0.94];
    for (let i = 0; i < ratios.length; i++) {
        const x = Math.floor(device.width * ratios[i]);
        utils.randomClick(x, y);
        sleep(300);
        if (isInInboxPage()) {
            debugStep("已点消息入口", "bottom-tab-" + ratios[i]);
            return true;
        }
    }
    debugStep("已点消息入口", "bottom-tab-fallback");
    return true;
}

function ensureInboxPage(timeoutMs) {
    const start = Date.now();
    let lastLaunchAt = 0;
    let launchIdx = 0;

    while (running && Date.now() - start < timeoutMs) {
        const elapsed = Date.now() - start;
        const probe = inboxProbeState();
        debugStep("消息页探测", "t=" + elapsed + " pkg=" + probe.pkg + " nwg=" + probe.nwg + " n50=" + probe.n50 + " s_z=" + probe.sz + " i03=" + probe.i03 + " i08=" + probe.i08);
        if (isInInboxPage()) {
            debugStep("已进入消息页", elapsed + "ms");
            return true;
        }

        const pkg = currentPackage();
        if (!isTargetPackage(pkg)) {
            if (Date.now() - lastLaunchAt > 3000) {
                const target = TARGET_PACKAGES[launchIdx % TARGET_PACKAGES.length];
                launchIdx++;
                debugStep("启动应用", target);
                app.launchPackage(target);
                lastLaunchAt = Date.now();
            }
            sleep(800);
            continue;
        }

        debugStep("未在消息页", elapsed + "ms");
        tryOpenInboxTab();
        sleep(1200);
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
            const cb = nodeBounds(card);
            if (cb) {
                debugStep("卡片bounds", "第" + (i + 1) + "条 " + cb.left + "," + cb.top + "," + cb.right + "," + cb.bottom);
            }

            // 在当前卡片内查找
            const tName = Date.now();
            debugStep("字段查询开始", "第" + (i + 1) + "条/s_z");
            let nameNode = findChildByIdCompat(card, "s_z");
            debugStep("字段查询结束", "第" + (i + 1) + "条/s_z 命中=" + (nameNode ? 1 : 0) + " 耗时=" + (Date.now() - tName) + "ms");

            const tContent = Date.now();
            debugStep("字段查询开始", "第" + (i + 1) + "条/i03");
            let contentNode = findChildByIdCompat(card, "i03");
            debugStep("字段查询结束", "第" + (i + 1) + "条/i03 命中=" + (contentNode ? 1 : 0) + " 耗时=" + (Date.now() - tContent) + "ms");

            const tDate = Date.now();
            debugStep("字段查询开始", "第" + (i + 1) + "条/i08");
            let dateNode = findChildByIdCompat(card, "i08");
            debugStep("字段查询结束", "第" + (i + 1) + "条/i08 命中=" + (dateNode ? 1 : 0) + " 耗时=" + (Date.now() - tDate) + "ms");

            const tAvatar = Date.now();
            debugStep("字段查询开始", "第" + (i + 1) + "条/ogb");
            let avatarNode = findChildByIdCompat(card, "ogb");
            debugStep("字段查询结束", "第" + (i + 1) + "条/ogb 命中=" + (avatarNode ? 1 : 0) + " 耗时=" + (Date.now() - tAvatar) + "ms");
            if (!nameNode && !contentNode && !dateNode) {
                debugStep("跳过第" + (i + 1) + "条", "卡片搜索超时或未命中字段");
                continue;
            }

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
        <button id="toggle" text="开启84" w="60" h="40" bg="#AA00CC66"/>
        <ScrollView w="260" h="180">
            <text
                id="debugText"
                text="就绪"
                textColor="#FFFFFF"
                textSize="10sp"
                w="260"
            />
        </ScrollView>
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
    if (SHOW_RESULT_DIALOG) {
        showItemsDialog(items);
    }
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
