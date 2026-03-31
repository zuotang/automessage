
auto.waitFor();
"auto";

const PROJECT_DIR = files.path(".");

function r(relPath) {
    const fullPath = files.join(PROJECT_DIR, relPath);
    log("准备加载模块: " + fullPath);
    log("文件是否存在: " + files.exists(fullPath));

    if (files.exists(fullPath)) {
        log("文件内容预览: ");
        log(files.read(fullPath));
    }

    return require(fullPath);
}

try {
    log("当前目录: " + PROJECT_DIR);
    log("main.js 存在: " + files.exists(files.join(PROJECT_DIR, "main.js")));
    log("utils.js 存在: " + files.exists(files.join(PROJECT_DIR, "lib/utils.js")));
    log("task.js 存在: " + files.exists(files.join(PROJECT_DIR, "lib/task.js")));

    const utils = r("lib/utils.js");

    utils.randomSleep(100);
} catch (e) {
    console.error(e);
    toastLog("main.js 运行异常: " + e.message);
}



let running = false;
let worker = null;

// 悬浮窗
let w = floaty.window(
    <frame>
        <button id="toggle" text="开启" w="60" h="40" bg="#AA00CC66"/>
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

// 你的主逻辑
function runTask() {
    app.launchPackage("com.zhiliaoapp.musically");

    utils.randomSleep(2000);

    if (!running) return;

    let ok = utils.tClick(["Inbox", "消息", "收件箱"], 0, 0.75);

    if (ok) {
        toast("点击成功");
    } else {
        toast("没找到");
    }
    //等待1s
    utils.randomSleep(1000);
    //模拟上滑
    utils.swipeUpPageHuman();
    //等待1s
    utils.randomSleep(1000);
}




// 防止脚本直接退出
setInterval(() => {}, 1000);