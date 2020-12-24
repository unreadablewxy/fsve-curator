import React from "react";
import {mdiAlphaCBox, mdiPowerPlug, mdiPowerPlugOff} from "@mdi/js";
import {Icon} from "@mdi/react";

import {Connected} from "./connected";
import {Service, id as ServiceID} from "./service";

interface Props {
    [ServiceID]: Service;

    preferences: {};
    onSetPreferences(values: {}): void;
    
    localPreferences: {};
    onTogglePreferenceScope(name: string): void;
}

export class Menu extends React.PureComponent<Props> {
    constructor(props: Props) {
        super(props);

        this.handleToggleConnect = this.handleToggleConnect.bind(this);
        this.renderConnectionToggle = this.renderConnectionToggle.bind(this);
    }

    render() {
        return <ul className="menu curator">
            <Connected service={this.getService()}>{this.renderConnectionToggle}</Connected>
        </ul>;
    }

    handleToggleConnect(): void {
        const service = this.getService();
        if (service.connected())
            service.disconnect();
        else
            service.connect("/run/fs-curator/socket");
    }

    private renderConnectionToggle(connected: boolean): React.ReactNode {
        const service = this.getService();

        let icon: string;
        let caption: string;

        if (connected) {
            icon = mdiPowerPlugOff;
            caption = "Disconnect";
        } else {
            icon = mdiPowerPlug;
            caption = "Connect";
        }

        return <>
            <li>
                <div>{connected ? "Connected, using collection:" : "Not Connected"}</div>
            </li>
            {connected && <li className="textual">{service.collectionPath()}</li>}
            <li>
                <button className="toggle" onClick={this.handleToggleConnect}>
                    <Icon path={icon} />
                    <span>{caption}</span>
                </button>
            </li>
        </>;
    }

    private getService(): Service {
        return this.props[ServiceID];
    }
}

export const Definition = {
    id: "connectivity",
    icon: mdiAlphaCBox,
    label: "Curator",
    services: [ServiceID],
    component: Menu,
};