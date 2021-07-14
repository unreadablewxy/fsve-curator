import {EventEmitter} from "events";

import {createParser} from "./ini";

// UC/CP20/TSC>scm.uc/fs-curator/src/ipc/request.hpp::uc::ipc::Request

enum Opcode /*: uint32_t */ {
    Unknown = 0, // Not used, occupying 0 to detect serialization error
    Patrol,
    Thumbnail,
    Offer,
    Query,
    Config,
}

enum Status /*: uint32_t */ {
    Ok = 0,
    Unsupported = 0x10, // Opcode was bad
    Unexpected, // Unexpected error
    InvalidParams, // Parameters were not valid
    NotFound, // A requested resource is missing
}

// UC/CP20/TSC<scm.uc/fs-curator/src/ipc/request.hpp::uc::ipc::Request

const NotConnected = "Not connected to curator service";

export const id = "de.unreadableco.fs-curator.service";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
    private buildable: boolean;
    private format: string;
    private aspect: string;
    private resolution: string;

    public instances = new Array<PathGenerator>();

    constructor(private readonly basePath: string) {
        this.reset();
    }

    onAssignment(variable: string, value: string) {
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

    onSectionEnd() {
        if (this.buildable)
            this.instances.push(this.build());
        else
            this.reset();
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
    private get buildable(): boolean {
        return Boolean(this.product.path && this.product.name);
    }

    private product: Partial<Hopper>;

    public instances = new Array<Hopper>();

    constructor(private readonly separator: string) {
        this.product = {};
    }
    
    reset() {
        this.product = {};
    }

    onAssignment(variable: string, value: string) {
        if (variable !== "path") return;

        this.product.path = value;

        const separatorIndex = value.lastIndexOf(this.separator);
        this.product.name = value.slice(separatorIndex + 1);
    }

    onSectionEnd() {
        if (this.buildable)
            this.instances.push(this.build());
        else
            this.reset();
    }

    private build(): Hopper {
        const product = this.product as Hopper;
        this.reset();
        return product;
    }
}

function translateError(status: Status, buffer: Uint8Array): string {
    if (buffer.length > 4)
        return decoder.decode(buffer.slice(4));

    switch (status) {
    case Status.InvalidParams:
        return "Bad request";
    case Status.NotFound:
        return "No data available";
    case Status.Unexpected:
        return "Unexpected internal error";
    case Status.Unsupported:
        return "Unsupported request";

    default:
        return `Unrecognized status code: ${status}`;
    }
}

interface Session {
    configPath: string;
    collectionPath: string;
    thumbnailPathGenerators: PathGenerator[];
    hoppers: Hopper[];

    call(payload: Uint8Array): Promise<Uint8Array>;
    close(): void;
}

interface Events {
    on(event: "connect", handler: (connected: boolean) => void): this;
}

function createConfigRequest(): Uint8Array {
    const request = new Uint32Array(1);
    request[0] = Opcode.Config;
    return new Uint8Array(request.buffer);
}

function createPhashRequest(path: string): Uint8Array {
    const request = new Uint8Array(4 + 4 + 6 + path.length);

    const out = new DataView(request.buffer);
    out.setUint32(0, Opcode.Query, true);
    out.setUint32(4, 3, true); // result count limit

    encoder.encodeInto("phash", request.subarray(8));
    out.setUint8(13, 0);

    encoder.encodeInto(path, request.subarray(14));

    return request;
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

    getPath(index: "by-order", group: number | string, fileIndex: number | string): string;
    getPath(index: "by-id", id: string): string;
    getPath(index: "by-order" | "by-id", ...parts: unknown[]): string {
        if (!this.session)
            return "";

        return `${this.session.collectionPath}/${index}/${parts.join("/")}`;
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
        const thumbRoot = this.reader.joinPath(collectionPath, "cache", "thumbnail");
        const thumbPathGenBuilder = new ThumbnailPathGeneratorBuilder(thumbRoot);
        const hopperBuilder = new HopperBuilder(this.reader.joinPath("a", "b")[1]);
        
        const parseIniLine = createParser().
            with("hopper", hopperBuilder).
            with("store", thumbPathGenBuilder);

        await this.reader.reduceTextFile(configPath,
            (_: null, line: string) => parseIniLine(line));

        parseIniLine("\0");

        return {
            configPath,
            collectionPath,
            hoppers: hopperBuilder.instances,
            thumbnailPathGenerators: thumbPathGenBuilder.instances,
        };
    }

    public async connect(path: string): Promise<void> {
        const proxy = await this.ipc.connect(path, this.onDisconnect.bind(this)) as Session;
        const buffer = await proxy.call(createConfigRequest());
        const [
            configPath,
            collectionPath,
        ] = decoder.decode(buffer.slice(4)).split("\0");

        const sessionPatch = await this.parseConfig(configPath, collectionPath);
        this.session = Object.assign(proxy, sessionPatch);

        this.emit("connect", true);
    }

    public async requestPhashQuery(directory: string, file: string): Promise<Similar[]> {
        const session = this.session;
        if (!session)
            throw new Error(NotConnected);

        const request = createPhashRequest(
            this.reader.joinPath(directory, file));

        const r = await session.call(request);
        const view = new DataView(r.buffer, r.byteOffset, r.byteLength);

        const status = view.getUint32(0, true);
        if (status)
            throw new Error(translateError(status, r));

        const result: Similar[] = [];
        for (let read = 4; read < r.byteLength; read += 12)
            result.push({
                group: view.getUint32(read, true),
                index: view.getUint32(read + 4, true),
                diff:  view.getUint32(read + 8, true),
            });

        return result;
    }

    private onDisconnect(): void {
        delete this.session;
        this.emit("connect", false);
    }
}