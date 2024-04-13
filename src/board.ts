import { spawn } from 'child_process'
import { ChildProcess } from "node:child_process";

class Board {
    private process: ChildProcess
    public port = '/tmp/simavr-uart0'

    constructor() {
        this.process = spawn('./simduino.elf', {
            cwd: `${import.meta.dirname}/../build`
        })
    }

    public stop() {
        this.process.kill()
    }
}

export default Board
