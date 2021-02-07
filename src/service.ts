import {EventEmitter} from "events";
import type {Socket} from "net";

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
    buildable: boolean;

    private format: string;
    private aspect: string;
    private resolution: string;

    constructor(private readonly basePath: string) {
        this.reset();
    }

    update(variable: string, value: string) {
        switch (variable) {
        case "thumbnail_path":          this.buildable = true; break;
        case "thumbnail_resolution":    this.resolution = `p${value}`; break;
        case "thumbnail_aspect":        this.aspect = `-${value}`; break;
        case "thumbnail_format":
            if (value.toLowerCase().startsWith("jpeg"))
                this.format = `q${value.slice(4) || "92"}.jpeg`;
            else
                this.format = `.${value}`;
            break;
        }
    }

    reset() {
        this.format = ".png";
        this.aspect = "";
        this.resolution = "";
        this.buildable = false;
    }

    build(): PathGenerator {
        try {
            return createThumbnailPathGenerator(
                this.basePath, this.aspect, this.resolution, this.format);
        } finally {
            this.reset();
        }
    }
}

export interface Hopper {
    name: string;
    path: string;
}

class HopperBuilder {
    get buildable(): boolean {
        return Boolean(this.product.path && this.product.name);
    }

    private product: Partial<Hopper>;

    constructor(private readonly separator: string) {
        this.product = {};
    }
    
    reset() {
        this.product = {};
    }

    update(variable: string, value: string) {
        if (variable !== "path") return;

        this.product.path = value;

        const separatorIndex = value.lastIndexOf(this.separator);
        this.product.name = value.slice(separatorIndex + 1);
    }

    build(): Hopper {
        const product = this.product as Hopper;
        this.reset();
        return product;
    }
}

interface Request {
    ready: (buffer: Buffer) => void;
    fail: (err: Error) => void;
}

class Connection {
    private readonly requests: Request[] = [];

    constructor(private readonly socket: Socket) {
        this.socket.on("data", this.onData.bind(this));
    }

    sendAndReceive(request: any): Promise<Buffer> {
        request.send(this.socket);
        return new Promise((ready, fail) => {
            this.requests.push({ready, fail});
        });
    }

    close() {
        this.socket.destroy();
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
}

interface Session extends Connection {
    configPath: string;
    collectionPath: string;
    thumbnailPathGenerators: PathGenerator[];
    hoppers: Hopper[];
}

interface Events {
    on(event: "connect", handler: (connected: boolean) => void): this;
}

export class Service extends EventEmitter implements Events {
    static readonly shortName = "service";
    static readonly dependencies = ["ipc", "reader"];

    private readonly ipc: any;
    private readonly reader: any;

    private session?: Session;

    constructor([ipc, reader]: any) {
        super();

        this.ipc = ipc;
        this.reader = reader;

        this.onDisconnect = this.onDisconnect.bind(this);
    }

    public get connected(): boolean {
        return !!this.session;
    }

    public get hoppers(): Hopper[] | undefined {
        return this.session?.hoppers;
    }

    public get collectionPath(): string | undefined {
        return this.session?.collectionPath;
    }

    public getThumbnailPaths(group: number, index: number): string[] {
        const context = this.session;
        if (!context)
            throw new Error(NotConnected);

        const result = new Array<string>(context.thumbnailPathGenerators.length);
        for (let n = result.length; n --> 0;)
            result[n] = context.thumbnailPathGenerators[n](group, index);

        return result;
    }

    public getPath(group: number, index: number): string {
        if (!this.session)
            return "";

        return `${this.session.collectionPath}/by-order/${group}/${index}`;
    }

    public disconnect(): void {
        if (this.session) {
            this.session.close();
            delete this.session;
        }
    }

    private async parseConfig(
        configPath: string,
        collectionPath: string,
    ): Promise<Partial<Session>> {
        const thumbRoot = this.reader.joinPath(collectionPath, "thumbnail");
        const thumbPathGenBuilder = new ThumbnailPathGeneratorBuilder(thumbRoot);
        const hopperBuilder = new HopperBuilder(this.reader.joinPath("a", "b")[1]);
        let section = "";

        const patch = await this.reader.reduceTextFile(configPath,
            (out: Session, line: string) => {
                if (!line) return;

                if (line.startsWith('[')) {
                    switch (section) {
                    case "[hopper]":
                        if (hopperBuilder.buildable)
                            out.hoppers.push(hopperBuilder.build());
                        else
                            hopperBuilder.reset();
                            
                        break;

                    case "[store]":
                        if (thumbPathGenBuilder.buildable)
                            out.thumbnailPathGenerators.push(thumbPathGenBuilder.build());
                        else
                            thumbPathGenBuilder.reset();

                        break;
                    }

                    section = line;
                } else {
                    const assignment = line.indexOf("=");
                    if (assignment < 1)
                        return;

                    const variable = line.slice(0, assignment).trim();
                    const value = line.slice(assignment + 1).trim();

                    thumbPathGenBuilder.update(variable, value);
                    hopperBuilder.update(variable, value);
                }
            },
            {
                configPath,
                collectionPath,
                hoppers: [],
                thumbnailPathGenerators: [],
            });

        // We build on the beginning of each section
        if (thumbPathGenBuilder.buildable)
            patch.thumbnailPathGenerators.push(thumbPathGenBuilder.build());

        return patch;
    }

    public async connect(path: string): Promise<void> {
        const socket = await this.ipc.connect(path);
        const connection = new Connection(socket);

        const request = this.ipc.createRequest().addUInt32(Opcode.Config, 0);
        const buffer = await connection.sendAndReceive(request);

        const [
            configPath,
            collectionPath,
        ] = buffer.toString(TextEncoding, ResponseHeaderSize, buffer.length).split("\0");

        const sessionPatch = await this.parseConfig(configPath, collectionPath);
        this.session = Object.assign(connection as Session, sessionPatch);

        socket.on("close", this.onDisconnect);
        this.emit("connect", true);
    }

    public async requestPhashQuery(directory: string, file: string): Promise<Similar[]> {
        const session = this.session;
        if (!session)
            return Promise.reject(new Error(NotConnected));

        const CandidateLimit = 3;

        const request = this.ipc.createRequest();
        request.addUInt32(Opcode.Query, 0, CandidateLimit)
            .addString("phash\0")
            .addString(this.reader.joinPath(directory, file))
            .setUInt32(4, request.fill - RequestHeaderSize);

        const buffer = await session.sendAndReceive(request);

        const result: Similar[] = [];
        for (let read = ResponseHeaderSize; read < buffer.length; read += 12)
            result.push({
                group: buffer.readUInt32LE(read),
                index: buffer.readUInt32LE(read + 4),
                diff:  buffer.readUInt32LE(read + 8),
            });

        return result;
    }

    private onDisconnect(): void {
        delete this.session;
        this.emit("connect", false);
    }
}