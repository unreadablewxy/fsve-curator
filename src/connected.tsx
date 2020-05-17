import React from "react";

import {service} from "./externals";

interface Props {
    children: (connected: boolean) => React.ReactNode;
}

interface State {
    connected: boolean;
}

export class Connected extends React.Component<Props, State> {
    constructor(props: Props, ...forwarded: unknown[]) {
        super(props, ...forwarded);

        this.state = {
            connected: service.connected(),
        };

        this.handleConnect = this.handleConnect.bind(this);
    }

    componentDidMount(): void {
        service.on("connect", this.handleConnect);
    }

    componentWillUnmount(): void {
        service.off("connect", this.handleConnect);
    }

    render() {
        return this.props.children(this.state.connected);
    }

    private handleConnect(connected: boolean): void {
        this.setState({connected});
    }
}