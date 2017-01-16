var socket = io.connect('http://kinect1.ngrok.io:80/');
var elem;

function makeFullScreen() {
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


function getShader(gl, id) {
    var shaderScript = document.getElementById(id);
    var str = "";
    var k = shaderScript.firstChild;
    while (k) {
        if (k.nodeType == 3)
            str += k.textContent;
        k = k.nextSibling;
    }

    var fsIncScript = document.getElementById("shader-fs-inc");
    var incStr = "";
    k = fsIncScript.firstChild;
    while (k) {
        if (k.nodeType == 3)
            incStr += k.textContent;
        k = k.nextSibling;
    }

    var shader;
    if (shaderScript.type == "x-shader/x-fragment") {
        str = incStr + str;
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type == "x-shader/x-vertex")
        shader = gl.createShader(gl.VERTEX_SHADER);
    else
        return null;
    gl.shaderSource(shader, str);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) == 0)
        alert("error compiling shader '" + id + "'\n\n" + gl.getShaderInfoLog(shader));
    return shader;
}

window.requestAnimFrame = (function () {
    return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame
        || window.msRequestAnimationFrame || function (callback) {
            window.setTimeout(callback, 1000 / desiredFramerate);
        };
})();

var gl;
var ext;

var prog_copy;
var prog_advance;
var prog_composite;
var prog_blur_horizontal;
var prog_blur_vertical;
var prog_fluid_init;
var prog_fluid_add_mouse_motion;
var prog_fluid_advect;
var prog_fluid_p;
var prog_fluid_div;
var prog_move_particles;
var prog_render_particles;
var prog_sat;

var FBO_main;
var FBO_main2;
var FBO_noise;
var FBO_sat;
var FBO_blur;
var FBO_blur2;
var FBO_blur3;
var FBO_blur4;
var FBO_blur5;
var FBO_blur6;
var FBO_helper;
var FBO_helper2;
var FBO_helper3;
var FBO_helper4;
var FBO_helper5;
var FBO_helper6;
var FBO_fluid_v;
var FBO_fluid_p;
var FBO_fluid_store;
var FBO_fluid_backbuffer;
var FBO_particles; // particle positions in a texture
var FBO_particles2; // double buffer
var FBO_particle_projection; // particle render target for projection feedback effects

var texture_main_n; // main, nearest pixel
var texture_main_l; // main, linear interpolated access on the same buffer
var texture_main2_n; // main double buffer, nearest
var texture_main2_l; // main double buffer, linear
var texture_sat; // summed area table / integral image
var texture_blur; // full resolution blur result
var texture_blur2; // double blur
var texture_blur3; // quad blur
var texture_blur4; // use low resolutions wisely ;)
var texture_blur5;
var texture_blur6;
var texture_helper; // needed for multi-pass shader programs (2-pass Gaussian blur)
var texture_helper2; // (1/4 resolution )
var texture_helper3; // (1/16 resolution )
var texture_helper4; // (1/256 resolution )
var texture_helper5;
var texture_helper6;
var texture_noise_n; // nearest pixel access
var texture_noise_l; // linear interpolated
var texture_fluid_v; // velocities
var texture_fluid_p; // pressure
var texture_fluid_store;
var texture_fluid_backbuffer;
var texture_particles;
var texture_particles2;
var texture_particle_projection;

// main texture loop dimensions
var sizeX = 1024; // must be powers of 2
var sizeY = 512;
var viewX = sizeX; // viewport size (ideally exactly the texture size)
var viewY = sizeY;

// particle positions will be stored in a texture of that size
var particlesWidth = 1024;
var particlesHeight = 512;
var particleCount = particlesWidth * particlesHeight; // can also be set to lower than particlesWidth * particlesHeight

var useParticles = false;
var useProjectionFeedback = false; // rendering half a million points can slow things down significantly, don't render to texture if not needed
var useFluidSimulation = false; // the textures will be initialized anyway
var simScale = 4; // for better performance, the fluid simulation will be calculated for cells this times bigger than the main texture's pixels (powers of 2)
var useSummedAreaTable = false; // Useful for superfast multiscale boxblur. The linearized integral image calculation is the most expensive filter here, you've been warned
var maxGaussianBlurLevelUsed = 4; // not yet implemented, but doesn't cost much either. ;)

var desiredFramerate = 200;
var startFullpage = true;
var renderParticlesOnly = false;

var alwaysUseFlush = true; // experimental setting to toggle finite time execution forces (false was ok on Win7 here, but glitches on MacOS X)

// don't change vars below
var frame = 0; // frame counter to be resetted every 1000ms
var framecount = 0; // not resetted
var mainBufferToggle = 1;
var halted = false;
var fps, fpsDisplayUpdateTimer;
var time, starttime = new Date().getTime();

var mouseX = 0.5;
var mouseY = 0.5;
var oldMouseX = 0;
var oldMouseY = 0;
var mouseDx = 0;
var mouseDy = 0;

// geometry
var particleBuffer, squareBuffer, hLineBuffer, vLineBuffer;

var enableFOVify = true;

var buff = 0.2;
var buffMulti = 1.0 / (1.0 - (2 * buff));
var maxBuff = 1.0 - buff;

function FOVify(fovnum) {

    if(!enableFOVify){
        return fovnum;
    }

    var buff = 0.2;
    var num = false;

    if (fovnum >= buff && fovnum <= maxBuff) {
        num = (fovnum - buff) * buffMulti;
        return num;
    } else {
        return false;
    }
}

function load() {
    clearInterval(fpsDisplayUpdateTimer);
    var c = document.getElementById("c");
    try {
        gl = c.getContext("experimental-webgl", {
            depth: false
        });
    } catch (e) {
    }
    if (!gl) {
        alert("Meh! Y u no support experimental WebGL !?!");
        return;
    }

    ["OES_texture_float", "OES_standard_derivatives", "OES_texture_float_linear"].forEach(function (name) {
        console.log("check " + name);
        try {
            ext = gl.getExtension(name);
        } catch (e) {
            alert(e);
        }
        if (!ext) {
            alert("Meh! Y u no support " + name + " !?!\n(Chrome 29 or Firefox 24 will do fine)");
            return;
        }
        ext = false;
    });

    if (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) == 0) {
        alert("Meh! Y u no support vertex shader textures !?!");
        return;
    }


    socket.on('bodyFrame', function (bodyFrame) {
        //ctx.clearRect(0, 0, canvas.width, canvas.height);
        var index = 0;
        var fovX;
        var fovY;
        bodyFrame.bodies.forEach(function (body) {
            if (body.tracked) {

                fovX = FOVify(body.joints[3].depthX);
                fovY = FOVify(body.joints[3].depthY);

                if(fovX && fovY){
                    mouseX = fovX;
                    mouseY = 1 - fovY;
                }
            }
        });
    });

    if (startFullpage) {
        viewX = window.innerWidth;
        viewY = window.innerHeight;
    }

    c.width = viewX;
    c.height = viewY;

    prog_copy = createAndLinkProgram("shader-fs-copy");
    prog_advance = createAndLinkProgram("shader-fs-advance");
    prog_composite = createAndLinkProgram("shader-fs-composite");
    prog_blur_horizontal = createAndLinkProgram("shader-fs-blur-horizontal");
    prog_blur_vertical = createAndLinkProgram("shader-fs-blur-vertical");
    prog_sat = createAndLinkProgram("shader-fs-sat");
    prog_fluid_init = createAndLinkProgram("shader-fs-init");
    prog_fluid_add_mouse_motion = createAndLinkProgram("shader-fs-add-mouse-motion");
    prog_fluid_advect = createAndLinkProgram("shader-fs-advect");
    prog_fluid_p = createAndLinkProgram("shader-fs-p");
    prog_fluid_div = createAndLinkProgram("shader-fs-div");
    prog_move_particles = createAndLinkProgram("shader-fs-move-particles");

    triangleStripGeometry = {
        vertices: new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]),
        texCoords: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        vertexSize: 3,
        vertexCount: 4,
        type: gl.TRIANGLE_STRIP
    };

    createTexturedGeometryBuffer(triangleStripGeometry);

    hLineVertices = [];
    hLineTexCoords = [];
    for (var y = 0; y < sizeY; y++) {
        hLineVertices.push(-1, -1 + 2 * y / sizeY, 0, 1, -1 + 2 * y / sizeY, 0);
        hLineTexCoords.push(0. / sizeX, (y - 0.5) / sizeY, (sizeX + 0.) / sizeX, (y - 0.5) / sizeY);
    }
    hLineGeometry = {
        vertices: new Float32Array(hLineVertices),
        texCoords: new Float32Array(hLineTexCoords),
        vertexSize: 3,
        vertexCount: sizeY * 2,
        type: gl.LINES
    };

    vLineVertices = [];
    vLineTexCoords = [];
    for (var x = 0; x < sizeX; x++) {
        vLineVertices.push(-1 + 2 * x / sizeX, -1, 0, -1 + 2 * x / sizeX, 1, 0);
        vLineTexCoords.push((x - 0.5) / sizeX, 0. / sizeY, (x - 0.5) / sizeX, (sizeY + 0.) / sizeY);
    }
    vLineGeometry = {
        vertices: new Float32Array(vLineVertices),
        texCoords: new Float32Array(vLineTexCoords),
        vertexSize: 3,
        vertexCount: sizeX * 2,
        type: gl.LINES
    };

    createTexturedGeometryBuffer(hLineGeometry);
    createTexturedGeometryBuffer(vLineGeometry);

    squareBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, squareBuffer);

    var aPosLoc = gl.getAttribLocation(prog_advance, "aPos");
    var aTexLoc = gl.getAttribLocation(prog_advance, "aTexCoord");

    gl.enableVertexAttribArray(aPosLoc);
    gl.enableVertexAttribArray(aTexLoc);

    var verticesAndTexCoords = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1, // one square of a quad!
            0, 0, 1, 0, 0, 1, 1, 1] // hello texture, you be full
    );

    gl.bufferData(gl.ARRAY_BUFFER, verticesAndTexCoords, gl.STATIC_DRAW);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, gl.FALSE, 8, 0);
    gl.vertexAttribPointer(aTexLoc, 2, gl.FLOAT, gl.FALSE, 8, 32);

    var noisePixels = [], pixels = [], simpixels = [], pixels2 = [], pixels3 = [], pixels4 = [], pixels5 = [], pixels6 = [], particles = [], particlesIdx = [];
    var dX = 1 / particlesWidth;
    var dY = 1 / particlesHeight;
    for (var j = 0; j < sizeY; j++) {
        for (var i = 0; i < sizeX; i++) {
            noisePixels.push(Math.random(), Math.random(), Math.random(), 1);
            pixels.push(0, 0, 0, 1);
            if (i < sizeX / simScale && j < sizeY / simScale)
                simpixels.push(0, 0, 0, 1);
            if (i < sizeX / 2 && j < sizeY / 2)
                pixels2.push(0, 0, 0, 1);
            if (i < sizeX / 4 && j < sizeY / 4)
                pixels3.push(0, 0, 0, 1);
            if (i < sizeX / 8 && j < sizeY / 8)
                pixels4.push(0, 0, 0, 1);
            if (i < sizeX / 16 && j < sizeY / 16)
                pixels5.push(0, 0, 0, 1);
            if (i < sizeX / 32 && j < sizeY / 32)
                pixels6.push(0, 0, 0, 1);
            if (i < particlesWidth && j < particlesHeight) {
                particles.push(dX / 2 + i * dX, dY / 2 + j * dY, 0); // initial particle positions, here: uniform distribution
            }
        }
    }

    for (var i = 0; i < particlesHeight; i++) {
        for (var j = 0; j < particlesWidth; j++) {
            particlesIdx.push(dX / 2 + j * dX, dY / 2 + i * dY); // coordinate lookup vectors (center of pixels)
        }
    }

    FBO_main = gl.createFramebuffer();
    FBO_main2 = gl.createFramebuffer();
    var glPixels;
    glPixels = new Float32Array(noisePixels);
    texture_main_n = createAndBindTexture(glPixels, 1, FBO_main, gl.NEAREST);
    texture_main2_n = createAndBindTexture(glPixels, 1, FBO_main2, gl.NEAREST);
    glPixels = new Float32Array(noisePixels);
    texture_main_l = createAndBindTexture(glPixels, 1, FBO_main, gl.LINEAR);
    texture_main2_l = createAndBindTexture(glPixels, 1, FBO_main2, gl.LINEAR);

    FBO_fluid_p = gl.createFramebuffer();
    FBO_fluid_v = gl.createFramebuffer();
    FBO_fluid_store = gl.createFramebuffer();
    FBO_fluid_backbuffer = gl.createFramebuffer();
    texture_fluid_v = createAndBindSimulationTexture(new Float32Array(simpixels), FBO_fluid_v);
    texture_fluid_p = createAndBindSimulationTexture(new Float32Array(simpixels), FBO_fluid_p);
    texture_fluid_store = createAndBindSimulationTexture(new Float32Array(simpixels), FBO_fluid_store);
    texture_fluid_backbuffer = createAndBindSimulationTexture(new Float32Array(simpixels), FBO_fluid_backbuffer);

    FBO_particle_projection = gl.createFramebuffer();
    texture_particle_projection = createAndBindTexture(new Float32Array(pixels), 1, FBO_particle_projection, gl.LINEAR);

    FBO_helper = gl.createFramebuffer();
    FBO_helper2 = gl.createFramebuffer();
    FBO_helper3 = gl.createFramebuffer();
    FBO_helper4 = gl.createFramebuffer();
    FBO_helper5 = gl.createFramebuffer();
    FBO_helper6 = gl.createFramebuffer();
    texture_helper = createAndBindTexture(new Float32Array(pixels), 1, FBO_helper, gl.NEAREST); // helper buffers for the two-pass Gaussian blur calculation basically
    texture_helper2 = createAndBindTexture(new Float32Array(pixels2), 2, FBO_helper2, gl.NEAREST);
    texture_helper3 = createAndBindTexture(new Float32Array(pixels3), 4, FBO_helper3, gl.NEAREST);
    texture_helper4 = createAndBindTexture(new Float32Array(pixels4), 8, FBO_helper4, gl.NEAREST);
    texture_helper5 = createAndBindTexture(new Float32Array(pixels5), 16, FBO_helper5, gl.NEAREST);
    texture_helper6 = createAndBindTexture(new Float32Array(pixels6), 32, FBO_helper6, gl.NEAREST);

    FBO_blur = gl.createFramebuffer();
    FBO_blur2 = gl.createFramebuffer();
    FBO_blur3 = gl.createFramebuffer();
    FBO_blur4 = gl.createFramebuffer();
    FBO_blur5 = gl.createFramebuffer();
    FBO_blur6 = gl.createFramebuffer();
    texture_blur = createAndBindTexture(new Float32Array(pixels), 1, FBO_blur, gl.LINEAR);
    texture_blur2 = createAndBindTexture(new Float32Array(pixels2), 2, FBO_blur2, gl.LINEAR);
    texture_blur3 = createAndBindTexture(new Float32Array(pixels3), 4, FBO_blur3, gl.LINEAR);
    texture_blur4 = createAndBindTexture(new Float32Array(pixels4), 8, FBO_blur4, gl.LINEAR);
    texture_blur5 = createAndBindTexture(new Float32Array(pixels5), 16, FBO_blur5, gl.LINEAR);
    texture_blur6 = createAndBindTexture(new Float32Array(pixels6), 32, FBO_blur6, gl.LINEAR);

    FBO_sat = gl.createFramebuffer();
    texture_sat = createAndBindTexture(new Float32Array(pixels), 1, FBO_sat, gl.NEAREST);

    FBO_noise = gl.createFramebuffer();
    glPixels = new Float32Array(noisePixels);
    texture_noise_n = createAndBindTexture(glPixels, 1, FBO_noise, gl.NEAREST);
    texture_noise_l = createAndBindTexture(glPixels, 1, FBO_noise, gl.LINEAR);

    FBO_particles = gl.createFramebuffer();
    texture_particles = createAndBindParticleTexture(new Float32Array(particles), FBO_particles);

    FBO_particles2 = gl.createFramebuffer();
    texture_particles2 = createAndBindParticleTexture(new Float32Array(particles), FBO_particles2);

    // lesson learned: the (frame) buffer location that we pass to the vertex shader has to be bound to the program before linking!

    var aParticleLoc = 2; // no getAttributeLoc
    prog_render_particles = createAndLinkParticleRenderer(aParticleLoc);

    gl.useProgram(prog_render_particles);
    gl.uniform1i(gl.getUniformLocation(prog_render_particles, "sampler_particles"), 0);

    gl.enableVertexAttribArray(aParticleLoc);
    particleBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(particlesIdx), gl.STATIC_DRAW);
    gl.vertexAttribPointer(aParticleLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texture_blur);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, texture_blur2);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, texture_blur3);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, texture_blur4);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, texture_blur5);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, texture_blur6);
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, texture_noise_l);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, texture_noise_n);
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, texture_fluid_v);
    gl.activeTexture(gl.TEXTURE11);
    gl.bindTexture(gl.TEXTURE_2D, texture_fluid_p);
    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, texture_particles); // to be swapped anyways
    gl.activeTexture(gl.TEXTURE13);
    gl.bindTexture(gl.TEXTURE_2D, texture_particle_projection);
    gl.activeTexture(gl.TEXTURE14);
    gl.bindTexture(gl.TEXTURE_2D, texture_sat);

    calculateBlurTexture();

    fluidInit(FBO_fluid_v);
    fluidInit(FBO_fluid_p);
    fluidInit(FBO_fluid_store);
    fluidInit(FBO_fluid_backbuffer);

    fpsDisplayUpdateTimer = setInterval(fr, 1000);
    time = new Date().getTime() - starttime;

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.clearColor(0, 0, 0, 1);

    anim();
}

function createTexturedGeometryBuffer(geometry) {
    geometry.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
    geometry.aPosLoc = gl.getAttribLocation(prog_advance, "aPos"); // we could take any program here, they all use the same vertex shader
    gl.enableVertexAttribArray(geometry.aPosLoc);
    geometry.aTexLoc = gl.getAttribLocation(prog_advance, "aTexCoord");
    gl.enableVertexAttribArray(geometry.aTexLoc);
    geometry.texCoordOffset = geometry.vertices.byteLength;
    gl.bufferData(gl.ARRAY_BUFFER, geometry.texCoordOffset + geometry.texCoords.byteLength, gl.STATIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, geometry.vertices);
    gl.bufferSubData(gl.ARRAY_BUFFER, geometry.texCoordOffset, geometry.texCoords);
    setGeometryVertexAttribPointers(geometry);
}

function setGeometryVertexAttribPointers(geometry) {
    gl.vertexAttribPointer(geometry.aPosLoc, geometry.vertexSize, gl.FLOAT, gl.FALSE, 0, 0);
    gl.vertexAttribPointer(geometry.aTexLoc, 2, gl.FLOAT, gl.FALSE, 0, geometry.texCoordOffset);
}

function createAndLinkProgram(fsId) {
    var program = gl.createProgram();
    gl.attachShader(program, getShader(gl, "shader-vs"));
    gl.attachShader(program, getShader(gl, fsId));
    gl.linkProgram(program);
    return program;
}

function createAndLinkParticleRenderer(aParticleLoc) {
    var program = gl.createProgram();
    gl.attachShader(program, getShader(gl, "shader-particle-renderer-vs"));
    gl.attachShader(program, getShader(gl, "shader-particle-renderer-fs"));
    gl.bindAttribLocation(program, aParticleLoc, "uv"); // can't use getAttribLocation later so we must bind before linking
    gl.linkProgram(program);
    return program;
}

function createAndBindTexture(glPixels, scale, fbo, filter) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sizeX / scale, sizeY / scale, 0, gl.RGBA, gl.FLOAT, glPixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return texture;
}

function createAndBindParticleTexture(glPixels, fbo) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, particlesWidth, particlesHeight, 0, gl.RGB, gl.FLOAT, glPixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return texture;
}

function createAndBindSimulationTexture(glPixels, fbo) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sizeX / simScale, sizeY / simScale, 0, gl.RGBA, gl.FLOAT, glPixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return texture;
}

function fluidInit(fbo) {
    gl.viewport(0, 0, sizeX / simScale, sizeY / simScale);
    gl.useProgram(prog_fluid_init);
    renderAsTriangleStrip(fbo);
}

function setUniforms(program) {
    gl.uniform4f(gl.getUniformLocation(program, "rnd"), Math.random(), Math.random(), Math.random(), Math.random());
    gl.uniform4f(gl.getUniformLocation(program, "rainbow"), rainbowR, rainbowG, rainbowB, 1);
    gl.uniform2f(gl.getUniformLocation(program, "texSize"), sizeX, sizeY);
    gl.uniform2f(gl.getUniformLocation(program, "pixelSize"), 1. / sizeX, 1. / sizeY);
    gl.uniform2f(gl.getUniformLocation(program, "aspect"), Math.max(1, viewX / viewY), Math.max(1, viewY / viewX));
    gl.uniform2f(gl.getUniformLocation(program, "mouse"), mouseX, mouseY);
    gl.uniform2f(gl.getUniformLocation(program, "mouseV"), mouseDx, mouseDy);
    gl.uniform1f(gl.getUniformLocation(program, "fps"), fps);
    gl.uniform1f(gl.getUniformLocation(program, "time"), time);
    gl.uniform1f(gl.getUniformLocation(program, "frame"), framecount);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_prev"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_prev_n"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_blur"), 2);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_blur2"), 3);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_blur3"), 4);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_blur4"), 5);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_blur5"), 6);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_blur6"), 7);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_noise"), 8);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_noise_n"), 9);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_fluid"), 10);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_fluid_p"), 11);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_particles"), 12);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_particle_projection"), 13);
    gl.uniform1i(gl.getUniformLocation(program, "sampler_sat"), 14);

    // special shader inputs for the fractal tree
    gl.uniform1f(gl.getUniformLocation(program, "x1"), x1);
    gl.uniform1f(gl.getUniformLocation(program, "y1"), y1);
    gl.uniform1f(gl.getUniformLocation(program, "d1"), thickness);
    gl.uniform1f(gl.getUniformLocation(program, "x2"), x2);
    gl.uniform1f(gl.getUniformLocation(program, "y2"), y2);
    gl.uniform1f(gl.getUniformLocation(program, "d2"), thickness * scale1);
    gl.uniform1f(gl.getUniformLocation(program, "sin1"), Math.sin(w1));
    gl.uniform1f(gl.getUniformLocation(program, "cos1"), Math.cos(w1));
    gl.uniform1f(gl.getUniformLocation(program, "sin2"), Math.sin(w1 - w2));
    gl.uniform1f(gl.getUniformLocation(program, "cos2"), Math.cos(w1 - w2));
    gl.uniform1f(gl.getUniformLocation(program, "sin3"), Math.sin(w1 + w2));
    gl.uniform1f(gl.getUniformLocation(program, "cos3"), Math.cos(w1 + w2));
    gl.uniform1f(gl.getUniformLocation(program, "scale1"), scale1);
    gl.uniform1f(gl.getUniformLocation(program, "scale2"), scale2);
}

function useGeometry(geometry) {
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
    setGeometryVertexAttribPointers(geometry);
}

function renderGeometry(geometry, targetFBO) {
    useGeometry(geometry);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
    gl.drawArrays(geometry.type, 0, geometry.vertexCount);
    if (alwaysUseFlush)
        gl.flush();
}

function renderAsTriangleStrip(targetFBO) {
    renderGeometry(triangleStripGeometry, targetFBO);
}

function renderParticles(targetFBO) {
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);

    if (targetFBO == null)
        gl.viewport(0, 0, viewX, viewY);
    else
        gl.viewport(0, 0, sizeX, sizeY);

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
    gl.useProgram(prog_render_particles);

    gl.activeTexture(gl.TEXTURE12);
    if (mainBufferToggle < 0) {
        gl.bindTexture(gl.TEXTURE_2D, texture_particles2);
    } else {
        gl.bindTexture(gl.TEXTURE_2D, texture_particles);
    }

    gl.uniform1i(gl.getUniformLocation(prog_render_particles, "sampler_particles"), 12); // input for the vertex shader
    gl.uniform2f(gl.getUniformLocation(prog_render_particles, "mouse"), mouseX, mouseY);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.drawArrays(gl.POINTS, 0, particleCount);
    gl.disable(gl.BLEND);

    if (alwaysUseFlush)
        gl.flush();
}

function renderAsHLines(targetFBO) {
    useGeometry(hLineGeometry);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
    for (var y = 1; y < sizeY; y++) {
        gl.drawArrays(gl.LINES, y * 2, 2);
        if (alwaysUseFlush)
            gl.flush();
    }
}

function renderAsVLines(targetFBO) {
    useGeometry(vLineGeometry);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
    for (var x = 1; x < sizeX; x++) {
        gl.drawArrays(gl.LINES, x * 2, 2);
        if (alwaysUseFlush)
            gl.flush();
    }
}

function calculateSummedAreaTable(sourceTex) {
    gl.viewport(0, 0, particlesWidth, particlesHeight);

    gl.useProgram(prog_copy);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    renderAsTriangleStrip(FBO_sat);

    gl.useProgram(prog_sat);
    gl.bindTexture(gl.TEXTURE_2D, texture_sat);
    gl.uniform1i(gl.getUniformLocation(prog_sat, "sampler_sat"), 0);
    gl.uniform2f(gl.getUniformLocation(prog_sat, "offset"), 0, -1 / sizeY);
    renderAsHLines(FBO_sat);

    gl.uniform2f(gl.getUniformLocation(prog_sat, "offset"), -1 / sizeX, 0);
    renderAsVLines(FBO_sat);
}

function calculateBlurTextures(texture_source) {
    calculateBlurTexture(texture_source, texture_blur, FBO_blur, texture_helper, FBO_helper, 1);
    calculateBlurTexture(texture_blur, texture_blur2, FBO_blur2, texture_helper2, FBO_helper2, 2);
    calculateBlurTexture(texture_blur2, texture_blur3, FBO_blur3, texture_helper3, FBO_helper3, 4);
    calculateBlurTexture(texture_blur3, texture_blur4, FBO_blur4, texture_helper4, FBO_helper4, 8);
    calculateBlurTexture(texture_blur4, texture_blur5, FBO_blur5, texture_helper5, FBO_helper5, 16);
    calculateBlurTexture(texture_blur5, texture_blur6, FBO_blur6, texture_helper6, FBO_helper6, 32);
}

function calculateBlurTexture(sourceTex, targetTex, targetFBO, helperTex, helperFBO, scale) {
    // copy source
    gl.viewport(0, 0, sizeX / scale, sizeY / scale);
    gl.useProgram(prog_copy);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    renderAsTriangleStrip(targetFBO);

    // blur vertically
    gl.viewport(0, 0, sizeX / scale, sizeY / scale);
    gl.useProgram(prog_blur_vertical);
    gl.uniform2f(gl.getUniformLocation(prog_blur_vertical, "pixelSize"), scale / sizeX, scale / sizeY);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targetTex);
    renderAsTriangleStrip(helperFBO);

    // blur horizontally
    gl.viewport(0, 0, sizeX / scale, sizeY / scale);
    gl.useProgram(prog_blur_horizontal);
    gl.uniform2f(gl.getUniformLocation(prog_blur_horizontal, "pixelSize"), scale / sizeX, scale / sizeY);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, helperTex);
    renderAsTriangleStrip(targetFBO);

}

function stepParticles() {
    gl.viewport(0, 0, particlesWidth, particlesHeight);
    gl.useProgram(prog_move_particles);
    gl.uniform4f(gl.getUniformLocation(prog_move_particles, "rnd"), Math.random(), Math.random(), Math.random(), Math.random());
    gl.uniform1f(gl.getUniformLocation(prog_move_particles, "frame"), framecount);
    gl.uniform2f(gl.getUniformLocation(prog_move_particles, "pixelSize"), 1. / sizeX, 1. / sizeY);
    gl.uniform2f(gl.getUniformLocation(prog_move_particles, "scale"), 2. / simScale / particlesWidth, 2. / simScale / particlesHeight);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_prev"), 0);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_prev_n"), 1);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_blur"), 2);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_blur2"), 3);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_blur3"), 4);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_blur4"), 5);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_blur5"), 6);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_blur6"), 7);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_noise"), 8);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_noise_n"), 9);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_fluid"), 10);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_fluid_p"), 11);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_particles"), 12);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_particle_projection"), 13);
    gl.uniform1i(gl.getUniformLocation(prog_move_particles, "sampler_sat"), 14);
    if (mainBufferToggle > 0) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture_fluid_v);
        gl.activeTexture(gl.TEXTURE12);
        gl.bindTexture(gl.TEXTURE_2D, texture_particles);
        renderAsTriangleStrip(FBO_particles2)
    } else {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture_fluid_v);
        gl.activeTexture(gl.TEXTURE12);
        gl.bindTexture(gl.TEXTURE_2D, texture_particles2);
        renderAsTriangleStrip(FBO_particles);
    }
}

function fluidSimulationStep() {
    addMouseMotion();
    advect();
    diffuse();
}

function addMouseMotion() {
    gl.viewport(0, 0, (sizeX / simScale), (sizeY / simScale));
    gl.useProgram(prog_fluid_add_mouse_motion);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture_fluid_v);
    gl.uniform2f(gl.getUniformLocation(prog_fluid_add_mouse_motion, "aspect"), Math.max(1, viewX / viewY), Math.max(1, viewY / viewX));
    gl.uniform2f(gl.getUniformLocation(prog_fluid_add_mouse_motion, "mouse"), mouseX, mouseY);
    gl.uniform2f(gl.getUniformLocation(prog_fluid_add_mouse_motion, "mouseV"), mouseDx, mouseDy);
    gl.uniform2f(gl.getUniformLocation(prog_fluid_add_mouse_motion, "pixelSize"), 1. / (sizeX / simScale), 1. / (sizeY / simScale));
    gl.uniform2f(gl.getUniformLocation(prog_fluid_add_mouse_motion, "texSize"), (sizeX / simScale), (sizeY / simScale));
    renderAsTriangleStrip(FBO_fluid_backbuffer);
}

function advect() {
    gl.viewport(0, 0, (sizeX / simScale), (sizeY / simScale));
    gl.useProgram(prog_fluid_advect);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture_fluid_backbuffer);
    gl.uniform2f(gl.getUniformLocation(prog_fluid_advect, "pixelSize"), 1. / (sizeX / simScale), 1. / (sizeY / simScale));
    gl.uniform2f(gl.getUniformLocation(prog_fluid_advect, "texSize"), (sizeX / simScale), (sizeY / simScale));
    renderAsTriangleStrip(FBO_fluid_v);
}

function diffuse() {
    for (var i = 0; i < 8; i++) {
        gl.viewport(0, 0, (sizeX / simScale), (sizeY / simScale));
        gl.useProgram(prog_fluid_p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture_fluid_v);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture_fluid_p);
        gl.uniform2f(gl.getUniformLocation(prog_fluid_p, "texSize"), (sizeX / simScale), (sizeY / simScale));
        gl.uniform2f(gl.getUniformLocation(prog_fluid_p, "pixelSize"), 1. / (sizeX / simScale), 1. / (sizeY / simScale));
        gl.uniform1i(gl.getUniformLocation(prog_fluid_p, "sampler_v"), 0);
        gl.uniform1i(gl.getUniformLocation(prog_fluid_p, "sampler_p"), 1);
        renderAsTriangleStrip(FBO_fluid_backbuffer);

        gl.viewport(0, 0, (sizeX / simScale), (sizeY / simScale));
        gl.useProgram(prog_fluid_p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture_fluid_v);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture_fluid_backbuffer);
        gl.uniform2f(gl.getUniformLocation(prog_fluid_p, "texSize"), (sizeX / simScale), (sizeY / simScale));
        gl.uniform2f(gl.getUniformLocation(prog_fluid_p, "pixelSize"), 1. / (sizeX / simScale), 1. / (sizeY / simScale));
        gl.uniform1i(gl.getUniformLocation(prog_fluid_p, "sampler_v"), 0);
        gl.uniform1i(gl.getUniformLocation(prog_fluid_p, "sampler_p"), 1);
        renderAsTriangleStrip(FBO_fluid_p);
    }

    gl.viewport(0, 0, (sizeX / simScale), (sizeY / simScale));
    gl.useProgram(prog_fluid_div);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture_fluid_v);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture_fluid_p);
    gl.uniform2f(gl.getUniformLocation(prog_fluid_div, "texSize"), (sizeX / simScale), (sizeY / simScale));
    gl.uniform2f(gl.getUniformLocation(prog_fluid_div, "pixelSize"), 1. / (sizeX / simScale), 1. / (sizeY / simScale));
    gl.uniform1i(gl.getUniformLocation(prog_fluid_div, "sampler_v"), 0);
    gl.uniform1i(gl.getUniformLocation(prog_fluid_div, "sampler_p"), 1);
    renderAsTriangleStrip(FBO_fluid_v);
}

// main texture feedback warp
function advance() {
    gl.viewport(0, 0, sizeX, sizeY);
    gl.useProgram(prog_advance);
    setUniforms(prog_advance);
    if (mainBufferToggle > 0) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture_main_l); // interpolated input
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture_main_n); // "nearest" input
        renderAsTriangleStrip(FBO_main2);
    } else {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture_main2_l); // interpolated
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture_main2_n); // "nearest"
        renderAsTriangleStrip(FBO_main);
    }
    mainBufferToggle = -mainBufferToggle;
}

function composite() {
    gl.viewport(0, 0, viewX, viewY);
    gl.useProgram(prog_composite);
    setUniforms(prog_composite);
    if (mainBufferToggle < 0) {
        gl.activeTexture(gl.TEXTURE12);
        gl.bindTexture(gl.TEXTURE_2D, texture_particles);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture_main_l);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture_main_n);
    } else {
        gl.activeTexture(gl.TEXTURE12);
        gl.bindTexture(gl.TEXTURE_2D, texture_particles2);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture_main2_l);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture_main2_n);
    }
    renderAsTriangleStrip(null);
}

var rainbowR, rainbowG, rainbowB, w = Math.PI * 2 / 3;

var x1 = 0.5;
var y1 = 0.03;

var x2 = 0.5;
var y2 = 0.15;

var thickness = 1. / 0.01; // inverse actually, keeping the shader calculation low

var w1 = 0.2;
var w2 = 0.9;

var scale1 = 1.23;
var scale2 = 2.5;

function anim() {
    setTimeout("requestAnimationFrame(anim)", 1000 / desiredFramerate);

    time = new Date().getTime() - starttime;

    var t = time / 150;

    rainbowR = 0.5 + 0.5 * Math.sin(t);
    rainbowG = 0.5 + 0.5 * Math.sin(t + w);
    rainbowB = 0.5 + 0.5 * Math.sin(t - w);

    x1 = 0.5;
    thickness = (2 - mouseY * 1.) / 0.025;
    y1 = 0.035;

    x2 = 0.5 + (mouseX - 0.5) * 0.25;
    y2 = 0.07 + mouseY * 0.14;
    w1 = (0.5 - mouseX) * 0.15;

    if (oldMouseX != 0 && oldMouseY != 0) {
        mouseDx = (mouseX - oldMouseX) * viewX;
        mouseDy = (mouseY - oldMouseY) * viewY;
    }

    if (!halted) {

        if (useProjectionFeedback)
            renderParticles(FBO_particle_projection);

        if (useFluidSimulation)
            fluidSimulationStep();

        if (useParticles)
            stepParticles();

        advance();

        var srcTex = (mainBufferToggle < 0) ? texture_main2_l : texture_main_l;

        calculateBlurTextures(srcTex);

        if (useSummedAreaTable)
            calculateSummedAreaTable(srcTex);

        frame++;
        framecount++;
    }

    if (renderParticlesOnly)
        renderParticles(null);
    else
        composite();

    frames++;

    oldMouseX = mouseX;
    oldMouseY = mouseY;

}

function fr() { // updates every second
    //document.getElementById("fps").textContent = frame;
    //frame = 0; // reset the frame counter
}

var hidden = false;
function hide() {
    hidden = !hidden;
    document.getElementById("desc").style.setProperty('visibility', hidden ? 'hidden' : 'visible');
}

function goFull(cb) {
    if (cb.checked) {
        viewX = window.innerWidth;
        viewY = window.innerHeight;
    } else {
        viewX = sizeX;
        viewY = sizeY;
    }
    c.width = viewX;
    c.height = viewY;
}

function setDesiredFps(tb) {
    desiredFramerate = tb.value;
    if (desiredFramerate < 1)
        desiredFPS = 1;
}

function switchRenderer(particlesOnly) {
    renderParticlesOnly = particlesOnly;
}