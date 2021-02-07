import "./similars.sass"
import React from "react";
import {mdiEye, mdiCompare} from "@mdi/js";
import {Icon} from "@mdi/react";

import {defaultMaxDiff, maxDiffPrefId} from "./constant";
import {Image} from "./image";
import {NoConnection} from "./no-connection";
import {Similar, Service, id as ServiceID} from "./service";

interface PreferenceMappedProps {
    maxDiff: number;
}

interface Props extends PreferenceMappedProps {
    [ServiceID]: Service;
    browsing: any;

    onNavigate: (path: string, state?: unknown) => void;
}

type FileID = string;

interface State {
    active?: boolean;
    loadedFile?: FileID;
    similars?: Similar[];
    fault?: string;
}

function getFileId(directory: string, file: string): FileID {
    return `${directory}\n${file}`;
}

export class Similars extends React.PureComponent<Props, State> {
    readonly #forceUpdate = (): void => { this.forceUpdate(); };

    private get service(): Service {
        return this.props[ServiceID];
    }

    constructor(props: Props) {
        super(props);
        
        this.state = {};

        this.handleToggleEnabled = this.handleToggleEnabled.bind(this);
        this.renderContent = this.renderContent.bind(this);
    }

    private startGetSimilars(directory: string, file: string) {
        const service = this.service;
        if (service.connected && this.state.active)
            service.requestPhashQuery(directory, file).then(response => {
                // See if we won the write
                const {path: currentDirectory, names} = this.props.browsing.files;
                const currentFile = names[this.props.browsing.focusedFile];
                if (file == currentFile && directory == currentDirectory) {
                    this.setState({
                        loadedFile: getFileId(directory, file),
                        similars: response,
                    });
                }
            },
            (err: Error) => {
                this.setState({
                    loadedFile: getFileId(directory, file),
                    fault: err.message,
                });
            });
    }

    componentDidUpdate(p: Props): void {
        const {path: directory, names} = p.browsing.files;
        const file = names[p.browsing.focusedFile];
        if (this.state.loadedFile !== getFileId(directory, file))
            this.startGetSimilars(directory, file);
    }

    componentDidMount(): void {
        this.service.on("connect", this.#forceUpdate);
        this.props.browsing.on("filefocus", this.#forceUpdate);
    }

    componentWillUnmount(): void {
        this.service.off("connect", this.#forceUpdate);
        this.props.browsing.off("filefocus", this.#forceUpdate);
    }

    private renderThumbnail(s: Similar): React.ReactNode {
        const service = this.props[ServiceID];
        const urls = service.getThumbnailPaths(s.group, s.index);
        return <li key={`${s.group}/${s.index}`}>
            <Image paths={urls} />
            <div className="label">
                <div>
                    <span>{s.group}-{s.index} (&Delta;: {s.diff}/64)</span>
                </div>
                <div>
                    <button title="Compare" onClick={() => this.handleCompare(s)}>
                        <Icon path={mdiCompare} />
                    </button>
                </div>
            </div>
        </li>;
    }

    private renderContent(connected: boolean): React.ReactNode {
        if (!connected)
            return NoConnection;

        const {path: directory, names} = this.props.browsing.files;
        const file = names[this.props.browsing.focusedFile];
        if (getFileId(directory, file) !== this.state.loadedFile)
            return <div className="msg">Loading</div>;

        if (this.state.fault)
            return <div className="notice error">
                <h1>Error</h1>
                <div>{this.state.fault}</div>
            </div>;

        
        if (this.state.similars) {
            const similars = this.state.similars.filter(
                ({diff}) => diff < this.props.maxDiff);

            if (similars.length)
                return <ul className="results">{similars.map(s => this.renderThumbnail(s))}</ul>;
        }

        return <div>No results</div>;
    }

    render(): React.ReactNode {
        const service = this.props[ServiceID];

        const {active} = this.state;
        const className = active
            ? "panel curator similars focus"
            : "panel curator similars";

        return <div className={className}>
            <div className="background">
                <div>
                    <button className="handle" title="Similars" onClick={this.handleToggleEnabled}>
                        <Icon path={mdiEye} />
                    </button>
                </div>
                {active && this.renderContent(service.connected)}
            </div>
        </div>;
    }

    handleToggleEnabled(): void {
        this.setState(({active}) => ({active: !active}));
    }

    handleCompare(s: Similar): void {
        const browsing = this.props.browsing;
        const {path: directory, names} = browsing.files;
        const file = names[browsing.focusedFile];
        const left = this.service.getPath(s.group, s.index);
        this.props.onNavigate(`/compare?left=${left}&right=${directory}/${file}`);
    }
}

export const Definition = {
    id: "similars",
    path: "/stage",
    services: [ServiceID, "browsing"],
    component: Similars,
    selectPreferences: ({
        [maxDiffPrefId]: maxDiff,
    }): PreferenceMappedProps => ({
        maxDiff: maxDiff || defaultMaxDiff,
    }),
}