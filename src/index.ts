import {SerialPort} from "serialport";
import {Page} from "playwright";
import Board from "./board.ts";
import {randomUUID} from "node:crypto";
import {clearTimeout} from "node:timers";
import * as fs from "node:fs";

type CallbackEvent = {
    resolve: (value: unknown) => void,
    type: string,
    args: any[]
}

declare module globalThis {
    let requestSerial: (options: SerialPortRequestOptions) => Promise<string>,
        openSerial: (id: string, options: SerialOptions) => Promise<void|Error>,
        readPort: (id: string) => Promise<number[]|Error>,
        readCallback: (data: number[]) => void,
        writePort: (id: string, data: number[]) => Promise<void|Error>,
        closePort: (id: string) => Promise<void|Error>,
        setSignals: (id: string, signals: SerialOutputSignals) => Promise<void|Error>,
        getPorts: () => Promise<string[]>,
        onDone: Record<string, (value: any) => void>,
        reader: ReadableStreamDefaultReader<CallbackEvent>
}

const ports: Record<string, SerialPort|null> = {}
export default async function setup(page: Page) {
    const arduino = new Board()

    const methods: Record<string, (...args: any[]) => Promise<any>> = {
        async requestSerial(_page: Page, _options: SerialPortRequestOptions) {
            const id = randomUUID()
            ports[id] = null

            return String(id)
        },
        async openSerial(_page: Page, id: string, options: SerialOptions) {
            if (ports[id]) throw new DOMException('Port already open!')

            return new Promise<void|Error>(resolve => {
                ports[id] = new SerialPort({
                    baudRate: options.baudRate,
                    path: arduino.port,
                    dataBits: 8,
                    parity: 'none',
                    stopBits: 1,
                }, err => {
                    if (err) return resolve(err)
                    resolve()
                })
            })
        },
        async readPort(page: Page, id: string) {
            if (!ports[id]) throw new Error(`User read request to undefined port: ${id}`)

            const port = ports[id] as SerialPort
            try {
                let buffer: number[]|null = null
                let timeout: NodeJS.Timeout|null
                port.on('data', async (data: Buffer) => {
                    if (!buffer) buffer = []
                    buffer.push(...Array.from(data.values()))

                    if (timeout) clearTimeout(timeout)
                    timeout = setTimeout(async () => {
                        const copy = buffer
                        buffer = null

                        await page.evaluate((result) => {
                            if (!result) return
                            globalThis.readCallback(result)
                        }, copy)
                    }, 25)
                })
            } catch (e) {
                return e
            }
        },
        async writePort(_page: Page, id: string, data: number[]) {
            if (!ports[id]) throw new Error(`User write request to undefined port: ${id}`)

            const port = ports[id] as SerialPort
            return new Promise<void|Error>(resolve => {
                port.write(Buffer.from(data), err => {
                    if (err) return resolve(err)
                    resolve()
                })
            })
        },
        async closePort(_page: Page, id: string) {
            if (!ports[id]) throw new Error(`User close request to undefined port: ${id}`)

            const port = ports[id] as SerialPort
            ports[id] = null
            return new Promise<void|Error>(resolve => port.close(err => {
                if (err) return resolve(err)
                resolve()
            }))
        },
        setSignals(_page: Page, id: string, signals: SerialOutputSignals) {
            if (!ports[id]) throw new Error(`User setSignals request to undefined port: ${id}`)

            const port = ports[id] as SerialPort
            return new Promise<void|Error>(resolve => {
                port.set({
                    dtr: signals.dataTerminalReady,
                    rts: signals.requestToSend,
                    brk: signals.break
                }, () => {
                    resolve()
                })
            })
        },
        async getPorts(_page: Page) {
            return Array.from(Object.keys(ports))
        }
    }

    await Promise.all(Object.entries(methods).map(async ([type, implementation]) => {
        await page.exposeFunction(type, (...args: any[]) => implementation(page, ...args))
    }))

    await page.route('**/avrdude-worker.js', async route => {
        const response = await route.fetch();
        const script = await response.text();
        await route.fulfill({ response, body: `${fs.readFileSync(`${import.meta.dirname}/page.js`)}\n\n${script}` });
    });

    await page.addInitScript({
        path: `${import.meta.dirname}/page.js`
    })

    page.on('worker', async worker => {
        let open = true
        worker.on('close', () => open = false)
        while (open) {
            try {
                const action = await worker.evaluate(async () => {
                    if (!globalThis.reader) return

                    const {value, done} = await globalThis.reader.read()
                    if (done || !value) return

                    const execution = crypto.randomUUID()
                    globalThis.onDone[execution] = value.resolve
                    return {
                        execution,
                        type: value.type,
                        args: value.args
                    }
                })

                if (!action) continue
                if (!methods[action.type]) continue

                methods[action.type](worker, ...action.args).then(async result => {
                    await worker.evaluate(async ({ execution, result }) => {
                        globalThis.onDone[execution](result)
                    }, {
                        execution: action.execution,
                        result
                    })
                })
            } catch { /* Once the worker has closed it will throw */ }
        }
    })

}
