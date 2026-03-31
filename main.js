let utils = require("./lib/utils.js");

auto.waitFor();
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