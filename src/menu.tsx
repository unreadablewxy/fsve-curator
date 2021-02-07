import "./menu.sass";
import React from "react";
import {mdiAlphaCBox, mdiChevronRight, mdiPowerPlug, mdiPowerPlugOff} from "@mdi/js";
import {Icon} from "@mdi/react";

import {defaultMaxDiff, maxDiffPrefId} from "./constant";
import {Service, id as ServiceID, Hopper} from "./service";

interface PreferenceMappedProps {
    maxDiff: number;
}

interface Props extends PreferenceMappedProps {
    [ServiceID]: Service;

    onSetPreferences(values: {}): void;

    localPreferences: {[k in keyof PreferenceMappedProps]?: boolean};
    onTogglePreferenceScope(name: string): void;
}

export class Menu extends React.PureComponent<Props> {
    private get service(): Service {
        return this.props[ServiceID];
    }

    componentDidMount(): void {
        this.service.on("connect", this.handleConnect);
    }

    componentWillUnmount(): void {
        this.service.off("connect", this.handleConnect);
    }

    private renderHopper({name, path}: Hopper) {
        return <li key={path}>
            <button onClick={() => this.handleOpenHopper(name)}>
                <span>{name}</span>
                <Icon path={mdiChevronRight} />
            </button>
        </li>;
    }

    render() {
        const service = this.service;
        const connected = service.connected;

        let icon: string;
        let caption: string;

        if (connected) {
            icon = mdiPowerPlugOff;
            caption = "Disconnect";
        } else {
            icon = mdiPowerPlug;
            caption = "Connect";
        }

        return <ul className="menu curator">
            <li>
                <label>
                    <div>Max PHash Diff</div>
                    <input type="text" size={1}
                        value={this.props.maxDiff}
                        onChange={this.handleSetMaxDiff}
                    />
                </label>
            </li>
            {connected
                ? <>
                    <li className="textual">Connected, using collection:</li>
                    <li className="textual">{service.collectionPath}</li>
                </>
                : <li className="textual">Not Connected</li>}
            <li>
                <button className="toggle" onClick={this.handleToggleConnect}>
                    <Icon path={icon} />
                    <span>{caption}</span>
                </button>
            </li>
            {connected && <li className="hoppers">
                <label>Hoppers</label>
                <ul>
                    {service.hoppers?.map(h => this.renderHopper(h))}
                </ul>
            </li>}
        </ul>;
    }

    handleConnect = () => {
        this.forceUpdate();
    };

    handleOpenHopper = (name: string) => {
        // TODO
    };

    handleSetMaxDiff = (ev: React.ChangeEvent<HTMLInputElement>) => {
        this.props.onSetPreferences({
            maxDiff: parseInt(ev.target.value),
        });
    };

    handleToggleConnect = () => {
        const service = this.service;
        if (service.connected)
            service.disconnect();
        else
            service.connect("/run/fs-curator/socket");
    };
}

export const Definition = {
    id: "connectivity",
    icon: mdiAlphaCBox,
    label: "Curator",
    services: [ServiceID],
    component: Menu,
    selectPreferences: ({
        [maxDiffPrefId]: maxDiff,
    }): PreferenceMappedProps => ({
        maxDiff: maxDiff || defaultMaxDiff,
    }),
};