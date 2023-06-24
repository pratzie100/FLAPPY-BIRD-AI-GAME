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
    frameRate: 1 / 120,
    flapAcceleration: -24,
    flapAngle: -21
  },
  {
    frameRate: 1 / 180,
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
  y: scoreboard.y + 2 * scoreboard.height + 60,
  width: scoreboard.width,
  height: 40
};

var SPACEBAR_KEY_CODE = 32;
var P_KEY_CODE = 80;
var Q_KEY_CODE = 81;
var POPULATION_SIZE = 250;

window.onload = function () {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  document.body.appendChild(canvas);
  tf.setBackend("cpu");
  slider = createSlider(1, 25, 1);

  document.body.onkeyup = function (e) {
    // switch to genetic algorithm
    if (e.keyCode == Q_KEY_CODE) {
      if (!playing) {
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
  };

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
    var bird = new Bird();
    birds[i] = bird;
  }

  // create initial obstacles
  for (let i = 0; i < 2; i++) {
    obstacles[i] = new Obstacle(obstacleSpawn + i * obstacleSpacing);
  }
}

function game() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // update and show obstacles
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].update();
    obstacles[i].show();

    // remove obstacles that are out of view
    if (obstacles[i].offscreen()) {
      obstacles.splice(i, 1);
    }
  }

  // update and show birds
  for (let i = 0; i < birds.length; i++) {
    if (!paused) {
      birds[i].think(obstacles);
      birds[i].update();
    }
    birds[i].show();

    // check collision with obstacles
    for (let j = 0; j < obstacles.length; j++) {
      if (obstacles[j].hits(birds[i])) {
        birds[i].collide();
        if (playing && birds[i].score > bestScore) {
          bestScore = birds[i].score;
        }
        if (birds[i].dead) {
          savedBirds.push(birds.splice(i, 1)[0]);
        }
        break;
      }
    }

    // check collision with floor
    if (birds[i].hitsFloor()) {
      birds[i].collide();
      if (playing && birds[i].score > bestScore) {
        bestScore = birds[i].score;
      }
      if (birds[i].dead) {
        savedBirds.push(birds.splice(i, 1)[0]);
      }
    }
  }

  // show scoreboard
  ctx.save();
  ctx.font = "20px Arial";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.fillText("Generation: " + generation, canvas.width / 2, -280);
  ctx.fillText("Score: " + score, canvas.width / 2, -240);
  ctx.fillText("Best Score: " + bestScore, canvas.width / 2, -200);
  ctx.restore();

  // update frame count
  frame++;

  // spawn new obstacles
  if (frame % obstacleSpacing === 0) {
    obstacles.push(new Obstacle(obstacleSpawn));
  }

  // increase score
  if (!paused && frame % 10 === 0) {
    score++;
  }

  // evolve to next generation
  if (birds.length === 0) {
    if (!allBirdsDead) {
      allBirdsDead = true;
    } else if (allBirdsOnFloor) {
      nextGeneration();
    }
  }
}

function Bird() {
  this.y = canvas.height / 2;
  this.x = 64;
  this.gravity = gravity;
  this.lift = flapAcceleration;
  this.velocity = 0;
  this.dead = false;
  this.score = 0;
  this.fitness = 0;
  this.brain = new NeuralNetwork(5, 8, 2);
  this.image = new Image();
  this.image.src = "bird.png";

  this.show = function () {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.velocity / 20);
    ctx.drawImage(
      this.image,
      -birdSize.width / 2,
      -birdSize.height / 2,
      birdSize.width,
      birdSize.height
    );
    ctx.restore();
  };

  this.think = function (obstacles) {
    if (frame % thinkDelay === 0) {
      let closest = null;
      let record = Infinity;
      for (let i = 0; i < obstacles.length; i++) {
        let diff = obstacles[i].x - this.x;
        if (diff > 0 && diff < record) {
          record = diff;
          closest = obstacles[i];
        }
      }
      let inputs = [];
      inputs[0] = this.y / canvas.height;
      inputs[1] = closest.top / canvas.height;
      inputs[2] = closest.bottom / canvas.height;
      inputs[3] = closest.x / canvas.width;
      inputs[4] = this.velocity / 10;
      let outputs = this.brain.predict(inputs);
      if (outputs[1] > outputs[0]) {
        this.up();
      }
    }
  };

  this.up = function () {
    this.velocity += this.lift;
  };

  this.update = function () {
    this.velocity += this.gravity;
    this.velocity *= decay;
    this.y += this.velocity;

    if (this.y >= canvas.height - floorHeight - birdSize.height / 2) {
      this.y = canvas.height - floorHeight - birdSize.height / 2;
      this.dead = true;
      if (!allBirdsOnFloor) {
        allBirdsOnFloor = true;
      }
    }
    if (this.y <= birdSize.height / 2) {
      this.y = birdSize.height / 2;
      this.dead = true;
    }

    if (!this.dead) {
      this.score++;
    }
  };

  this.collide = function () {
    this.dead = true;
    if (!allBirdsOnFloor) {
      allBirdsOnFloor = true;
    }
  };

  this.hitsFloor = function () {
    return this.y >= canvas.height - floorHeight - birdSize.height / 2;
  };
}

function Obstacle(x) {
  this.x = x;
  this.top = 0;
  this.bottom = 0;
  this.width = 50;
  this.highlight = false;

  var minGap = birdSize.height * minGapFactor;
  var maxGap = canvas.height - floorHeight - minGap - obstacleSpacing;

  this.randomize = function () {
    var gap = Math.floor(Math.random() * (maxGap - minGap + 1)) + minGap;
    this.top = gap;
    this.bottom = canvas.height - floorHeight - gap - obstacleSpacing;
  };

  this.randomize();

  this.show = function () {
    ctx.fillStyle = this.highlight ? "red" : "green";
    ctx.fillRect(
      this.x,
      0,
      this.width,
      this.top - hitboxCorrection
    );
    ctx.fillRect(
      this.x,
      canvas.height - this.bottom + hitboxCorrection,
      this.width,
      this.bottom - hitboxCorrection
    );
  };

  this.update = function () {
    this.x -= obstacleSpeed;
  };

  this.offscreen = function () {
    return this.x < -this.width;
  };

  this.hits = function (bird) {
    if (
      bird.y - birdSize.height / 2 < this.top ||
      bird.y + birdSize.height / 2 > canvas.height - this.bottom
    ) {
      if (bird.x + birdSize.width / 2 > this.x && bird.x - birdSize.width / 2 < this.x + this.width) {
        this.highlight = true;
        return true;
      }
    }
    this.highlight = false;
    return false;
  };
}

function nextGeneration() {
  reset();
  calculateFitness();
  normalizeFitness();
  generate();
  savedBirds = [];
  generation++;
}

function reset() {
  score = 0;
  frame = 0;
  obstacles = [];
  allBirdsDead = false;
  allBirdsOnFloor = false;
  if (playing) {
    birds[0].x = 64;
    birds[0].y = canvas.height / 2;
    birds[0].dead = false;
    birds[0].score = 0;
    birds[0].fitness = 0;
    birds[0].brain = new NeuralNetwork(5, 8, 2);
  } else {
    birds = [];
  }
}

function calculateFitness() {
  var sum = 0;
  for (let bird of savedBirds) {
    sum += bird.score;
  }
  for (let bird of savedBirds) {
    bird.fitness = bird.score / sum;
  }
}

function normalizeFitness() {
  var sum = 0;
  for (let bird of savedBirds) {
    sum += bird.fitness;
  }
  for (let bird of savedBirds) {
    bird.fitness /= sum;
  }
}

function generate() {
  for (let i = 0; i < POPULATION_SIZE - 1; i++) {
    var parentA = selectParent();
    var parentB = selectParent();
    var child = crossover(parentA, parentB);
    mutate(child);
    birds[i] = child;
  }
  birds[POPULATION_SIZE - 1] = savedBirds[0].copy();
}

function selectParent() {
  var index = 0;
  var r = Math.random();
  while (r > 0) {
    r -= savedBirds[index].fitness;
    index++;
  }
  index--;
  return savedBirds[index];
}

function crossover(parentA, parentB) {
  var child = new Bird();
  var weightsA = parentA.brain.model.getWeights();
  var weightsB = parentB.brain.model.getWeights();
  var childWeights = [];
  for (let i = 0; i < weightsA.length; i++) {
    var shape = weightsA[i].shape;
    var dataA = weightsA[i].dataSync().slice();
    var dataB = weightsB[i].dataSync().slice();
    var childData = [];
    for (let j = 0; j < dataA.length; j++) {
      var rand = Math.random();
      if (rand > 0.5) {
        childData[j] = dataA[j];
      } else {
        childData[j] = dataB[j];
      }
    }
    childWeights[i] = tf.tensor(childData, shape);
  }
  child.brain.model.setWeights(childWeights);
  return child;
}

function mutate(child) {
  var weights = child.brain.model.getWeights();
  var mutatedWeights = [];
  for (let i = 0; i < weights.length; i++) {
    var shape = weights[i].shape;
    var data = weights[i].dataSync().slice();
    for (let j = 0; j < data.length; j++) {
      if (Math.random() < 0.1) {
        var randomValue = Math.random();
        data[j] += randomValue < 0.5 ? randomValue : -randomValue;
      }
    }
    mutatedWeights[i] = tf.tensor(data, shape);
  }
  child.brain.model.setWeights(mutatedWeights);
}

function createSlider(min, max, value) {
  var slider = document.createElement("input");
  slider.type = "range";
  slider.min = min;
  slider.max = max;
  slider.value = value;
  slider.step = "0.01";
  return slider;
}

function setupUI() {
  var generationSlider = createSlider(1, 100, generation);
  generationSlider.addEventListener("input", function () {
    generation = parseInt(this.value);
  });

  var obstacleSpeedSlider = createSlider(1, 10, obstacleSpeed);
  obstacleSpeedSlider.addEventListener("input", function () {
    obstacleSpeed = parseFloat(this.value);
  });

  var obstacleSpacingSlider = createSlider(100, 400, obstacleSpacing);
  obstacleSpacingSlider.addEventListener("input", function () {
    obstacleSpacing = parseInt(this.value);
  });

  var minGapFactorSlider = createSlider(1, 5, minGapFactor);
  minGapFactorSlider.addEventListener("input", function () {
    minGapFactor = parseFloat(this.value);
  });

  var gravitySlider = createSlider(0.1, 2, gravity);
  gravitySlider.addEventListener("input", function () {
    gravity = parseFloat(this.value);
  });

  var flapAccelerationSlider = createSlider(1, 10, flapAcceleration);
  flapAccelerationSlider.addEventListener("input", function () {
    flapAcceleration = parseFloat(this.value);
  });

  var decaySlider = createSlider(0.9, 1, decay);
  decaySlider.addEventListener("input", function () {
    decay = parseFloat(this.value);
  });

  var thinkDelaySlider = createSlider(1, 10, thinkDelay);
  thinkDelaySlider.addEventListener("input", function () {
    thinkDelay = parseInt(this.value);
  });

  var populationSizeSlider = createSlider(1, 100, POPULATION_SIZE);
  populationSizeSlider.addEventListener("input", function () {
    POPULATION_SIZE = parseInt(this.value);
  });

  var buttonsContainer = document.getElementById("buttons-container");
  buttonsContainer.appendChild(generationSlider);
  buttonsContainer.appendChild(obstacleSpeedSlider);
  buttonsContainer.appendChild(obstacleSpacingSlider);
  buttonsContainer.appendChild(minGapFactorSlider);
  buttonsContainer.appendChild(gravitySlider);
  buttonsContainer.appendChild(flapAccelerationSlider);
  buttonsContainer.appendChild(decaySlider);
  buttonsContainer.appendChild(thinkDelaySlider);
  buttonsContainer.appendChild(populationSizeSlider);
}

function startGame() {
  canvas = document.getElementById("game");
  ctx = canvas.getContext("2d");

  setupUI();

  setInterval(game, 1000 / fps);

  reset();
}

startGame();

