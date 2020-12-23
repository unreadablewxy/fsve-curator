import React from "react";
import {Service} from "./service";

interface Props {
    service: Service;
    children: (connected: boolean) => React.ReactNode;
}

interface State {
    connected: boolean;
}

export class Connected extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {
            connected: this.props.service.connected(),
        };

        this.handleConnect = this.handleConnect.bind(this);
    }

    componentDidUpdate(p: Props): void {
        if (p.service !== this.props.service) {
            p.service.off("connect", this.handleConnect);
            this.componentDidMount();
        }
    }

    componentDidMount(): void {
        this.props.service.on("connect", this.handleConnect);
    }

    componentWillUnmount(): void {
        this.props.service.off("connect", this.handleConnect);
    }

    render() {
        return this.props.children(this.state.connected);
    }

    private handleConnect(connected: boolean): void {
        this.setState({connected});
    }
}