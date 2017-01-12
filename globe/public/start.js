
function start() {

    if (!Detector.webgl) {
        Detector.addGetWebGLMessage();
    } else {

        var years = ['Jan2015', 'Feb2015', 'Mar2015', 'Apr2015', 'May2015', 'Jun2015', 'Jul2015', 'Aug2015', 'Sep2015', 'Oct2015', 'Nov2015', 'Dec2015', 'Jan2016', 'Feb2016', 'Mar2016', 'Apr2016', 'May2016', 'Jun2016', 'Jul2016', 'Aug2016', 'Sep2016', 'Oct2016', 'Nov2016', 'Dec2016'];
        var container = document.getElementById('container');
        var globe = new DAT.Globe(container);

        console.log(globe);
        var i, tweens = [];

        var settime = function (globe, t) {
            return function () {
                new TWEEN.Tween(globe).to({time: t / years.length}, 500).easing(TWEEN.Easing.Cubic.EaseOut).start();
                var y = document.getElementById(years[t]);
                if (y.getAttribute('class') === 'year active') {
                    return;
                }
                var yy = document.getElementsByClassName('year');
                for (i = 0; i < yy.length; i++) {
                    yy[i].setAttribute('class', 'year');
                }
                y.setAttribute('class', 'year active');
            };
        };

        var xhr;
        TWEEN.start();
        var item = 0;


        function initiateGlobe() {
            globe.createPoints();
            settime(globe, 0)();

            setInterval(function () {
                item += 1;
                item = item % years.length;
                console.log("newtime: ", item);
                settime(globe, item)();
            }, 5000);

            globe.animate();
            document.body.style.backgroundImage = 'none'; // remove loading
        }

        xhr = new XMLHttpRequest();
        xhr.open('GET', '/20152016.json', true);
        xhr.onreadystatechange = function (e) {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    var data = JSON.parse(xhr.responseText);
                    window.data = data;
                    for (i = 0; i < data.length; i++) {
                        globe.addData(data[i][1], {format: 'magnitude', name: data[i][0], animated: true});
                    }
                    initiateGlobe();
                }
            }
        };
        xhr.send(null);
    }
}

$(document).ready(function () {
    $('body').click(function () {
        makeFullScreen();
        setTimeout(function () {
            start();
        }, 1000);
    });
});

function makeFullScreen() {
    $('body').off("click");
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
