export class Navigation {
    constructor(lobby) {
        this.lobby = lobby;
        this.gridSize = 50; // Higher resolution
        this.grid = [];
        this.rows = 0;
        this.cols = 0;
        this.lastBuild = 0;
        this.dirty = true; // Initial build required
    }

    markDirty() {
        this.dirty = true;
    }

    buildGrid() {
        const size = this.lobby.worldSize;
        this.cols = Math.ceil(size / this.gridSize);
        this.rows = Math.ceil(size / this.gridSize);
        
        // Grid now stores COST (0 = free, 1 = blocked, >1 = high cost)
        this.grid = Array(this.rows).fill().map(() => Array(this.cols).fill(0));

        // Mark obstacles
        const obstacles = Object.values(this.lobby.elements).filter(e => {
            return !e.body.isSensor || e.type === 'building';
        });

        obstacles.forEach(e => {
            const bounds = e.body.bounds;
            const minX = Math.floor(bounds.min.x / this.gridSize);
            const maxX = Math.ceil(bounds.max.x / this.gridSize);
            const minY = Math.floor(bounds.min.y / this.gridSize);
            const maxY = Math.ceil(bounds.max.y / this.gridSize);

            for (let y = Math.max(0, minY); y < Math.min(this.rows, maxY); y++) {
                for (let x = Math.max(0, minX); x < Math.min(this.cols, maxX); x++) {
                    this.grid[y][x] = 1; // Blocked
                }
            }
        });

        // Heatmap pass: Inflate costs near walls to keep bots in the middle
        // Optimization: Use a temporary flat array for comparison to avoid JSON.stringify
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.grid[y][x] === 1) {
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const ny = y + dy, nx = x + dx;
                            if (this.isValid(nx, ny) && this.grid[ny][nx] !== 1) {
                                const dist = Math.max(Math.abs(dx), Math.abs(dy));
                                const cost = dist === 1 ? 8 : 3;
                                // We don't need a temp grid here if we only update NON-blocked cells
                                // and the logic is purely based on proximity to 1s.
                                this.grid[ny][nx] = Math.max(this.grid[ny][nx], cost);
                            }
                        }
                    }
                }
            }
        }
        
        this.dirty = false;
        this.lastBuild = Date.now();
    }

    findPath(startPos, endPos) {
        if (this.dirty) this.buildGrid();
        
        const start = this.worldToGrid(startPos);
        const end = this.worldToGrid(endPos);

        if (!this.isValid(start.x, start.y) || !this.isValid(end.x, end.y)) return null;
        
        if (this.grid[start.y][start.x] === 1) {
            const free = this.findNearestFree(start.x, start.y);
            if (free) { start.x = free.x; start.y = free.y; }
            else return null;
        }

        const size = this.rows * this.cols;
        const openSet = [start.x + start.y * this.cols];
        const inOpenSet = new Uint8Array(size);
        inOpenSet[start.x + start.y * this.cols] = 1;

        const cameFrom = new Int32Array(size).fill(-1);
        const gScore = new Float32Array(size).fill(Infinity);
        const fScore = new Float32Array(size).fill(Infinity);

        const startIdx = start.x + start.y * this.cols;
        gScore[startIdx] = 0;
        fScore[startIdx] = this.heuristic(start, end);

        let iterations = 0;
        const maxIterations = 600;

        while (openSet.length > 0) {
            if (iterations++ > maxIterations) break;

            let lowestIdx = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (fScore[openSet[i]] < fScore[openSet[lowestIdx]]) lowestIdx = i;
            }
            
            const currentIdx = openSet.splice(lowestIdx, 1)[0];
            inOpenSet[currentIdx] = 0;
            const cx = currentIdx % this.cols;
            const cy = Math.floor(currentIdx / this.cols);

            if (cx === end.x && cy === end.y) {
                return this.reconstructPath(cameFrom, currentIdx);
            }

            // Neighbors
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = cx + dx, ny = cy + dy;
                    if (!this.isValid(nx, ny) || this.grid[ny][nx] === 1) continue;

                    const nIdx = nx + ny * this.cols;
                    const dist = (dx !== 0 && dy !== 0) ? 1.414 : 1.0;
                    const cellCost = this.grid[ny][nx];
                    const tentativeGScore = gScore[currentIdx] + dist + cellCost;

                    if (tentativeGScore < gScore[nIdx]) {
                        cameFrom[nIdx] = currentIdx;
                        gScore[nIdx] = tentativeGScore;
                        fScore[nIdx] = tentativeGScore + this.heuristic({x: nx, y: ny}, end);
                        if (!inOpenSet[nIdx]) {
                            openSet.push(nIdx);
                            inOpenSet[nIdx] = 1;
                        }
                    }
                }
            }
        }
        return null;
    }

    heuristic(a, b) {
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        // Octile distance for 8-directional grid
        return (dx + dy) + (1.414 - 2) * Math.min(dx, dy);
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

    reconstructPath(cameFrom, currentIdx) {
        const path = [];
        let curr = currentIdx;
        while (curr !== -1) {
            path.unshift(this.gridToWorld({ 
                x: curr % this.cols, 
                y: Math.floor(curr / this.cols) 
            }));
            curr = cameFrom[curr];
        }
        return path;
    }
}
