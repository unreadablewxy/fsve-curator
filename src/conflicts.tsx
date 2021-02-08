import "./conflicts.sass";
import React from "react";
import type {match as Match} from "react-router";
import type {Dirent} from "fs";
import {mdiCompare, mdiHandRight, mdiTrashCanOutline, mdiVectorCombine} from "@mdi/js";
import {Icon} from "@mdi/react";

import {NoConnection} from "./no-connection";

import {Service, id as ServiceID} from "./service";

interface PathProps {
    hopper?: string;
}

interface Props extends PathProps {
    [ServiceID]: Service;
    reader: any;
}

interface Conflict {
    file: string;
    other: string;
    kind: string;
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

        this.state = {
            path: hopper ? hopper.path : null,
            halted: [],
        };
    }

    handleRefreshHalted = async (index: number) => {
        const {name} = this.state.halted[index];

        let inConflicts = false;

        const path = this.props.reader.joinPath(this.state.path, `${name}.ini`);
        const conflicts = await this.props.reader.reduceTextFile(path,
            (out: Conflict[], line: string) => {
                if (line.startsWith("[")) {
                    inConflicts = line === "[conflicts]";
                    return;
                }

                if (!inConflicts) return;

                const assignment = line.indexOf("=");
                if (assignment < 1) return;

                const file = line.slice(0, assignment).trim();
                const parts = line.slice(assignment + 1).trim().split(" ");

                out.push({file, kind: parts[0], other: parts[parts.length - 1]});
            },
            []) as Conflict[];

        this.setState(s => {
            const halted = s.halted.slice();
            halted[index] = {name, loading: false, conflicts};
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
                <img src={`thumb://${joinPath(this.state.path, other)}`} />
            </div>
            <div className="actions">
                <span>
                    <span>{kind.slice(1).trim()}</span>
                    <button title="Compare"><Icon path={mdiCompare} /></button>
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