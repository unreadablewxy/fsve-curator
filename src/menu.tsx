import React from "react";
import {mdiAlphaCBox, mdiPowerPlug, mdiPowerPlugOff} from "@mdi/js";
import {Icon} from "@mdi/react";

import {Connected} from "./connected";
import {service} from "./externals";

interface Props {
    preferences: {};
    onSetPreferences(values: {}): void;
    
    localPreferences: {};
    onTogglePreferenceScope(name: string): void;
}

export class Menu extends React.PureComponent<Props> {
    constructor(props: Props, ...forwarded: unknown[]) {
        super(props, ...forwarded);

        this.handleToggleConnect = this.handleToggleConnect.bind(this);
        this.renderConnectionToggle = this.renderConnectionToggle.bind(this);
    }

    render() {
        return <ul className="menu curator">
            <li>
                <Connected>{this.renderConnectionToggle}</Connected>
            </li>
        </ul>;
    }

    handleToggleConnect(): void {
        if (service.connected())
            service.disconnect();
        else
            service.connect("/run/fs-curator/socket");
    }

    private renderConnectionToggle(connected: boolean): React.ReactNode {
        let icon: string;
        let caption: string;

        if (connected) {
            icon = mdiPowerPlug;
            caption = "Connected";
        } else {
            icon = mdiPowerPlugOff;
            caption = "Disconnected";
        }

        return <button className="toggle" onClick={this.handleToggleConnect}>
            <Icon path={icon} />
            <span>{caption}</span>
        </button>;
    }
}

export const Definition = {
    icon: mdiAlphaCBox,
    label: "Curator",
    component: Menu,
};