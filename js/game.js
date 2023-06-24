/**************************************************
 * Globals
 **************************************************/
var canvas;
var ctx;
var interval;
var slider;
var frame = 0;
var score = 0;
var bestScore = 0;
var birds = [];
var savedBirds = [];
var obstacles = [];
var gameOver = false;
var pauseEnabled = true;
var paused = false;
var allBirdsDead = false;
var allBirdsOnFloor = false;
var generation = 0;
var debug = false;
var playing = false; // is the user playing?

// Parameters
var hitboxCorrection = -4;
var floorHeight = 60;
var obstacleSpawn = 550; // Location where obstacles are created
var obstacleSpacing = 370; // horizontal spacing between obstacle pairs
var maxGap = 0; // max distance between an obstacle pair
var minGapFactor = 4; // gap must be a minimum of minGapFactor * bird.height
var gravity = 9.81;
var decay = 0.75;
var obstacleSpeed = 0.5;
var thinkDelay = 5;

var frameRate;
var flapAcceleration;
var flapAngle;
var speeds = [
    {
        frameRate: 1/120,
        flapAcceleration: -24,
        flapAngle: -21
    },
    {
        frameRate: 1/180,
        flapAcceleration: -29,
        flapAngle: -35
    }
];
var birdSize = { width: 51, height: 36 };
var scoreboard = { x: -150, y: -300, width: 150, height: 180 };
var levels = [
    { img: "floor.png", frameRate: 120, background: "#87cefa" },
    { img: "lava.png", frameRate: 20, background: "#ffe6b3" },
    { img: "lava.png", frameRate: 20, background: "#ffe6b3" }
];
var restart = {
    x: scoreboard.x,
    y: scoreboard.y + (2 * scoreboard.height) + 60,
    width: scoreboard.width,
    height: 40
};

var SPACEBAR_KEY_CODE = 32;
var P_KEY_CODE = 80;
var Q_KEY_CODE = 81;
var POPULATION_SIZE = 250;

window.onload = function() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    document.body.appendChild(canvas);
    tf.setBackend('cpu');
    slider = createSlider(1, 25, 1);

    document.body.onkeyup = function(e) {
        // switch to genetic algorithm
        if (e.keyCode == Q_KEY_CODE) {
            if (! playing) {            
                playing = true;
                generation = 0;
                reset();
            }
        }

        // pause
        if (pauseEnabled && e.keyCode == P_KEY_CODE) {
            if (paused) {
                interval = setInterval(game, frameRate * 1000);
                paused = false;
            } else {
                clearInterval(interval);
                paused = true;
            }
        }
    }

    setup();
    interval = setInterval(game, frameRate * 1000);
};

function setup() {
    // set speed
    var speed = speeds[1];
    frameRate = speed.frameRate;
    flapAcceleration = speed.flapAcceleration;
    flapAngle = speed.flapAngle;

    // create bird population
    var pop_size = playing ? 1 : POPULATION_SIZE;
    for (let i = 0; i < pop_size; i++) {
        birds[i] = new Bird();
    }

    if (playing) {
        document.body.onkeydown = function(e) {
            // flap on spacebar
            if (e.keyCode == SPACEBAR_KEY_CODE) {
                for (var i = 0; i < birds.length; i++) {
                    var bird = birds[i];
                    bird.flap();
                }
            }
        }
    }
}

function game() {
    for (let n = 0; n < slider.value(); n++) {
        clearScreen();

        allBirdsDead = true;
        for (var i = 0; i < birds.length; i++) {
            var bird = birds[i];
            if (! bird.dead) allBirdsDead = false;
        }

        // create new obstacles after a certain amount of frames
        if (frame % obstacleSpacing == 0) {
            createObstaclePair(obstacleSpawn);
        }

        // remove obstacle pair if it's off screen
        // TODO: Make sure obstacles are being removed correctly
        if (obstacles[0].currX < -obstacles[0].width && obstacles[1].currX < -obstacles[1].width) {
            obstacles = obstacles.slice(2);
        }

        // detect collision and remove dead birds
        for (var i = 0; i < obstacles.length; i++) {
            for (var j = birds.length - 1; j >= 0; j--) {
                var bird = birds[j];
                if (bird.dead  || collisionWith(bird, obstacles[i])) {
                    bird.die();
                    if (! playing) {
                        savedBirds.push(birds.splice(j, 1)[0]);
                    }
                }
            }
        }

        // update
        for (var i = 0; i < birds.length; i++) {
            var bird = birds[i];
            updateScore(bird);
            bird.level = getLevel();
        }
        for (var i = 0; i < obstacles.length; i++) {
            if (! allBirdsDead) obstacles[i].update();
        }
        for (var i = 0; i < birds.length; i++) {
            var bird = birds[i];
            bird.update();
            if (! playing && frame % thinkDelay == 0) {
                bird.think();
            }
        }

        // Better luck next time...
        if (allBirdsDead) initiateGameOver();
        if (gameOver && ! playing) {
            reset();
            return;
        }

        frame++;
    }

    // show
    for (var i = 0; i < obstacles.length; i++) {
        obstacles[i].show();
    }
    addFloor(getLevel());
    var x = (canvas.width - 130) / 2;
    var y = canvas.height - 10;
    drawText("Made By Pratyush Kargeti", "white", 10, y, 13, 4)
    var scoreCenter = (canvas.width / 2) - (20 * score.toString().length);
    drawText(score, "white", scoreCenter, 90, 70, 8);
    drawText("Press P to pause", "white", canvas.width - 135, 25, 17, 5);
    // Genetic Algorithm stats
    if (! playing) {
        drawText("generation: " + generation, "white", 10, 25, 17, 5);
        drawText("Alive: " + birds.length + "/" + POPULATION_SIZE, "white", 10, 52, 17, 5);
        drawText("Best: " + bestScore, "white", 10, 77, 17, 5);
        drawText("Speed: x" + slider.value(), "white", 10, 100, 17, 5);
        drawText("Press Q to play", "white", canvas.width - 135, 52, 17, 5);
    } else {
        drawText("Press spacebar to fly", "white", x, y, 17, 5)
    }
    for (var i = 0; i < birds.length; i++) {
        birds[i].show();
    }
    if (gameOver && playing) {
        showRestartMenu();
    }
}

/**************************************************
 * Helper Functions
 **************************************************/
function clearScreen() {
    setLevel(getLevel());
}

function getLevel() {
    return Math.floor(score / 20);
}

function setLevel(level) {
    switch (level) {
        case 0:
            setLevelOne();
            break
        case 1:
            setLevelTwo();
            break;
        case 2:
            setLevelThree();
            break;
        default:
            setLevelThree();
    }
}

function setLevelOne() {
    ctx.fillStyle = levels[0].background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function setLevelTwo() {
    ctx.fillStyle = levels[1].background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function setLevelThree() {
    setLevelTwo();

    for (var i = 0; i < obstacles.length; i++) {
        obstacles[i].oscillate = true;
    }
}

function addFloor(i) {
    i = Math.min(i, 2);
    this.floor = new Image();
    this.floor.src = "img/levels/" + levels[i].img;
    var state = allBirdsDead ? 0 : frame % levels[i].frameRate
    ctx.drawImage(this.floor, -state, canvas.height - floor.height);
}

function initiateGameOver() {
    allBirdsOnFloor = true;
    for (var i = 0; i < birds.length; i++) {
        var bird = birds[i];
        if (! bird.onFloor) allBirdsOnFloor = false;
    }
    if (allBirdsDead && allBirdsOnFloor) {
        clearInterval(interval);
        bestScore = Math.max(bestScore, score);
        gameOver = true;
    }
}

function showRestartMenu() {
    // show scoreboard
    var x = (canvas.width + scoreboard.x) / 2;
    var y = (canvas.height + scoreboard.y) / 2;
    drawBorder(x, y, scoreboard.width, scoreboard.height, 3);
    ctx.fillStyle = '#dfc269';
    ctx.fillRect(x, y, scoreboard.width, scoreboard.height);

    // add scores to scoreboard
    var xOffset = x + (scoreboard.width / 2);
    drawText("Score", "#df8b03", xOffset - 30, y + 35, 25, 5);
    drawText("Best", "#df8b03", xOffset - 23, y + 125, 25, 5);
    drawText(score, "white", xOffset - (6 * score.toString().length), y + 70, 25, 5);
    drawText(bestScore, "white", xOffset - (6 * bestScore.toString().length), y + 160, 25, 5);

    // show restart button
    var x = (canvas.width + restart.x) / 2;
    var y = (canvas.height + restart.y) / 2;
    drawBorder(x, y, restart.width, restart.height, 3);
    ctx.fillStyle = '#dfc269';
    ctx.fillRect(x, y, restart.width, restart.height);
    drawText("Restart", "#d5bb6b", x + 37, y + 29, 25, 5);

    canvas.addEventListener('click', restartGame);
    document.body.onkeydown = function(e) {
        if (e.keyCode == SPACEBAR_KEY_CODE) {
            reset();
        }
    }
}

function restartGame(e) {
    var x = (canvas.width + restart.x) / 2;
    var y = (canvas.height + restart.y) / 2;
    var rect = { x: x, y: y, width: restart.width, height: restart.height };

    var mousePos = getMousePos(e);
    if (isInside(mousePos, rect)) {
        reset();
    }
}

function reset() {
    clearInterval(interval);
    canvas.removeEventListener('click', restartGame);
    document.body.onkeydown = null;

    frame = 0;
    score = 0;
    gameOver = false;
    allBirdsDead = false;
    allBirdsOnFloor = false;
    obstacles = [];
    birds = [];

    if (playing) {
        setup();
    } else {
        generation++;
        nextGeneration();
    }
    interval = setInterval(game, frameRate * 1000);
}

function updateScore(bird) {
    for (var i = 0; i < obstacles.length; i++) {
        var obstacle = obstacles[i];
        if (! obstacle.completed && completed(bird, obstacle)) {
            obstacle.completed = true;
            score += 0.5; // avoid double counting since obstacles come in pairs
        }
    }
}

function completed(bird, obstacle) {
    return bird.x > obstacle.currX + obstacle.width;
}

function createObstaclePair(x) {
    var maxTopObstacleHeight = canvas.height - (minGapFactor * birdSize.height + floorHeight);
    var topObstacleHeight = Math.round(Math.random() * maxTopObstacleHeight);

    var obstacleGap = (minGapFactor * birdSize.height) + Math.round(Math.random() * maxGap);
    obstacleGap = Math.min(obstacleGap, canvas.height - (topObstacleHeight + floorHeight))
    var bottomObstacleHeight = canvas.height - (topObstacleHeight + obstacleGap + floorHeight);

    var meta = {
        canvas: canvas,
        floorHeight: floorHeight,
        gap: obstacleGap,
        bottomObstacleHeight: bottomObstacleHeight,
        topObstacleHeight: topObstacleHeight
    };
    var topObstacle = new Obstacle(x, 0, topObstacleHeight, meta, true);
    var bottomObstacle = new Obstacle(x, topObstacleHeight + obstacleGap, bottomObstacleHeight, meta, false);

    obstacles.push(topObstacle);
    obstacles.push(bottomObstacle);
}

function collisionWith(bird, obstacle) {
    var bLeft = bird.x;
    var bRight = bird.x + bird.width + hitboxCorrection;
    var bTop = bird.y;
    var bBottom = bird.y + bird.height;

    var obLeft = obstacle.currX;
    var obRight = obstacle.currX + obstacle.width;
    var obTop = obstacle.isTopObstacle ? obstacle.y : obstacle.currY;
    var obBottom = obstacle.isTopObstacle ? obstacle.currY + obstacle.height : obstacle.currY + obstacle.image.height;

    if (debug) {
        ctx.fillStyle = 'red';
        ctx.fillRect(bLeft, bTop, bRight - bLeft, bBottom - bTop);

        ctx.fillStyle = 'red';
        ctx.fillRect(obLeft, obTop, obRight - obLeft, obBottom - obTop);
        return false;
    }

    var collision = true;
    if (bBottom <= obTop || bTop >= obBottom || bRight <= obLeft || bLeft >= obRight) {
        collision = false;
    }
    return collision;
}

function getMousePos(event) {
    var rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function isInside(pos, rect){
    return pos.x > rect.x 
        && pos.x < rect.x + rect.width 
        && pos.y < rect.y + rect.height 
        && pos.y > rect.y;
}

function drawText(text, color, x, y, fontSize, lineWidth) {
    ctx.font = fontSize + 'px Sans-serif';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = lineWidth;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}

function drawBorder(xPos, yPos, width, height, thickness = 1) {
  ctx.fillStyle = '#000';
  ctx.fillRect(xPos - (thickness), yPos - (thickness), width + (thickness * 2), height + (thickness * 2));
}

function degreesToRadians(degree) {
    return degree * Math.PI / 180;
}

function radiansToDegrees(radian) {
    return radian * 180 / Math.PI;
}
