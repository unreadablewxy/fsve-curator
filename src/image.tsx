import React from "react";

interface Props {
    paths: string[];
}

interface State {
    tried: number;
}

export class Image extends React.PureComponent<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {
            tried: 0,
        };

        this.handleError = this.handleError.bind(this);
    }

    render(): React.ReactNode {
        return <img alt=""
            src={this.props.paths[this.state.tried]}
            onError={this.handleError}
        />
    }

    handleError(): void {
        this.setState(({tried}, {paths}) => tried < paths.length
            ? {tried: tried + 1}
            : null);
    }
}