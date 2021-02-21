import "./conflicts.sass";
import React from "react";
import type {match as Match} from "react-router";
import type {Dirent, Stats} from "fs";
import {mdiCompare, mdiHandRight, mdiTrashCanOutline, mdiVectorCombine} from "@mdi/js";
import {Icon} from "@mdi/react";

import {NoConnection} from "./no-connection";

import {Service, id as ServiceID} from "./service";
import { createParser } from "./ini";

interface PathProps {
    hopper?: string;
}

interface Props extends PathProps {
    [ServiceID]: Service;
    reader: any;

    onNavigate: (path: string, state?: unknown) => void;
}

interface Conflict {
    file: string;
    other: string;
    kind: string;
}

class ConflictsBuilder {
    readonly instances = new Array<Conflict>();

    onAssignment(identifier: string, value: string): void {
        const parts = value.trim().split(" ");
        this.instances.push({
            file: identifier.trim(),
            kind: parts[0],
            other: parts[parts.length - 1],
        });
    }

    onSectionEnd(): void {}
}

type HaltedImport = {
    name: string;
    loading: true;
} | {
    name: string;
    loading: false;
    conflicts: Conflict[];
};

interface State {
    path: string | null;
    halted: HaltedImport[];
}

export class Conflicts extends React.PureComponent<Props, State> {
    private get service(): Service {
        return this.props[ServiceID];
    }

    constructor(props: Props) {
        super(props);

        const hopperName = this.props.hopper;
        const hopper = hopperName && this.service.hoppers?.find(h => h.name === hopperName);

        this.state = Object.assign({
            path: hopper ? hopper.path : null,
            halted: [],
        }, this.props.initialState);
    }

    handleRefreshHalted = async (index: number) => {
        const {name} = this.state.halted[index];

        const conflict = new ConflictsBuilder();
        const parseIniLine = createParser().with("conflicts", conflict);

        const path = this.props.reader.joinPath(this.state.path, `${name}.ini`);
        await this.props.reader.reduceTextFile(
            path, (_: null, line: string) => parseIniLine(line));

        this.setState(s => {
            const halted = s.halted.slice();
            halted[index] = {
                name,
                loading: false,
                conflicts: conflict.instances,
            };
            return {halted};
        });
    };

    handleRefresh = async () => {
        const candidates = new Map<string, number>();
        for (const entry of await this.props.reader.readDirectory(this.state.path) as Dirent[]) {
            let name = entry.name;
            if (name.endsWith(".ini"))
                name = name.slice(0, name.length - 4);

            candidates.set(name, 1 + (candidates.get(name) || 0));
        }

        const halted = Array.from(candidates.entries()).
            filter(e => e[1] === 2).
            map(e => e[0]).
            sort().
            map(name => ({name, loading: true} as HaltedImport));

        this.setState({halted});

        for (let n = halted.length; n --> 0;)
            this.handleRefreshHalted(n);
    };

    componentDidMount(): void {
        this.service.on("connect", this.handleConnect);

        if (this.state.path)
            this.handleRefresh();
    }

    componentWillUnmount(): void {
        this.service.off("connect", this.handleConnect);
    }

    private renderConflict({file, other, kind}: Conflict) {
        const {joinPath} = this.props.reader;
        return <li>
            <div>
                <img src={`thumb://${joinPath(this.state.path, file)}`} />
            </div>
            <div className="actions">
                <span>
                    <span>{kind.slice(1).trim()}</span>
                    <button title="Compare" onClick={() => this.handleCompare(other, file)}>
                        <Icon path={mdiCompare} />
                    </button>
                </span>
                <span>
                    <button title="Combine Group"><Icon path={mdiVectorCombine} /></button>
                    <button title="Drop"><Icon path={mdiTrashCanOutline} /></button>
                    {kind === "#perceptual" && <button title="Ignore"><Icon path={mdiHandRight} /></button>}
                </span>
            </div>
        </li>;
    }

    private renderContent(): React.ReactNode {
        if (!this.state.path) return null;

        return <ul>
            {this.state.halted.map(h => <li key={h.name}>
                <h1>{h.name}</h1>
                {h.loading
                    ? <div>Loading</div>
                    : <ul>{h.conflicts.map(c => this.renderConflict(c))}</ul>}
            </li>)}
        </ul>;
    }

    render() {
        const service = this.service;
        const connected = service.connected;

        return <section className="curator conflicts">
            {connected ? this.renderContent() : NoConnection}
        </section>;
    }

    handleConnect = () => {
        this.forceUpdate();
    };

    handleCompare = async (existing: string, blocked: string) => {
        const match = /(\d+)\/(\d+)/.exec(existing);
        if (match) {
            existing = this.service.getPath("by-order", match[1], match[2]);
        } else {
            existing = this.service.getPath("by-id", existing);
        }

        blocked = this.props.reader.joinPath(this.state.path, blocked);
        this.props.onNavigate(`/compare?left=${existing}&right=${blocked}`);
    };
}

export const Definition = {
    id: "conflicts",
    path: "/fs-curator/conflicts/:hopper",
    services: [ServiceID, "reader"],
    component: Conflicts,
    selectRouteParams: (location: Location, {params}: Match<PathProps>): PathProps => ({
        hopper: params["hopper"],
    }),
};