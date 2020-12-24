import "./similars.sass"
import React from "react";
import {mdiEye} from "@mdi/js";
import {Icon} from "@mdi/react";

import {Connected} from "./connected";
import {Image} from "./image";
import {Similar, Service, id as ServiceID} from "./service";

interface Props {
    [ServiceID]: Service;
    browsing: any;
}

type FileID = string;

interface State {
    enabled?: boolean;
    loadedFile?: FileID;
    similars?: Similar[];
    fault?: string;
}

function getFileId(directory: string, file: string): FileID {
    return `${directory}\n${file}`;
}

export class Similars extends React.PureComponent<Props, State> {
    readonly #forceUpdate = (): void => { this.forceUpdate(); };

    constructor(props: Props) {
        super(props);
        
        this.state = {};

        this.handleToggleEnabled = this.handleToggleEnabled.bind(this);
        this.renderContent = this.renderContent.bind(this);
    }

    private startGetSimilars(directory: string, file: string) {
        const service = this.props[ServiceID];
        if (service.connected() && this.state.enabled)
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

    componentDidUpdate(p: Props, s: State): void {
        const {path: directory, names} = p.browsing.files;
        const file = names[p.browsing.focusedFile];
        if (this.state.loadedFile !== getFileId(directory, file))
            this.startGetSimilars(directory, file);

        this.props.browsing.on("filefocus", this.#forceUpdate);
    }

    componentWillUnmount(): void {
        this.props.browsing.off("filefocus", this.#forceUpdate);
    }

    private renderThumbnail(s: Similar): React.ReactNode {
        const service = this.props[ServiceID];
        const urls = service.getThumbnailPaths(s.group, s.index);
        return <>
            <Image paths={urls} />
            <span>{s.group}-{s.index} (&Delta;: {s.diff}/64)</span>
        </>;
    }

    private renderContent(connected: boolean): React.ReactNode {
        if (!connected)
            return <div className="notice warning">
                <h1>No Curator</h1>
                <div>Please connect to a curator</div>
            </div>;

        const {path: directory, names} = this.props.browsing.files;
        const file = names[this.props.browsing.focusedFile];
        if (getFileId(directory, file) !== this.state.loadedFile)
            return <div className="msg">Loading</div>;

        if (this.state.fault)
            return <div className="notice error">
                <h1>Error</h1>
                <div>{this.state.fault}</div>
            </div>;
        
        if (this.state.similars)
            return <ul>
                {this.state.similars.map(s => <li key={`${s.group}/${s.index}`}>
                    {this.renderThumbnail(s)}
                </li>)}
            </ul>;

        return <div>No results</div>;
    }

    render() {
        const service = this.props[ServiceID];

        const {enabled} = this.state;
        const className = enabled
            ? "panel curator similars focus"
            : "panel curator similars";

        return <span className={className}>
            <span className="background">
                <div>
                    <button onClick={this.handleToggleEnabled}>
                        <Icon path={mdiEye} />
                    </button>
                </div>
                {enabled && <Connected service={service}>
                    {this.renderContent}
                </Connected>}
            </span>
        </span>;
    }

    handleToggleEnabled(): void {
        this.setState(({enabled}) => ({enabled: !enabled}));
    }
}

export const Definition = {
    id: "similars",
    path: "/stage",
    services: [ServiceID, "browsing"],
    component: Similars,
}