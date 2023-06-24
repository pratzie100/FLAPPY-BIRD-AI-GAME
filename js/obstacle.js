function Obstacle(x, y, height, meta, isTopObstacle) {
    this.x = x;
    this.y = y;
    this.currX = x;
    this.currY = y;
    this.width = 84;
    this.height = height;
    this.meta = meta;
    this.isTopObstacle = isTopObstacle;

    this.completed = false;
    this.oscillate = false;
    this.vel = 0;
    this.image = new Image();

    this.show = function() {
        this.image.src = "img/pipe.png";
        var dy = this.currY;
        if (isTopObstacle) {
            this.image.src = "img/pipe_flipped.png";
            dy -= (this.image.height - this.height);
        }

        ctx.drawImage(
            this.image,
            0, 0,
            this.image.width, this.image.height,
            this.currX, dy,
            this.image.width, this.image.height
        );

        this.width = this.image.width;
    };

    this.update = function() {
        this.currX -= 1;

        if (this.oscillate) {
            if (isTopObstacle) {
                var top = 0;
                var bottom = this.meta.canvas.height - (this.meta.floorHeight + this.meta.gap);
                var oscillatingPoint = this.currY + this.height;
                this.setVelocity(oscillatingPoint, top, bottom);
            } else {
                var top = this.meta.gap;
                var bottom = this.meta.canvas.height - this.meta.floorHeight;
                var oscillatingPoint = this.currY;
                this.setVelocity(oscillatingPoint, top, bottom);
            }

            if (this.vel == 0) this.vel = obstacleSpeed; // initially move down
            this.currY += this.vel;
        }
    };

    this.setVelocity = function(oscillatingPoint, top, bottom) {
        if (oscillatingPoint <= top) this.vel = obstacleSpeed;
        if (oscillatingPoint >= bottom) this.vel = -obstacleSpeed;
    };
}
