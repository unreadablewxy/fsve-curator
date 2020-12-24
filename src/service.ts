import {EventEmitter} from "events";

// UC/CP20/TSC>scm.uc/fs-curator/src/ipc/request.hpp::uc::ipc::Request

enum Opcode /*: uint32_t */ {
    Unknown = 0, // Not used, occupying 0 to detect serialization error
    Patrol,
    Thumbnail,
    Offer,
    Query,
    Config,
};

enum Status /*: uint32_t */ {
    Ok = 0,
    Unsupported = 0x10, // Opcode was bad
    Unexpected, // Unexpected error
    InvalidParams, // Parameters were not valid
    NotFound, // A requested resource is missing
};

// UC/CP20/TSC<scm.uc/fs-curator/src/ipc/request.hpp::uc::ipc::Request

const TextEncoding = "utf-8";
const ResponseHeaderSize = 8;
const RequestHeaderSize = 8;

const NotConnected = "Not connected to curator service";

export const id = "de.unreadableco.fs-curator.service";

export interface Similar {
    readonly group: number;
    readonly index: number;
    readonly diff: number;
}

interface Request {
    ready: (buffer: Buffer) => void;
    fail: (err: Error) => void;
};

type PathGenerator = (group: number, index: number) => string;

function createThumbnailPathGenerator(
    base: string,
    aspect: string,
    resolution: string,
    format: string,
): PathGenerator {
    return function(group: number, index: number) {
        return `file://${base}/${group}-${index}${aspect}${resolution}${format}`;
    };
}

class ThumbnailPathGeneratorBuilder {
    readonly #basePath: string;

    get buildable(): boolean {
        return this.#buildable;
    }

    #format: string;
    #aspect: string;
    #resolution: string;
    #buildable: boolean;

    constructor(basepath: string) {
        this.#basePath = basepath;
        this.reset();
    }

    update(line: string) {
        const assignment = line.indexOf("=");
        if (assignment < 1)
            return;

        const value = line.slice(assignment + 1).trim();

        switch (line.slice(0, assignment).trim()) {
            case "thumbnail_path":          this.#buildable = true; break;
            case "thumbnail_resolution":    this.#resolution = `p${value}`; break;
            case "thumbnail_aspect":        this.#aspect = `-${value}`; break;
            case "thumbnail_format":
                if (value.toLowerCase().startsWith("jpeg"))
                    this.#format = `q${value.slice(4) || "92"}.jpeg`;
                else
                    this.#format = `.${value}`;
                break;
        }
    }

    reset() {
        this.#format = ".png";
        this.#aspect = "";
        this.#resolution = "";
        this.#buildable = false;
    }

    build(): PathGenerator {
        try {
            return createThumbnailPathGenerator(
                this.#basePath, this.#aspect, this.#resolution, this.#format);
        } finally {
            this.reset();
        }
    }
}

interface ConnectionContext {
    connection: any;
    configPath: string;
    collectionPath: string;
    thumbnailPathGenerators: PathGenerator[];
}

interface Events {
    on(event: "connect", handler: (connected: boolean) => void): this;
}

export class Service extends EventEmitter implements Events {
    static readonly shortName = "service";
    static readonly dependencies = ["ipc", "reader"];

    private readonly ipc: any;
    private readonly reader: any;

    private context?: ConnectionContext;

    private readonly requests: Request[] = [];

    constructor([ipc, reader]: any) {
        super();

        this.ipc = ipc;
        this.reader = reader;

        this.onData = this.onData.bind(this);
        this.onDisconnect = this.onDisconnect.bind(this);
    }

    public connected(): boolean {
        return !!this.context;
    }

    public collectionPath(): string | null {
        return this.context ? this.context.collectionPath : null;
    }

    public getThumbnailPaths(group: number, index: number): string[] {
        const context = this.context;
        if (!context)
            throw new Error(NotConnected);

        const result = new Array<string>(context.thumbnailPathGenerators.length);
        for (let n = result.length; n --> 0;)
            result[n] = context.thumbnailPathGenerators[n](group, index);

        return result;
    }

    public disconnect(): void {
        if (this.context)
            this.context.connection.close();
    }

    public connect(path: string): Promise<void> {
        return new Promise(async (done, fail) => {
            const newContext: Partial<ConnectionContext> = {};
            newContext.connection = await this.ipc.connect(path);
            newContext.connection
                .on("data", this.onData)
                .on("close", this.onDisconnect);

            newContext.connection.request()
                .addUInt32(Opcode.Config, 0)
                .send();

            const ready = async (buffer: Buffer): Promise<void> => {
                [
                    newContext.configPath,
                    newContext.collectionPath,
                ] = buffer.toString(TextEncoding, ResponseHeaderSize, buffer.length).split("\0");

                this.context = newContext as ConnectionContext;

                const builder = new ThumbnailPathGeneratorBuilder(
                    this.reader.joinPath(newContext.collectionPath, "thumbnail"));

                const generators = await this.reader.reduceTextFile(newContext.configPath,
                    (out: Array<PathGenerator>, line: string) => {
                        if (line) {
                            if (line.startsWith('[')) {
                                if (builder.buildable)
                                    out.push(builder.build());
                                else
                                    builder.reset();
                            } else
                                builder.update(line);
                        }
                    },
                    new Array<PathGenerator>());

                // We build on the beginning of each section
                if (builder.buildable)
                    generators.push(builder.build());

                newContext.thumbnailPathGenerators = generators;

                this.emit("connect", true);
                done();
            };

            this.requests.push({ready, fail});
        });
    }

    public requestPhashQuery(directory: string, file: string): Promise<Similar[]> {
        const context = this.context;
        if (!context)
            return Promise.reject(new Error(NotConnected));

        const CandidateLimit = 3;
        return new Promise((done, fail) => {
            const request = context.connection.request();
            request.addUInt32(Opcode.Query, 0, CandidateLimit)
                .addString("phash\0")
                .addString(this.reader.joinPath(directory, file))
                .setUInt32(4, request.fill() - RequestHeaderSize)
                .send();

            function ready(buffer: Buffer): void {
                let result: Similar[] = [];
                for (let read = ResponseHeaderSize; read < buffer.length; read += 12)
                    result.push({
                        group: buffer.readUInt32LE(read),
                        index: buffer.readUInt32LE(read + 4),
                        diff:  buffer.readUInt32LE(read + 8),
                    });

                done(result);
            }

            this.requests.push({ready, fail});
        });
    }

    private onData(buffer: Buffer): void {
        const {ready, fail} = this.requests.shift() as Request;

        const status = buffer.readUInt32LE(0);
        if (!status)
            return ready(buffer);

        let message: string;
        if (buffer.length > ResponseHeaderSize)
            message = buffer.toString(TextEncoding, ResponseHeaderSize);
        else switch (status) {
        case Status.InvalidParams:
            message = "Bad request";
            break;
        case Status.NotFound:
            message = "No data available";
            break;
        case Status.Unexpected:
            message = "Unexpected internal error";
            break;
        case Status.Unsupported:
            message = "Unsupported request";
            break;
        default:
            message = `Unrecognized status code: ${status}`;
            break;
        }

        fail(new Error(message));
    }

    private onDisconnect(error: boolean): void {
        delete this.context;
        this.emit("connect", false);
    }
}