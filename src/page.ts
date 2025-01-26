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

if (!globalThis.getPorts) {
    let controller: ReadableStreamDefaultController

    globalThis.onDone = {}

    const stream = new ReadableStream<CallbackEvent>({
        start(newController) {
            controller = newController
        }
    })
    globalThis.reader = stream.getReader()

    function wrapMethod<ReturnValue>(type: string) {
        return function method(...args: any[]) {
            return new Promise<ReturnValue>(async (resolve) => {
                controller.enqueue({
                    resolve,
                    type,
                    args: args,
                })
            })
        }
    }

    globalThis.requestSerial = wrapMethod('requestSerial')
    globalThis.openSerial = wrapMethod('openSerial')
    globalThis.readPort = wrapMethod('readPort')
    globalThis.writePort = wrapMethod('writePort')
    globalThis.closePort = wrapMethod('closePort')
    globalThis.setSignals = wrapMethod('setSignals')
    globalThis.getPorts = wrapMethod('getPorts')
}

class SerialPort {
    private active = false
    private activeReadable?: ReadableStream<Uint8Array> = undefined
    private activeWritable?: WritableStream<Uint8Array> = undefined

    vendorId = 0x0403
    productId = 0x6001

    constructor(private id: string) { }

    async open(options: SerialOptions) {
        const port = this.id

        const err = await globalThis.openSerial(port, options)
        if (err instanceof Error) throw err

        await globalThis.readPort(port)
        this.active = true
    }

    get readable() {
        if (!this.active) return
        if (this.activeReadable) return this.activeReadable

        this.activeReadable = new ReadableStream({
            type: 'bytes',
            async pull(controller) {
                globalThis.readCallback = (data: number[]) => {
                    try {
                        controller.enqueue(new Uint8Array(data))
                    } catch { }
                }
            },
            cancel: () => {
                this.activeReadable = undefined
            }
        }, {
            highWaterMark: 512,
        })

        return this.activeReadable
    }

    get writable() {
        if (!this.active) return
        if (this.activeWritable) return this.activeWritable

        this.activeWritable = new WritableStream({
            write: async (chunk) => {
                const err = await globalThis.writePort(this.id, Array.from(chunk.values()))
                if (err instanceof Error) throw err
            },
            close: () => {
                this.activeWritable = undefined
            }
        })
        return this.activeWritable
    }

    async close() {
        const err = await globalThis.closePort(this.id)
        this.active = false
        if (err) throw err
    }

    async setSignals(signals: SerialOutputSignals) {
        const err = await globalThis.setSignals(this.id, signals)
        if (err) throw err
    }

    addEventListener() {}
}

// @ts-ignore
navigator.serial.requestPort = async (options: SerialPortRequestOptions) => {
    return new SerialPort(await globalThis.requestSerial(options))
}

// @ts-ignore
navigator.serial.getPorts = async () => {
    const ports = await globalThis.getPorts()
    return ports.map(port => new SerialPort(port))
}
