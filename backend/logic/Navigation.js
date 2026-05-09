export class Navigation {
    constructor(lobby) {
        this.lobby = lobby;
        this.gridSize = 50; // Higher resolution
        this.grid = [];
        this.rows = 0;
        this.cols = 0;
        this.lastBuild = 0;
    }

    buildGrid() {
        const size = this.lobby.worldSize;
        this.cols = Math.ceil(size / this.gridSize);
        this.rows = Math.ceil(size / this.gridSize);
        
        this.grid = Array(this.rows).fill().map(() => Array(this.cols).fill(0));

        // Mark obstacles and inflate them
        const obstacles = Object.values(this.lobby.elements).filter(e => {
            return !e.body.isSensor || e.type === 'building';
        });

        obstacles.forEach(e => {
            const bounds = e.body.bounds;
            // Pad bounds by half a tank width (approx 20px)
            const padding = 25; 
            const minX = Math.floor((bounds.min.x - padding) / this.gridSize);
            const maxX = Math.ceil((bounds.max.x + padding) / this.gridSize);
            const minY = Math.floor((bounds.min.y - padding) / this.gridSize);
            const maxY = Math.ceil((bounds.max.y + padding) / this.gridSize);

            for (let y = Math.max(0, minY); y < Math.min(this.rows, maxY); y++) {
                for (let x = Math.max(0, minX); x < Math.min(this.cols, maxX); x++) {
                    this.grid[y][x] = 1; // Blocked
                }
            }
        });

        this.lastBuild = Date.now();
    }

    findPath(startPos, endPos) {
        const start = this.worldToGrid(startPos);
        const end = this.worldToGrid(endPos);

        if (!this.isValid(start.x, start.y) || !this.isValid(end.x, end.y)) return null;
        
        // If start is blocked, find nearest free cell
        if (this.grid[start.y][start.x] === 1) {
            const free = this.findNearestFree(start.x, start.y);
            if (free) { start.x = free.x; start.y = free.y; }
            else return null;
        }

        const openSet = [start];
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = `${start.x},${start.y}`;
        gScore.set(startKey, 0);
        fScore.set(startKey, this.heuristic(start, end));

        let iterations = 0;
        const maxIterations = 600; // Increased for finer grid

        while (openSet.length > 0) {
            if (iterations++ > maxIterations) break;

            // Simple Priority Queue behavior
            let lowestIdx = 0;
            for (let i = 1; i < openSet.length; i++) {
                const fA = fScore.get(`${openSet[i].x},${openSet[i].y}`);
                const fB = fScore.get(`${openSet[lowestIdx].x},${openSet[lowestIdx].y}`);
                if (fA < fB) lowestIdx = i;
            }
            
            const current = openSet.splice(lowestIdx, 1)[0];
            const currentKey = `${current.x},${current.y}`;

            if (current.x === end.x && current.y === end.y) {
                return this.reconstructPath(cameFrom, current);
            }

            const neighbors = [
                { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 },
                { x: current.x + 1, y: current.y + 1 }, { x: current.x - 1, y: current.y - 1 },
                { x: current.x + 1, y: current.y - 1 }, { x: current.x - 1, y: current.y + 1 }
            ];

            for (let neighbor of neighbors) {
                if (!this.isValid(neighbor.x, neighbor.y) || this.grid[neighbor.y][neighbor.x] === 1) continue;

                const neighborKey = `${neighbor.x},${neighbor.y}`;
                // Diagonal cost 1.4, Cardinal cost 1
                const dist = (neighbor.x !== current.x && neighbor.y !== current.y) ? 1.4 : 1;
                const tentativeGScore = gScore.get(currentKey) + dist;

                if (!gScore.has(neighborKey) || tentativeGScore < gScore.get(neighborKey)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeGScore);
                    fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor, end));
                    if (!openSet.some(p => p.x === neighbor.x && p.y === neighbor.y)) {
                        openSet.push(neighbor);
                    }
                }
            }
        }

        return null;
    }

    heuristic(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    worldToGrid(pos) {
        return {
            x: Math.floor(pos.x / this.gridSize),
            y: Math.floor(pos.y / this.gridSize)
        };
    }

    gridToWorld(cell) {
        return {
            x: cell.x * this.gridSize + this.gridSize / 2,
            y: cell.y * this.gridSize + this.gridSize / 2
        };
    }

    isValid(x, y) {
        return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
    }

    findNearestFree(x, y) {
        for (let r = 1; r < 5; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (this.isValid(x + dx, y + dy) && this.grid[y + dy][x + dx] === 0) {
                        return { x: x + dx, y: y + dy };
                    }
                }
            }
        }
        return null;
    }

    reconstructPath(cameFrom, current) {
        const path = [this.gridToWorld(current)];
        while (cameFrom.has(`${current.x},${current.y}`)) {
            current = cameFrom.get(`${current.x},${current.y}`);
            path.unshift(this.gridToWorld(current));
        }
        return path;
    }
}
