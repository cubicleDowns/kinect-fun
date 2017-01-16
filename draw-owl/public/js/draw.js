var canvas;
var context;
var canvasWidth = 490;
var canvasHeight = 220;

var crayonTextureImage = new Image();
var clickRX = [];
var clickRY = [];
var clickLX = [];
var clickLY = [];
var clickColor = [];
var clickTool = [];
var clickSize = [];
var clickDragL = [];
var clickDragR = [];
var paint = false;
var curLColor = "#39FF14";
var curRColor = "#F66733";
var colors = ["#39FF14", "#F66733", "#522D80", "#FFFFFF", "#F12E45"];
var curTool = "crayon";
var drawingAreaX = 0;
var drawingAreaY = 0;
var drawingAreaWidth = 267;
var drawingAreaHeight = 200;
var sizeHotspotWidthObject = {};
sizeHotspotWidthObject.huge = 39;
sizeHotspotWidthObject.large = 25;
sizeHotspotWidthObject.normal = 18;
sizeHotspotWidthObject.small = 16;

// number of seconds to draw
var numSeconds = 11;
var numMilliSeconds = (numSeconds + 1) * 1000;

var showOwlTime = 5000;

var host = 'http://localhost:8000/owls/';
var numOwls = 25;
var curOwl = 0;

var drawingAllowed = false;

var socket = io.connect('http://kinect3.ngrok.io:80/');
var elem;

var buff = 0.2;
var buffMulti = 1.0 / (1.0 - (2 * buff));
var maxBuff = 1.0 - buff;

var radius = 40;


function FOVify(fovnum) {

    var buff = 0.1;
    var num = false;

    if (fovnum >= buff && fovnum <= maxBuff) {
        num = (fovnum - buff) * buffMulti;
        return num;
    } else {
        return false;
    }
}

function setupSocket() {
    socket.on('bodyFrame', function (bodyFrame) {
        //ctx.clearRect(0, 0, canvas.width, canvas.height);
        var index = 0;
        var alreadyTracked = false;

        for (var i = 0; i < bodyFrame.bodies.length; i++) {
            var body = bodyFrame.bodies[i];

            if (body.tracked && !alreadyTracked) {
                alreadyTracked = true;
                //draw hand states
                paint = true;

                var LposX = FOVify(body.joints[7].depthX);
                var LposY = FOVify(body.joints[7].depthY);
                var RposX = FOVify(body.joints[11].depthX);
                var RposY = FOVify(body.joints[11].depthY);

                if (LposX && LposY) {
                    var LX = LposX * canvasWidth;
                    var LY = LposY * canvasHeight;
                }

                if (RposX && RposY) {
                    var RX = RposX * canvasWidth;
                    var RY = RposY * canvasHeight;
                }

                var updateMeL = false;
                var updateMeR = false;
                if (body.leftHandState === 2 && LposX && LposY) {
                   updateMeL = true;
                    addClick(LX, LY, true, true);
                }

                if (body.rightHandState === 2 && RposX && RposY) {
                    updateMeR = true;
                    addClick(RX, RY, true, false);
                }

                if (updateMeL || updateMeR) {
                    redraw(updateMeL, updateMeR);
                    //restartPath(!updateMeL, !updateMeR, true);
                }
                index++;
            }
        }
    });
}


function makeFullScreen() {
    $("#getReady").off("click");
    if ((document.fullScreenElement && document.fullScreenElement !== null) ||
        (!document.mozFullScreen && !document.webkitIsFullScreen)) {
        if (document.documentElement.requestFullScreen) {
            document.documentElement.requestFullScreen();
        } else if (document.documentElement.mozRequestFullScreen) {
            document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.webkitRequestFullScreen) {
            document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
        }
    } else {
        if (document.cancelFullScreen) {
            document.cancelFullScreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitCancelFullScreen) {
            document.webkitCancelFullScreen();
        }
    }
}


var countDownTimer = 2000;

function countDown() {
    clearCanvas();
    clearHistory();
    setupSocket();
    $('#getReady').show();
    $('#message').hide();
    var i = 0;
    var text = ['First draw two circles', '&nbsp;', 'Open your hands', 'Draw the owl', ''];
    var id = setInterval(function () {
        $('#countDown').html(text[i]);

        if(i === 0){
            $('#ready').hide();
        } else if(i === 1){
            drawCircles();
        } else if (i === 5) {
            window.clearInterval(id);
            drawingTimer();
        }
        i++;
    }, countDownTimer);
}


function drawingTimer() {

    drawingAllowed = true;

    $('#getReady').hide();

    var timerCount = 1;
    $('#drawingCountDown').html(numSeconds + 1);
    $('#drawingCountDown').show();

    // load the image now so it'll be ready in the transition
    var owlVal = getRandomInt(0, numOwls);
    var image = host + owlVal + '.jpg';
    $('#owlDiv').css('background-image', 'url(' + image + ')');
    curOwl++;

    // countdown timer
    var timerId = setInterval(function () {
        $('#drawingCountDown').html(numSeconds - timerCount);
        timerCount++;
    }, 1000);

    // 30 seconds for the owl to display
    setTimeout(function () {
        processingOwl(timerId);
    }, numMilliSeconds - 2000);
}

function processingOwl(id) {

    drawingAllowed = false;
    $('#message').hide();
    $('#drawingCountDown').hide();
    window.clearInterval(id);

    $('#processOwl').show();
    var q = 0;
    var text = ['..', '.', '&nbsp;'];
    var poID = setInterval(function () {
        $('#processing').html(text[q]);
        if (q === 3) {
            $('#processing').html('...');
            $('#processOwl').hide();
            showOwl(poID);
        }
        q++;
    }, 1500);
}


/**
 * Show the 'finished' owl
 */
function showOwl(id) {
    window.clearInterval(id);

    $('#owlDiv').show();
    setTimeout(function () {
        $('#owlDiv').hide();
        countDown();
    }, showOwlTime);
}


/**
 * Creates a canvas element, loads images, adds events, and draws the canvas for the first time.
 */
function prepareCanvas() {
    canvasWidth = $(window).width();
    drawingAreaWidth = canvasWidth;
    canvasHeight = $(window).height();
    drawingAreaHeight = canvasHeight;
    // Create the canvas (Neccessary for IE because it doesn't know what a canvas element is)
    var canvasDiv = document.getElementById('canvasDiv');
    canvas = document.createElement('canvas');
    canvas.setAttribute('width', canvasWidth);
    canvas.setAttribute('height', canvasHeight);
    canvas.setAttribute('id', 'canvas');
    canvasDiv.appendChild(canvas);
    context = canvas.getContext("2d"); // Grab the 2d canvas context

    document.getElementById("canvasDiv");
    redraw();
    countDown();

}

/**
 * Adds a point to the drawing array.
 * @param x
 * @param y
 * @param dragging
 * @param {boolean} LEFT_HAND
 */
function addClick(x, y, dragging, LEFT_HAND) {

    if (!drawingAllowed) {
        return;
    }
    if (LEFT_HAND) {
        clickLX.push(x);
        clickLY.push(y);
        clickDragL.push(dragging);
    } else {
        clickRX.push(x);
        clickRY.push(y);
        clickDragR.push(dragging);
    }
}

/**
 * Clears the canvas.
 */
function clearCanvas() {
    // change the color
    curLColor = colors[Math.floor(Math.random() * colors.length)];
    curRColor = colors[Math.floor(Math.random() * colors.length)];
    context.fillStyle = "black";
    context.lineJoin = "round";
    context.lineWidth = radius;

    context.fillRect(0, 0, canvasWidth, canvasHeight);

}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
}

function drawCircles() {

    //draw two circles
    var center1X = canvasWidth / 2.2;
    var center1Y = canvasHeight / 4.2;
    var center2X = canvasHeight;
    var center2Y = (canvasHeight / 4) * 2.5;
    var radius1 = canvasHeight / 6;
    var radius2 = canvasHeight / 4;
    context.beginPath();
    context.arc(center1X, center1Y, radius1, 0, 2 * Math.PI, false);
    context.lineWidth = 5;
    context.strokeStyle = '#444444';
    context.stroke();
    context.beginPath();
    context.arc(center2X, center2Y, radius2, 0, 2 * Math.PI, false);
    context.lineWidth = 5;
    context.stroke();
}

function restartPath(left, right, both) {
    if (right || both) {
        clickRX = [];
        clickRY = [];
        clickDragR = [];
    } else if (left || both) {
        clickLX = [];
        clickLY = [];
        clickDragL = [];
    }
}


function clearHistory() {
    clickRX = [];
    clickRY = [];
    clickLX = [];
    clickLY = [];
    clickDragL = [];
    clickDragR = [];
    clearCanvas();

    numSeconds = getRandomInt(10, 22);
    numMilliSeconds = numSeconds * 1000;
}

/**
 * Redraws the canvas.
 */
function redraw(left, right) {

    if (left) {
        context.beginPath();
        context.strokeStyle = curLColor;
        for (var j = 0; j < clickLX.length; j++) {
            if (clickDragL[j] && j) {
                context.moveTo(clickLX[j - 1], clickLY[j - 1]);
            } else {
                context.moveTo(clickLX[j], clickLY[j]);
            }
            context.lineTo(clickLX[j], clickLY[j]);
        }
        context.stroke();
    } else {
        restartPath(true, false, false);
    }

    if (right) {
        context.beginPath();
        context.strokeStyle = curRColor;
        for (var i = 0; i < clickRX.length; i++) {
            if (clickDragR[i] && i) {
                context.moveTo(clickRX[i - 1], clickRY[i - 1]);
            } else {
                context.moveTo(clickRX[i], clickRY[i]);
            }
            context.lineTo(clickRX[i], clickRY[i]);
        }
        context.stroke();
    } else {
        restartPath(false, true, false);
    }

}
