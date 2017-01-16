// Copyright 2010 William Malone (www.williammalone.com)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
var clickDrag = [];
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

//var host = 'http://localhost:8000/owls/';
var numOwls = 25;
var curOwl = 0;

var drawingAllowed = false;

var socket = io.connect('http://127.0.0.1:5555/');
var elem;

//function setupSocket() {
//    socket.on('bodyFrame', function (bodyFrame) {
//        var index = 0;
//        bodyFrame.bodies.forEach(function (body) {
//            if (body.tracked) {
//                //draw hand states
//                paint = true;
//                var LX = body.joints[7].depthX * canvasWidth;
//                var LY = body.joints[7].depthY * canvasHeight;
//
//                var RX = body.joints[11].depthX * canvasWidth;
//                var RY = body.joints[11].depthY * canvasHeight;
//
//                addClick(LX, LY, true, true);
//                addClick(RX, RY, true, false);
//                redraw();
//                index++;
//            }
//        });
//    });
//}


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


function countDown() {
    clearCanvas();
    clearHistory();
    $('#getReady').show();
    $('#message').show();
    var i = 0;
    var text = ['3', '2', '1', 'Go!', ''];
    var id = setInterval(function () {
        $('#countDown').html(text[i]);
        if (i === 4) {
            drawCircles();
            window.clearInterval(id);
            drawingTimer();
        }
        i++;
    }, 1000);
}

//
//function drawingTimer() {
//
//    drawingAllowed = true;
//
//    $('#getReady').hide();
//
//    var timerCount = 0;
//    $('#drawingCountDown').html(numSeconds + 1);
//    $('#drawingCountDown').show();
//
//    // load the image now so it'll be ready in the transition
//    var owlVal = getRandomInt(0, numOwls);
//    var image = host + owlVal + '.jpg';
//    $('#owlDiv').css('background-image', 'url(' + image + ')');
//    curOwl++;
//
//    // countdown timer
//    var timerId = setInterval(function () {
//        $('#drawingCountDown').html(numSeconds - timerCount);
//        timerCount++;
//    }, 1000);
//
//    // 30 seconds for the owl to display
//    setTimeout(function () {
//        processingOwl(timerId);
//    }, numMilliSeconds);
//}
//
//function processingOwl(id) {
//
//    drawingAllowed = false;
//    $('#message').hide();
//    $('#drawingCountDown').hide();
//    window.clearInterval(id);
//
//    $('#processOwl').show();
//    var q = 0;
//    var text = ['..', '.', '&nbsp;'];
//    var poID = setInterval(function () {
//        $('#processing').html(text[q]);
//        if (q === 3) {
//            $('#processing').html('...');
//            $('#processOwl').hide();
//            showOwl(poID);
//        }
//        q++;
//    }, 1000);
//}
//
//
///**
// * Show the 'finished' owl
// */
//function showOwl(id) {
//    window.clearInterval(id);
//
//    $('#owlDiv').show();
//    setTimeout(function () {
//        $('#owlDiv').hide();
//        countDown();
//    }, showOwlTime);
//}


///**
// * Creates a canvas element, loads images, adds events, and draws the canvas for the first time.
// */
//function prepareCanvas() {
//    canvasWidth = $(window).width();
//    drawingAreaWidth = canvasWidth;
//    canvasHeight = $(window).height();
//    drawingAreaHeight = canvasHeight;
//    // Create the canvas (Neccessary for IE because it doesn't know what a canvas element is)
//    var canvasDiv = document.getElementById('canvasDiv');
//    canvas = document.createElement('canvas');
//    canvas.setAttribute('width', canvasWidth);
//    canvas.setAttribute('height', canvasHeight);
//    canvas.setAttribute('id', 'canvas');
//    canvasDiv.appendChild(canvas);
//    context = canvas.getContext("2d"); // Grab the 2d canvas context
//
//    document.getElementById("canvasDiv");
//    redraw();
//    countDown();
//
//}

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
    } else {
        clickRX.push(x);
        clickRY.push(y);
    }
    clickTool.push(curTool);
    clickSize.push("huge");
    clickDrag.push(dragging);
}

/**
 * Clears the canvas.
 */
function clearCanvas() {
    // change the color
    curLColor = colors[Math.floor(Math.random() * colors.length)];
    curRColor = colors[Math.floor(Math.random() * colors.length)];
    context.fillStyle = "black";
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
    context.strokeStyle = '#FFFFFF';
    context.stroke();
    context.beginPath();
    context.arc(center2X, center2Y, radius2, 0, 2 * Math.PI, false);
    context.lineWidth = 5;
    context.strokeStyle = '#FFFFFF';
    context.stroke();
}

function clearHistory() {
    clickRX = [];
    clickRY = [];
    clickLX = [];
    clickLY = [];
    clearCanvas();

    numSeconds = getRandomInt(10, 22);
}

/**
 * Redraws the canvas.
 */
function redraw() {
    // Keep the drawing in the drawing area
    context.save();
    context.beginPath();
    context.rect(drawingAreaX, drawingAreaY, drawingAreaWidth, drawingAreaHeight);
    context.clip();

    var radius = 20;
    var i = 0;
    for (i = 0; i < clickRX.length; i++) {

        context.beginPath();
        if (clickDrag[i] && i) {
            context.moveTo(clickRX[i - 1], clickRY[i - 1]);
        } else {
            context.moveTo(clickRX[i], clickRY[i]);
        }
        context.lineTo(clickRX[i], clickRY[i]);
        context.closePath();

        if (clickTool[i] == "eraser") {
            //context.globalCompositeOperation = "destination-out"; // To erase instead of draw over with white
            context.strokeStyle = 'white';
        } else {
            //context.globalCompositeOperation = "source-over";	// To erase instead of draw over with white
            context.strokeStyle = curLColor;
        }
        context.lineJoin = "round";
        context.lineWidth = radius;
        context.stroke();

    }

    for (var j = 0; j < clickLX.length; j++) {

        context.beginPath();
        if (clickDrag[j] && j) {
            context.moveTo(clickLX[j - 1], clickRY[j - 1]);
        } else {
            context.moveTo(clickLX[j], clickRY[j]);
        }
        context.lineTo(clickLX[j], clickRY[j]);
        context.closePath();

        if (clickTool[j] == "eraser") {
            context.strokeStyle = 'white';
        } else {
            context.strokeStyle = curRColor;
        }
        context.lineJoin = "round";
        context.lineWidth = radius;
        context.stroke();

    }

    context.restore();

    // Overlay a crayon texture (if the current tool is crayon)
    if (curTool == "crayon") {
        context.globalAlpha = 0.4; // No IE support
        context.drawImage(crayonTextureImage, 0, 0, canvasWidth, canvasHeight);
    }
    context.globalAlpha = 1; // No IE support

}
