// 文本点击
function tClick(values, x, y, shouldStop) {
    x = x || 0;
    y = y || 0;

    if (!(values instanceof Array)) {
        values = [values];
    }

    function inRange(n) {
        let b = n.bounds();
        let cx = b.centerX();
        let cy = b.centerY();

        let okX = true;
        let okY = true;

        if (x > 0) okX = cx > device.width * x;
        else if (x < 0) okX = cx < device.width * Math.abs(x);

        if (y > 0) okY = cy > device.height * y;
        else if (y < 0) okY = cy < device.height * Math.abs(y);

        return okX && okY;
    }

    function findAndClick(list) {
        for (let i = 0; i < list.size(); i++) {
            if (typeof shouldStop === "function" && shouldStop()) return true;

            let n = list.get(i);
            if (inRange(n)) {
                let b = n.bounds();
                randomClick(b.centerX(), b.centerY());
                return true;
            }
        }
        return false;
    }

    for (let k = 0; k < values.length; k++) {
        let value = values[k];

        let list1 = textContains(value).find();
        if (findAndClick(list1)) return true;

        let list2 = descContains(value).find();
        if (findAndClick(list2)) return true;
    }

    return false;
}

function randomSleep(value){
    sleep(random(value, value+500));
}

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

//模拟输入
function inputSlow(text) {
    setText("");
    for (let i = 0; i < text.length; i++) {
        input(text[i]);
        randomSleep(100);
    }
}

//随机偏移
function randomClick(x, y) {
    let dx = random(-10, 10);
    let dy = random(-10, 10);
    click(x + dx, y + dy);
}

//下滑一页
function swipeDownPageHuman() {
    let x1 = device.width * randomFloat(0.45, 0.55);
    let y1 = device.height * randomFloat(0.20, 0.30);

    let points = [];

    // 4~6个轨迹点
    let steps = random(4, 6);

    for (let i = 0; i < steps; i++) {
        let t = i / (steps - 1);

        let x = x1 + random(-30, 30); // 横向抖动
        let y = y1 + (device.height * 0.55 * t) + random(-20, 20);

        points.push([parseInt(x), parseInt(y)]);
    }

    let duration = random(600, 1100);

    gesture.apply(null, [duration].concat(points));

    randomSleep(duration);
}


//上滑一页
function swipeUpPageHuman() {
    let x1 = device.width * randomFloat(0.45, 0.55);
    let y1 = device.height * randomFloat(0.75, 0.85);

    let points = [];

    // 生成 4~6 个轨迹点
    let steps = random(4, 6);

    for (let i = 0; i < steps; i++) {
        let t = i / (steps - 1);

        let x = x1 + random(-30, 30); // 横向抖动
        let y = y1 - (device.height * 0.55 * t) + random(-20, 20);

        points.push([parseInt(x), parseInt(y)]);
    }

    let duration = random(600, 1100);

    gesture.apply(null, [duration].concat(points));

    randomSleep(duration);
}

module.exports = {
    tClick,
    inputSlow,
    swipeUpPageHuman,
    swipeDownPageHuman,
    randomClick,
    randomSleep,
};
